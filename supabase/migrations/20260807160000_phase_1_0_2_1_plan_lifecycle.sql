-- Phase 1.0.2.1: safe Plan lifecycle management
-- Draft -> Active or Retired; Active -> Retired; Retired cannot be restored.

create or replace function private.prepare_subscription_plan_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if (select auth.uid()) is null or not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.code := lower(btrim(new.code));
    new.created_at := coalesce(new.created_at, now());
  else
    new.code := old.code;
    new.created_at := old.created_at;
    if old.lifecycle_status = 'retired' and new.lifecycle_status <> 'retired' then
      raise exception 'retired_plan_immutable';
    end if;
    if old.lifecycle_status = 'active' and new.lifecycle_status = 'draft' then
      raise exception 'active_plan_cannot_return_to_draft';
    end if;
  end if;

  new.name := btrim(new.name);
  new.description := btrim(new.description);
  new.is_active := new.lifecycle_status = 'active';
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.prepare_subscription_plan_version_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_plan_code text;
  v_plan_status text;
begin
  if (select auth.uid()) is null or not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.lifecycle_status = 'active' then
    raise exception 'active_plan_version_immutable';
  end if;

  v_plan_code := case when tg_op = 'UPDATE' then old.plan_code else new.plan_code end;
  select lifecycle_status into v_plan_status
  from public.subscription_plans
  where code = v_plan_code;

  if v_plan_status = 'retired' then
    raise exception 'retired_plan_version_forbidden';
  end if;
  if new.lifecycle_status = 'active' and v_plan_status <> 'active' then
    raise exception 'plan_must_be_active_before_version';
  end if;

  if tg_op = 'INSERT' then
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

revoke all on function private.prepare_subscription_plan_write() from public, anon, authenticated;
revoke all on function private.prepare_subscription_plan_version_write() from public, anon, authenticated;
