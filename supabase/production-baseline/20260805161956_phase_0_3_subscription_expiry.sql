-- AVENZO ONE Phase 0.3: Subscription and Expiry Core
-- Expiry is calculated at read time from timestamptz values; no cron is required for display.

create table if not exists public.subscription_plans (
  code text primary key,
  name text not null,
  duration_days integer not null,
  grace_period_days integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_duration_check check (duration_days > 0),
  constraint subscription_plans_grace_check check (grace_period_days >= 0)
);

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plan_code text not null references public.subscription_plans(code) on delete restrict,
  lifecycle_status text not null default 'active',
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  grace_ends_at timestamptz not null,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_subscriptions_status_check check (lifecycle_status in ('active', 'canceled')),
  constraint organization_subscriptions_dates_check check (starts_at < expires_at and expires_at <= grace_ends_at),
  constraint organization_subscriptions_cancel_check check (
    (lifecycle_status = 'active' and canceled_at is null)
    or (lifecycle_status = 'canceled' and canceled_at is not null)
  )
);

create unique index if not exists organization_subscriptions_one_current_idx
  on public.organization_subscriptions (organization_id)
  where lifecycle_status = 'active';

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  event_type text not null,
  previous_status text,
  new_status text not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  performed_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint subscription_events_type_check check (event_type in ('provision', 'renew', 'cancel', 'adjust')),
  constraint subscription_events_reason_check check (length(btrim(reason)) > 0)
);

create index if not exists organization_subscriptions_organization_idx
  on public.organization_subscriptions (organization_id);

create index if not exists organization_subscriptions_expires_idx
  on public.organization_subscriptions (expires_at);

create index if not exists subscription_events_organization_created_idx
  on public.subscription_events (organization_id, created_at desc);

insert into public.subscription_plans
  (code, name, duration_days, grace_period_days, metadata)
values
  ('standard', 'Standard', 30, 3, '{"configurable": true, "pricing": null}'::jsonb)
on conflict (code) do nothing;

alter table public.subscription_plans enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.subscription_events enable row level security;

revoke all on public.subscription_plans, public.organization_subscriptions, public.subscription_events from anon;
grant select on public.subscription_plans to authenticated;
grant select on public.organization_subscriptions to authenticated;
grant select on public.subscription_events to authenticated;
grant insert, update on public.subscription_plans to authenticated;
grant insert, update on public.organization_subscriptions to authenticated;
grant insert on public.subscription_events to authenticated;

create policy "authenticated users can view active subscription plans"
on public.subscription_plans for select to authenticated
using (is_active = true or private.is_platform_admin());

create policy "organization members can view their subscription"
on public.organization_subscriptions for select to authenticated
using (
  private.is_platform_admin()
  or private.has_org_permission(organization_id, 'organization.read')
);

create policy "platform admins can create subscriptions"
on public.organization_subscriptions for insert to authenticated
with check (private.is_platform_admin());

create policy "platform admins can update subscriptions"
on public.organization_subscriptions for update to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

create policy "platform admins can view subscription events"
on public.subscription_events for select to authenticated
using (private.is_platform_admin());

create policy "platform admins can append subscription events"
on public.subscription_events for insert to authenticated
with check (private.is_platform_admin());

create or replace view public.organization_subscription_status
with (security_invoker = true)
as
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
    when now() < s.expires_at then 'active'
    when now() < s.grace_ends_at then 'grace'
    else 'expired'
  end as access_state,
  (now() >= s.expires_at) as is_expired,
  greatest(0, floor(extract(epoch from (s.expires_at - now())) / 86400)::integer) as days_remaining,
  greatest(0, floor(extract(epoch from (s.expires_at - now())) / 3600)::integer) as hours_remaining,
  greatest(0, floor(extract(epoch from (s.expires_at - now())))::bigint) as seconds_remaining,
  o.status as organization_status
from public.organization_subscriptions s
join public.organizations o on o.id = s.organization_id
join public.subscription_plans p on p.code = s.plan_code
where s.lifecycle_status = 'active'
   or s.lifecycle_status = 'canceled';

grant select on public.organization_subscription_status to authenticated;
revoke all on public.organization_subscription_status from anon;

create or replace function public.platform_set_organization_subscription(
  p_organization_id uuid,
  p_plan_code text,
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
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_required';
  end if;

  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'organization_not_found';
  end if;

  if not exists (select 1 from public.subscription_plans where code = p_plan_code and is_active = true) then
    raise exception 'subscription_plan_not_found';
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

  select lifecycle_status into v_previous_status
  from public.organization_subscriptions
  where organization_id = p_organization_id
    and lifecycle_status = 'active'
  for update;

  if v_previous_status is null then
    insert into public.organization_subscriptions
      (organization_id, plan_code, lifecycle_status, starts_at, expires_at, grace_ends_at,
       canceled_at, metadata, created_by)
    values
      (p_organization_id, p_plan_code, p_lifecycle_status, p_starts_at, p_expires_at,
       p_grace_ends_at, case when p_lifecycle_status = 'canceled' then now() else null end,
       coalesce(p_metadata, '{}'::jsonb), (select auth.uid()))
    returning * into v_subscription;
  else
    update public.organization_subscriptions
    set plan_code = p_plan_code,
        lifecycle_status = p_lifecycle_status,
        starts_at = p_starts_at,
        expires_at = p_expires_at,
        grace_ends_at = p_grace_ends_at,
        canceled_at = case when p_lifecycle_status = 'canceled' then coalesce(canceled_at, now()) else null end,
        metadata = coalesce(p_metadata, '{}'::jsonb),
        updated_at = now()
    where organization_id = p_organization_id
      and lifecycle_status = 'active'
    returning * into v_subscription;
  end if;

  insert into public.subscription_events
    (organization_id, subscription_id, event_type, previous_status, new_status, reason, metadata, performed_by)
  values
    (p_organization_id, v_subscription.id, p_event_type, v_previous_status,
     p_lifecycle_status, btrim(p_reason), coalesce(p_metadata, '{}'::jsonb), (select auth.uid()));

  return v_subscription;
end;
$$;

revoke all on function public.platform_set_organization_subscription(uuid, text, timestamptz, timestamptz, timestamptz, text, text, text, jsonb) from public;
revoke all on function public.platform_set_organization_subscription(uuid, text, timestamptz, timestamptz, timestamptz, text, text, text, jsonb) from anon;
grant execute on function public.platform_set_organization_subscription(uuid, text, timestamptz, timestamptz, timestamptz, text, text, text, jsonb) to authenticated;

