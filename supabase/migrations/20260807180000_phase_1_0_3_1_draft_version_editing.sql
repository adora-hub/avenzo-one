alter table public.subscription_plan_versions
  add column if not exists duration_days integer,
  add column if not exists grace_period_days integer;

alter table public.subscription_plan_versions disable trigger prepare_subscription_plan_version_write;

update public.subscription_plan_versions v
set duration_days = p.duration_days,
    grace_period_days = p.grace_period_days
from public.subscription_plans p
where p.code = v.plan_code
  and (v.duration_days is null or v.grace_period_days is null);

alter table public.subscription_plan_versions enable trigger prepare_subscription_plan_version_write;

alter table public.subscription_plan_versions
  alter column duration_days set not null,
  alter column grace_period_days set not null;

alter table public.subscription_plan_versions
  drop constraint if exists subscription_plan_versions_duration_days_check,
  add constraint subscription_plan_versions_duration_days_check check (duration_days > 0),
  drop constraint if exists subscription_plan_versions_grace_period_days_check,
  add constraint subscription_plan_versions_grace_period_days_check check (grace_period_days >= 0);

create or replace function private.prepare_subscription_plan_version_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_plan_code text;
  v_plan_status text;
  v_default_duration integer;
  v_default_grace integer;
begin
  if (select auth.uid()) is null or not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.lifecycle_status = 'active' then
    raise exception 'active_plan_version_immutable';
  end if;
  if tg_op = 'UPDATE' and old.lifecycle_status = 'retired' then
    raise exception 'retired_plan_version_immutable';
  end if;

  v_plan_code := case when tg_op = 'UPDATE' then old.plan_code else new.plan_code end;
  select lifecycle_status, duration_days, grace_period_days
    into v_plan_status, v_default_duration, v_default_grace
  from public.subscription_plans
  where code = v_plan_code;

  if v_plan_status is null then
    raise exception 'subscription_plan_not_found';
  end if;
  if v_plan_status = 'retired' then
    raise exception 'retired_plan_version_forbidden';
  end if;
  if new.lifecycle_status = 'active' and v_plan_status <> 'active' then
    raise exception 'plan_must_be_active_before_version';
  end if;
  if new.lifecycle_status = 'active' and exists (
    select 1
    from public.subscription_plan_features pf
    join public.feature_catalog fc on fc.id = pf.feature_id
    where pf.plan_version_id = new.id
      and fc.lifecycle_status <> 'active'
  ) then
    raise exception 'plan_version_contains_inactive_features';
  end if;

  if tg_op = 'INSERT' then
    new.duration_days := coalesce(new.duration_days, v_default_duration);
    new.grace_period_days := coalesce(new.grace_period_days, v_default_grace);
    new.created_by := (select auth.uid());
    new.updated_by := (select auth.uid());
    new.created_at := coalesce(new.created_at, now());
  else
    new.id := old.id;
    new.plan_code := old.plan_code;
    new.version_no := old.version_no;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := (select auth.uid());
  end if;
  new.plan_code := lower(btrim(new.plan_code));
  new.label := btrim(new.label);
  new.description := btrim(new.description);
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.prepare_subscription_plan_version_write() from public, anon, authenticated;

comment on column public.subscription_plan_versions.duration_days is
  'Immutable subscription duration snapshot after this plan version becomes active.';
comment on column public.subscription_plan_versions.grace_period_days is
  'Immutable grace-period snapshot after this plan version becomes active.';
