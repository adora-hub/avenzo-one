-- Phase 1.1.3.7.1: server-enforced Stripe Live safety control.
-- This phase deliberately cannot enable Live Checkout. Both allowed states keep
-- emergency_stop=true and the existing application code still requires sk_test_.

create table public.billing_live_safety_controls (
  provider text primary key,
  state text not null default 'locked',
  emergency_stop boolean not null default true,
  reason text not null,
  version bigint not null default 1,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_by_email text,
  updated_at timestamptz not null default now(),
  constraint billing_live_safety_provider_check check (provider = 'stripe'),
  constraint billing_live_safety_state_check check (state in ('locked', 'review_ready')),
  constraint billing_live_safety_emergency_stop_check check (emergency_stop is true),
  constraint billing_live_safety_reason_check check (length(btrim(reason)) between 10 and 2000),
  constraint billing_live_safety_version_check check (version > 0)
);

create table public.billing_live_safety_events (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null unique,
  provider text not null,
  action text not null,
  previous_state text not null,
  next_state text not null,
  emergency_stop boolean not null default true,
  reason text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  created_at timestamptz not null default now(),
  constraint billing_live_safety_event_provider_check check (provider = 'stripe'),
  constraint billing_live_safety_event_action_check check (action in ('lock', 'mark_review_ready')),
  constraint billing_live_safety_event_previous_check check (previous_state in ('locked', 'review_ready')),
  constraint billing_live_safety_event_next_check check (next_state in ('locked', 'review_ready')),
  constraint billing_live_safety_event_stop_check check (emergency_stop is true),
  constraint billing_live_safety_event_reason_check check (length(btrim(reason)) between 10 and 2000),
  constraint billing_live_safety_event_actor_email_check check (position('@' in actor_email) > 1)
);

create index billing_live_safety_events_created_idx
  on public.billing_live_safety_events (created_at desc, id desc);
create index billing_live_safety_events_actor_idx
  on public.billing_live_safety_events (actor_user_id, created_at desc);
create index billing_live_safety_controls_updated_by_idx
  on public.billing_live_safety_controls (updated_by)
  where updated_by is not null;

insert into public.billing_live_safety_controls (provider, state, emergency_stop, reason)
values ('stripe', 'locked', true, 'Phase 1.1.3.7.1 เริ่มต้นด้วยการล็อกรับเงินจริง')
on conflict (provider) do nothing;

alter table public.billing_live_safety_controls enable row level security;
alter table public.billing_live_safety_events enable row level security;

revoke all on public.billing_live_safety_controls from public, anon, authenticated;
revoke all on public.billing_live_safety_events from public, anon, authenticated;
grant select on public.billing_live_safety_controls to authenticated;
grant select on public.billing_live_safety_events to authenticated;

create policy "aal2 platform admins read billing live safety control"
on public.billing_live_safety_controls for select to authenticated
using (private.is_platform_admin());

create policy "aal2 platform admins read billing live safety events"
on public.billing_live_safety_events for select to authenticated
using (private.is_platform_admin());

create or replace function public.platform_set_billing_live_safety_state(
  p_command_id uuid,
  p_next_state text,
  p_reason text
)
returns public.billing_live_safety_controls
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_control public.billing_live_safety_controls;
  v_existing_command uuid;
  v_action text;
  v_latest_review_complete boolean;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if p_next_state not in ('locked', 'review_ready') then
    raise exception 'billing_live_state_not_allowed';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then
    raise exception 'billing_live_reason_invalid';
  end if;

  select command_id into v_existing_command
  from public.billing_live_safety_events
  where command_id = p_command_id;
  if v_existing_command is not null then
    select * into v_control
    from public.billing_live_safety_controls
    where provider = 'stripe';
    return v_control;
  end if;

  select * into v_control
  from public.billing_live_safety_controls
  where provider = 'stripe'
  for update;

  select (manual_status = 'manual_complete')
  into v_latest_review_complete
  from public.billing_production_readiness_reviews
  order by created_at desc, id desc
  limit 1;

  if p_next_state = 'review_ready'
     and coalesce(v_latest_review_complete, false) is not true then
    raise exception 'billing_readiness_manual_review_required';
  end if;

  v_action := case when p_next_state = 'locked' then 'lock' else 'mark_review_ready' end;

  insert into public.billing_live_safety_events (
    command_id, provider, action, previous_state, next_state,
    emergency_stop, reason, actor_user_id, actor_email
  ) values (
    p_command_id, 'stripe', v_action, v_control.state, p_next_state,
    true, btrim(p_reason), auth.uid(), coalesce(auth.jwt() ->> 'email', '')
  );

  update public.billing_live_safety_controls
  set state = p_next_state,
      emergency_stop = true,
      reason = btrim(p_reason),
      version = version + 1,
      updated_by = auth.uid(),
      updated_by_email = coalesce(auth.jwt() ->> 'email', ''),
      updated_at = now()
  where provider = 'stripe'
  returning * into v_control;

  return v_control;
end;
$$;

revoke all on function public.platform_set_billing_live_safety_state(uuid, text, text)
  from public, anon;
grant execute on function public.platform_set_billing_live_safety_state(uuid, text, text)
  to authenticated;

comment on table public.billing_live_safety_controls is
  'Singleton Stripe safety state. Phase 1.1.3.7.1 enforces emergency_stop=true and cannot enable Live Checkout.';
comment on table public.billing_live_safety_events is
  'Immutable AAL2 Platform Admin audit events for Stripe Live safety-state changes.';
comment on function public.platform_set_billing_live_safety_state(uuid, text, text) is
  'Locks Stripe Live or marks readiness for the next review while keeping emergency_stop=true.';
