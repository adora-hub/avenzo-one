-- AVENZO ONE Phase 1.0.4.2: subscription lifecycle transitions, Thai-friendly UI support, and idempotency.

alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_status_check,
  add constraint organization_subscriptions_status_check
    check (lifecycle_status in ('active', 'suspended', 'canceled')),
  drop constraint if exists organization_subscriptions_cancel_check,
  add constraint organization_subscriptions_cancel_check
    check (
      (lifecycle_status in ('active', 'suspended') and canceled_at is null)
      or (lifecycle_status = 'canceled' and canceled_at is not null)
    );

alter table public.subscription_events
  drop constraint if exists subscription_events_type_check,
  add constraint subscription_events_type_check
    check (event_type in ('provision', 'renew', 'cancel', 'adjust', 'suspend', 'resume'));

drop index if exists public.organization_subscriptions_one_current_idx;
create unique index organization_subscriptions_one_current_idx
  on public.organization_subscriptions (organization_id)
  where lifecycle_status in ('active', 'suspended');

create unique index if not exists subscription_events_command_id_unique_idx
  on public.subscription_events ((metadata ->> 'command_id'))
  where metadata ? 'command_id';

create or replace function public.platform_transition_organization_subscription(
  p_organization_id uuid,
  p_plan_code text,
  p_plan_version_id uuid,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_grace_ends_at timestamptz,
  p_event_type text,
  p_reason text,
  p_command_id uuid,
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
  v_target_status text;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then
    raise exception 'subscription_command_id_required';
  end if;
  if p_event_type not in ('provision', 'renew', 'cancel', 'adjust', 'suspend', 'resume') then
    raise exception 'invalid_subscription_event';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'subscription_reason_required';
  end if;
  if p_starts_at >= p_expires_at or p_expires_at > p_grace_ends_at then
    raise exception 'invalid_subscription_dates';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'organization_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 1042));

  select s.* into v_subscription
  from public.subscription_events e
  join public.organization_subscriptions s on s.id = e.subscription_id
  where e.metadata ->> 'command_id' = p_command_id::text
  order by e.created_at desc
  limit 1;

  if v_subscription.id is not null then
    return v_subscription;
  end if;

  select s.* into v_subscription
  from public.organization_subscriptions s
  where s.organization_id = p_organization_id
    and s.lifecycle_status in ('active', 'suspended')
  order by s.updated_at desc
  limit 1
  for update;

  v_previous_status := v_subscription.lifecycle_status;
  v_previous_version_id := v_subscription.plan_version_id;
  v_target_status := case
    when p_event_type = 'suspend' then 'suspended'
    when p_event_type = 'cancel' then 'canceled'
    else 'active'
  end;

  if v_subscription.id is null then
    if p_event_type <> 'provision' then
      raise exception 'current_subscription_required';
    end if;
    if not exists (
      select 1 from public.subscription_plan_versions
      where id = p_plan_version_id
        and plan_code = lower(btrim(p_plan_code))
        and lifecycle_status = 'active'
    ) then
      raise exception 'active_plan_version_required';
    end if;

    insert into public.organization_subscriptions (
      organization_id, plan_code, plan_version_id, lifecycle_status,
      starts_at, expires_at, grace_ends_at, canceled_at, metadata, created_by
    )
    values (
      p_organization_id, lower(btrim(p_plan_code)), p_plan_version_id, 'active',
      p_starts_at, p_expires_at, p_grace_ends_at, null,
      coalesce(p_metadata, '{}'::jsonb), (select auth.uid())
    )
    returning * into v_subscription;
  else
    if p_event_type = 'provision' then
      raise exception 'subscription_already_exists';
    end if;
    if p_event_type in ('renew', 'adjust') and v_previous_status <> 'active' then
      raise exception 'active_subscription_required';
    end if;
    if p_event_type = 'suspend' and v_previous_status <> 'active' then
      raise exception 'active_subscription_required';
    end if;
    if p_event_type = 'resume' and v_previous_status <> 'suspended' then
      raise exception 'suspended_subscription_required';
    end if;
    if p_event_type in ('renew', 'adjust') and not exists (
      select 1 from public.subscription_plan_versions
      where id = p_plan_version_id
        and plan_code = lower(btrim(p_plan_code))
        and lifecycle_status = 'active'
    ) then
      raise exception 'active_plan_version_required';
    end if;
    if p_event_type in ('suspend', 'resume', 'cancel')
      and (p_plan_version_id is distinct from v_subscription.plan_version_id
        or lower(btrim(p_plan_code)) is distinct from v_subscription.plan_code) then
      raise exception 'lifecycle_action_plan_change_forbidden';
    end if;

    update public.organization_subscriptions
    set plan_code = case when p_event_type in ('renew', 'adjust') then lower(btrim(p_plan_code)) else plan_code end,
        plan_version_id = case when p_event_type in ('renew', 'adjust') then p_plan_version_id else plan_version_id end,
        lifecycle_status = v_target_status,
        starts_at = case when p_event_type in ('renew', 'adjust') then p_starts_at else starts_at end,
        expires_at = case when p_event_type in ('renew', 'adjust') then p_expires_at else expires_at end,
        grace_ends_at = case when p_event_type in ('renew', 'adjust') then p_grace_ends_at else grace_ends_at end,
        canceled_at = case when v_target_status = 'canceled' then now() else null end,
        metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
        updated_at = now()
    where id = v_subscription.id
    returning * into v_subscription;
  end if;

  insert into public.subscription_events (
    organization_id, subscription_id, event_type, previous_status,
    new_status, reason, metadata, performed_by
  )
  values (
    p_organization_id, v_subscription.id, p_event_type, v_previous_status,
    v_target_status, btrim(p_reason),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'phase', '1.0.4.2',
      'command_id', p_command_id,
      'previous_plan_version_id', v_previous_version_id,
      'plan_version_id', v_subscription.plan_version_id
    ),
    (select auth.uid())
  );

  return v_subscription;
end;
$$;

revoke all on function public.platform_transition_organization_subscription(
  uuid, text, uuid, timestamptz, timestamptz, timestamptz, text, text, uuid, jsonb
) from public, anon;
grant execute on function public.platform_transition_organization_subscription(
  uuid, text, uuid, timestamptz, timestamptz, timestamptz, text, text, uuid, jsonb
) to authenticated;

revoke execute on function public.platform_set_organization_subscription_versioned(
  uuid, text, uuid, timestamptz, timestamptz, timestamptz, text, text, text, jsonb
) from authenticated;

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
    and s.lifecycle_status in ('active', 'suspended')
  order by s.updated_at desc
  limit 1;

  if v_subscription.lifecycle_status = 'suspended' then
    raise exception 'subscription_suspended' using errcode = 'P0001';
  end if;

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
      when s.lifecycle_status = 'suspended' then 'suspended'
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
  where s.lifecycle_status in ('active', 'suspended')
  group by s.organization_id, s.id, s.plan_code, p.name, s.plan_version_id, v.label,
    s.lifecycle_status, s.expires_at, s.grace_ends_at
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
    when a.access_state in ('suspended', 'expired') then false
    when not coalesce(a.enabled_value, a.max_count is not null, false) then false
    when a.max_count is not null and coalesce(bt.current_count, 0) >= a.max_count then false
    else true
  end as can_create,
  case
    when a.plan_version_id is null then 'plan_version_not_assigned'
    when a.access_state = 'suspended' then 'subscription_suspended'
    when a.access_state = 'expired' then 'subscription_expired'
    when not coalesce(a.enabled_value, a.max_count is not null, false) then 'feature_branches_disabled'
    when a.max_count is not null and coalesce(bt.current_count, 0) >= a.max_count then 'feature_branches_limit_reached'
    else 'allowed'
  end as reason
from assigned a
left join branch_totals bt on bt.organization_id = a.organization_id;

revoke all on public.organization_branch_entitlements from public, anon, authenticated;
grant select on public.organization_branch_entitlements to authenticated;

comment on function public.platform_transition_organization_subscription(
  uuid, text, uuid, timestamptz, timestamptz, timestamptz, text, text, uuid, jsonb
) is 'Phase 1.0.4.2 guarded and idempotent subscription lifecycle transition for AAL2 Platform Admin.';
comment on index public.subscription_events_command_id_unique_idx is
  'Prevents duplicate lifecycle events when a client retries the same command.';
