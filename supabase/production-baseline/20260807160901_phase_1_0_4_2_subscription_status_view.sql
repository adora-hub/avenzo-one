create or replace view public.organization_subscription_status
with (security_invoker = true)
as
with ranked as (
  select
    s.*,
    row_number() over (
      partition by s.organization_id
      order by
        case when s.lifecycle_status in ('active', 'suspended') then 0 else 1 end,
        s.updated_at desc
    ) as row_rank
  from public.organization_subscriptions s
  where s.lifecycle_status in ('active', 'suspended', 'canceled')
)
select
  s.organization_id,
  s.id as subscription_id,
  s.plan_code,
  p.name as plan_name,
  s.lifecycle_status,
  s.starts_at,
  s.expires_at,
  s.grace_ends_at,
  case
    when o.status <> 'active' then 'blocked_by_platform'
    when s.lifecycle_status = 'canceled' then 'canceled'
    when s.lifecycle_status = 'suspended' then 'suspended'
    when jsonb_typeof(s.metadata -> 'trial_ends_at') = 'string'
      and now() < (s.metadata ->> 'trial_ends_at')::timestamptz then 'trial'
    when now() < s.expires_at then 'active'
    when now() < s.grace_ends_at then 'grace'
    else 'expired'
  end as access_state,
  (now() >= s.expires_at) as is_expired,
  greatest(0, floor(extract(epoch from (s.expires_at - now())) / 86400)::integer) as days_remaining,
  greatest(0, floor(extract(epoch from (s.expires_at - now())) / 3600)::integer) as hours_remaining,
  greatest(0, floor(extract(epoch from (s.expires_at - now())))::bigint) as seconds_remaining,
  o.status as organization_status
from ranked s
join public.organizations o on o.id = s.organization_id
join public.subscription_plans p on p.code = s.plan_code
where s.row_rank = 1;

grant select on public.organization_subscription_status to authenticated;
revoke all on public.organization_subscription_status from anon;

comment on view public.organization_subscription_status is
  'Phase 1.0.4.2 one-row-per-organization subscription status with trial, suspended and canceled lifecycle labels.';
