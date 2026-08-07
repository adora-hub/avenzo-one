-- AVENZO ONE Phase 1.0.3: assign versioned entitlements and enforce branch limits.
-- Existing subscriptions remain in compatibility mode until an active Plan Version is assigned.

alter table public.organization_subscriptions
  add column if not exists plan_version_id uuid
  references public.subscription_plan_versions(id) on delete restrict;

create index if not exists organization_subscriptions_plan_version_idx
  on public.organization_subscriptions (plan_version_id);

create or replace function private.validate_subscription_plan_version()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_plan_code text;
  v_version_status text;
begin
  if new.plan_version_id is null then
    return new;
  end if;

  select plan_code, lifecycle_status
    into v_plan_code, v_version_status
  from public.subscription_plan_versions
  where id = new.plan_version_id;

  if v_plan_code is null then
    raise exception 'plan_version_not_found' using errcode = '23503';
  end if;
  if v_plan_code <> new.plan_code then
    raise exception 'plan_version_plan_mismatch' using errcode = '23514';
  end if;
  if v_version_status <> 'active' then
    raise exception 'active_plan_version_required' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_subscription_plan_version() from public, anon, authenticated;

drop trigger if exists validate_subscription_plan_version on public.organization_subscriptions;
create trigger validate_subscription_plan_version
before insert or update of plan_code, plan_version_id on public.organization_subscriptions
for each row execute function private.validate_subscription_plan_version();

create or replace function private.enforce_branch_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_subscription public.organization_subscriptions;
  v_enabled boolean;
  v_max_count integer;
  v_current_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select s.* into v_subscription
  from public.organization_subscriptions s
  where s.organization_id = new.organization_id
    and s.lifecycle_status = 'active'
  order by s.created_at desc
  limit 1;

  -- Compatibility mode: Phase 0 subscriptions have no version assignment yet.
  if v_subscription.id is null or v_subscription.plan_version_id is null then
    return new;
  end if;

  if now() >= v_subscription.grace_ends_at then
    raise exception 'subscription_expired' using errcode = 'P0001';
  end if;

  select
    bool_or(pf.boolean_value) filter (where fc.feature_key = 'branches.enabled'),
    max(pf.integer_value) filter (where fc.feature_key = 'branches.max_count')
  into v_enabled, v_max_count
  from public.subscription_plan_features pf
  join public.feature_catalog fc on fc.id = pf.feature_id
  where pf.plan_version_id = v_subscription.plan_version_id
    and fc.lifecycle_status = 'active'
    and fc.feature_key in ('branches.enabled', 'branches.max_count');

  -- A configured maximum implies the branch feature is enabled unless explicitly disabled.
  v_enabled := coalesce(v_enabled, v_max_count is not null, false);
  if not v_enabled then
    raise exception 'feature_branches_disabled' using errcode = 'P0001';
  end if;

  if v_max_count is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 0));
    select count(*)::integer into v_current_count
    from public.branches
    where organization_id = new.organization_id;

    if v_current_count >= v_max_count then
      raise exception 'feature_branches_limit_reached' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_branch_entitlement() from public, anon, authenticated;

drop trigger if exists enforce_branch_entitlement on public.branches;
create trigger enforce_branch_entitlement
before insert on public.branches
for each row execute function private.enforce_branch_entitlement();

create or replace view public.organization_branch_entitlements
with (security_invoker = true)
as
with assigned as (
  select
    s.organization_id,
    s.id as subscription_id,
    s.plan_code,
    p.name as plan_name,
    s.plan_version_id,
    v.label as plan_version_label,
    case
      when s.plan_version_id is null then 'legacy'
      when now() < s.expires_at then 'active'
      when now() < s.grace_ends_at then 'grace'
      else 'expired'
    end as access_state,
    bool_or(pf.boolean_value) filter (where fc.feature_key = 'branches.enabled') as enabled_value,
    max(pf.integer_value) filter (where fc.feature_key = 'branches.max_count') as max_count
  from public.organization_subscriptions s
  join public.subscription_plans p on p.code = s.plan_code
  left join public.subscription_plan_versions v on v.id = s.plan_version_id
  left join public.subscription_plan_features pf on pf.plan_version_id = s.plan_version_id
  left join public.feature_catalog fc on fc.id = pf.feature_id
    and fc.lifecycle_status = 'active'
    and fc.feature_key in ('branches.enabled', 'branches.max_count')
  where s.lifecycle_status = 'active'
  group by s.organization_id, s.id, s.plan_code, p.name, s.plan_version_id, v.label,
    s.expires_at, s.grace_ends_at
), branch_totals as (
  select organization_id, count(*)::integer as current_count
  from public.branches
  group by organization_id
)
select
  a.organization_id,
  a.subscription_id,
  a.plan_code,
  a.plan_name,
  a.plan_version_id,
  a.plan_version_label,
  a.access_state,
  (a.enabled_value is not null or a.max_count is not null) as is_configured,
  coalesce(a.enabled_value, a.max_count is not null, false) as branches_enabled,
  a.max_count,
  coalesce(bt.current_count, 0) as current_count,
  case
    when a.plan_version_id is null then true
    when a.access_state = 'expired' then false
    when not coalesce(a.enabled_value, a.max_count is not null, false) then false
    when a.max_count is not null and coalesce(bt.current_count, 0) >= a.max_count then false
    else true
  end as can_create,
  case
    when a.plan_version_id is null then 'plan_version_not_assigned'
    when a.access_state = 'expired' then 'subscription_expired'
    when not coalesce(a.enabled_value, a.max_count is not null, false) then 'feature_branches_disabled'
    when a.max_count is not null and coalesce(bt.current_count, 0) >= a.max_count then 'feature_branches_limit_reached'
    else 'allowed'
  end as reason
from assigned a
left join branch_totals bt on bt.organization_id = a.organization_id;

revoke all on public.organization_branch_entitlements from public, anon, authenticated;
grant select on public.organization_branch_entitlements to authenticated;

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

create or replace function public.platform_set_organization_subscription_versioned(
  p_organization_id uuid,
  p_plan_code text,
  p_plan_version_id uuid,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_grace_ends_at timestamptz,
  p_lifecycle_status text,
  p_event_type text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.organization_subscriptions
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_subscription public.organization_subscriptions;
  v_previous_status text;
  v_previous_version_id uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'organization_not_found';
  end if;
  if not exists (
    select 1 from public.subscription_plan_versions
    where id = p_plan_version_id and plan_code = p_plan_code and lifecycle_status = 'active'
  ) then
    raise exception 'active_plan_version_required';
  end if;
  if p_lifecycle_status not in ('active', 'canceled') then
    raise exception 'invalid_subscription_status';
  end if;
  if p_event_type not in ('provision', 'renew', 'cancel', 'adjust') then
    raise exception 'invalid_subscription_event';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'subscription_reason_required';
  end if;
  if p_starts_at >= p_expires_at or p_expires_at > p_grace_ends_at then
    raise exception 'invalid_subscription_dates';
  end if;

  select lifecycle_status, plan_version_id
    into v_previous_status, v_previous_version_id
  from public.organization_subscriptions
  where organization_id = p_organization_id and lifecycle_status = 'active'
  for update;

  if v_previous_status is null then
    insert into public.organization_subscriptions
      (organization_id, plan_code, plan_version_id, lifecycle_status, starts_at, expires_at,
       grace_ends_at, canceled_at, metadata, created_by)
    values
      (p_organization_id, p_plan_code, p_plan_version_id, p_lifecycle_status, p_starts_at,
       p_expires_at, p_grace_ends_at,
       case when p_lifecycle_status = 'canceled' then now() else null end,
       coalesce(p_metadata, '{}'::jsonb), (select auth.uid()))
    returning * into v_subscription;
  else
    update public.organization_subscriptions
    set plan_code = p_plan_code,
        plan_version_id = p_plan_version_id,
        lifecycle_status = p_lifecycle_status,
        starts_at = p_starts_at,
        expires_at = p_expires_at,
        grace_ends_at = p_grace_ends_at,
        canceled_at = case when p_lifecycle_status = 'canceled' then coalesce(canceled_at, now()) else null end,
        metadata = coalesce(p_metadata, '{}'::jsonb),
        updated_at = now()
    where organization_id = p_organization_id and lifecycle_status = 'active'
    returning * into v_subscription;
  end if;

  insert into public.subscription_events
    (organization_id, subscription_id, event_type, previous_status, new_status, reason, metadata, performed_by)
  values
    (p_organization_id, v_subscription.id, p_event_type, v_previous_status,
     p_lifecycle_status, btrim(p_reason),
     coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
       'previous_plan_version_id', v_previous_version_id,
       'plan_version_id', p_plan_version_id
     ),
     (select auth.uid()));

  return v_subscription;
end;
$$;

revoke all on function public.platform_set_organization_subscription_versioned(
  uuid, text, uuid, timestamptz, timestamptz, timestamptz, text, text, text, jsonb
) from public, anon;
grant execute on function public.platform_set_organization_subscription_versioned(
  uuid, text, uuid, timestamptz, timestamptz, timestamptz, text, text, text, jsonb
) to authenticated;

comment on column public.organization_subscriptions.plan_version_id is
  'Active immutable Plan Version that supplies effective feature entitlements; null is legacy compatibility mode.';
comment on view public.organization_branch_entitlements is
  'RLS-aware branch entitlement and usage summary for each current organization subscription.';
