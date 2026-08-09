-- Phase 1.1.3.7.4: two-person approval for a future limited Live pilot.
-- Approval is recorded, but this phase deliberately keeps pilot_enabled=false
-- and emergency_stop=true. It cannot enable Live Checkout or accept real money.

create table public.billing_live_activation_requests (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  status text not null default 'pending',
  policy_version bigint not null,
  max_amount_per_charge numeric(14,2) not null,
  max_total_amount numeric(14,2) not null,
  max_successful_charges integer not null,
  tester_count integer not null,
  request_reason text not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_by_email text not null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_by_email text,
  review_reason text,
  reviewed_at timestamptz,
  constraint billing_live_activation_provider_check check (provider = 'stripe'),
  constraint billing_live_activation_status_check check (
    status in ('pending', 'approved', 'rejected', 'canceled', 'expired')
  ),
  constraint billing_live_activation_policy_version_check check (policy_version > 0),
  constraint billing_live_activation_charge_check check (max_amount_per_charge > 0),
  constraint billing_live_activation_total_check check (max_total_amount >= max_amount_per_charge),
  constraint billing_live_activation_count_check check (max_successful_charges between 1 and 100),
  constraint billing_live_activation_tester_count_check check (tester_count > 0),
  constraint billing_live_activation_request_reason_check check (length(btrim(request_reason)) between 10 and 2000),
  constraint billing_live_activation_requester_email_check check (position('@' in requested_by_email) > 1),
  constraint billing_live_activation_expiry_check check (expires_at > requested_at),
  constraint billing_live_activation_review_shape_check check (
    (status = 'pending' and reviewed_by is null and reviewed_by_email is null and review_reason is null and reviewed_at is null)
    or
    (status <> 'pending' and reviewed_at is not null and review_reason is not null and length(btrim(review_reason)) between 10 and 2000)
  ),
  constraint billing_live_activation_reviewer_email_check check (
    reviewed_by_email is null or position('@' in reviewed_by_email) > 1
  ),
  constraint billing_live_activation_distinct_approver_check check (
    status <> 'approved' or reviewed_by <> requested_by
  )
);

create unique index billing_live_activation_one_pending_idx
  on public.billing_live_activation_requests (provider)
  where status = 'pending';
create index billing_live_activation_requested_by_idx
  on public.billing_live_activation_requests (requested_by, requested_at desc);
create index billing_live_activation_reviewed_by_idx
  on public.billing_live_activation_requests (reviewed_by, reviewed_at desc)
  where reviewed_by is not null;
create index billing_live_activation_created_idx
  on public.billing_live_activation_requests (requested_at desc, id desc);

create table public.billing_live_activation_events (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null unique,
  request_id uuid not null references public.billing_live_activation_requests(id) on delete restrict,
  provider text not null default 'stripe',
  action text not null,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  created_at timestamptz not null default now(),
  constraint billing_live_activation_event_provider_check check (provider = 'stripe'),
  constraint billing_live_activation_event_action_check check (
    action in ('request', 'approve', 'reject', 'cancel', 'expire')
  ),
  constraint billing_live_activation_event_reason_check check (length(btrim(reason)) between 10 and 2000),
  constraint billing_live_activation_event_details_check check (jsonb_typeof(details) = 'object'),
  constraint billing_live_activation_event_actor_email_check check (position('@' in actor_email) > 1)
);

create index billing_live_activation_events_request_idx
  on public.billing_live_activation_events (request_id, created_at desc);
create index billing_live_activation_events_actor_idx
  on public.billing_live_activation_events (actor_user_id, created_at desc);
create index billing_live_activation_events_created_idx
  on public.billing_live_activation_events (created_at desc, id desc);

alter table public.billing_live_activation_requests enable row level security;
alter table public.billing_live_activation_events enable row level security;

revoke all on public.billing_live_activation_requests from public, anon, authenticated;
revoke all on public.billing_live_activation_events from public, anon, authenticated;
grant select on public.billing_live_activation_requests to authenticated;
grant select on public.billing_live_activation_events to authenticated;

create policy "aal2 platform admins read billing live activation requests"
on public.billing_live_activation_requests for select to authenticated
using ((select private.is_platform_admin()));

create policy "aal2 platform admins read billing live activation events"
on public.billing_live_activation_events for select to authenticated
using ((select private.is_platform_admin()));

create or replace function public.platform_request_billing_live_activation(
  p_command_id uuid,
  p_reason text
)
returns public.billing_live_activation_requests
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_request public.billing_live_activation_requests;
  v_policy public.billing_live_rollout_policies;
  v_control public.billing_live_safety_controls;
  v_tester_count integer;
  v_admin_count integer;
  v_readiness_status text;
  v_actor_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then
    raise exception 'billing_live_reason_invalid';
  end if;

  select r.* into v_request
  from public.billing_live_activation_events e
  join public.billing_live_activation_requests r on r.id = e.request_id
  where e.command_id = p_command_id;
  if v_request.id is not null then return v_request; end if;

  select * into v_policy
  from public.billing_live_rollout_policies
  where provider = 'stripe'
  for update;

  select * into v_control
  from public.billing_live_safety_controls
  where provider = 'stripe'
  for update;

  select manual_status into v_readiness_status
  from public.billing_production_readiness_reviews
  order by created_at desc
  limit 1;

  select count(*)::integer into v_tester_count
  from public.billing_live_testers
  where provider = 'stripe' and active is true;

  select count(*)::integer into v_admin_count
  from public.platform_admins
  where status = 'active';

  if v_policy.provider is null or v_control.provider is null then
    raise exception 'billing_live_control_missing';
  end if;
  if v_policy.pilot_enabled is true or v_control.emergency_stop is false then
    raise exception 'billing_live_not_safely_locked';
  end if;
  if v_control.state <> 'review_ready' or v_readiness_status <> 'manual_complete' then
    raise exception 'billing_live_readiness_required';
  end if;
  if v_tester_count < 1 then
    raise exception 'billing_live_active_tester_required';
  end if;
  if v_admin_count < 2 then
    raise exception 'billing_live_two_active_admins_required';
  end if;
  if exists (
    select 1 from public.billing_live_activation_requests
    where provider = 'stripe' and status = 'pending' and expires_at > now()
  ) then
    raise exception 'billing_live_approval_pending_exists';
  end if;

  insert into public.billing_live_activation_events (
    command_id, request_id, action, reason, details, actor_user_id, actor_email
  )
  select
    gen_random_uuid(), id, 'expire',
    'คำขอหมดอายุก่อนเริ่มคำขออนุมัติรอบใหม่',
    jsonb_build_object('pilot_enabled', false, 'emergency_stop', true),
    auth.uid(), v_actor_email
  from public.billing_live_activation_requests
  where provider = 'stripe' and status = 'pending' and expires_at <= now();

  update public.billing_live_activation_requests
  set status = 'expired',
      reviewed_by = auth.uid(),
      reviewed_by_email = v_actor_email,
      review_reason = 'คำขอหมดอายุก่อนเริ่มคำขออนุมัติรอบใหม่',
      reviewed_at = now()
  where provider = 'stripe' and status = 'pending' and expires_at <= now();

  insert into public.billing_live_activation_requests (
    provider, policy_version, max_amount_per_charge, max_total_amount,
    max_successful_charges, tester_count, request_reason,
    requested_by, requested_by_email, expires_at
  ) values (
    'stripe', v_policy.version, v_policy.max_amount_per_charge, v_policy.max_total_amount,
    v_policy.max_successful_charges, v_tester_count, btrim(p_reason),
    auth.uid(), v_actor_email, now() + interval '24 hours'
  ) returning * into v_request;

  insert into public.billing_live_activation_events (
    command_id, request_id, action, reason, details, actor_user_id, actor_email
  ) values (
    p_command_id, v_request.id, 'request', btrim(p_reason),
    jsonb_build_object(
      'policy_version', v_request.policy_version,
      'max_amount_per_charge', v_request.max_amount_per_charge,
      'max_total_amount', v_request.max_total_amount,
      'max_successful_charges', v_request.max_successful_charges,
      'tester_count', v_request.tester_count,
      'expires_at', v_request.expires_at,
      'pilot_enabled', false,
      'emergency_stop', true
    ),
    auth.uid(), v_actor_email
  );

  return v_request;
end;
$$;

create or replace function public.platform_review_billing_live_activation(
  p_command_id uuid,
  p_request_id uuid,
  p_decision text,
  p_reason text
)
returns public.billing_live_activation_requests
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_request public.billing_live_activation_requests;
  v_existing public.billing_live_activation_requests;
  v_action text;
  v_status text;
  v_policy public.billing_live_rollout_policies;
  v_control public.billing_live_safety_controls;
  v_tester_count integer;
  v_readiness_status text;
  v_actor_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if p_request_id is null then raise exception 'billing_live_approval_request_required'; end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'billing_live_approval_decision_invalid';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then
    raise exception 'billing_live_reason_invalid';
  end if;

  select r.* into v_existing
  from public.billing_live_activation_events e
  join public.billing_live_activation_requests r on r.id = e.request_id
  where e.command_id = p_command_id;
  if v_existing.id is not null then return v_existing; end if;

  select * into v_request
  from public.billing_live_activation_requests
  where id = p_request_id and provider = 'stripe'
  for update;

  if v_request.id is null then raise exception 'billing_live_approval_not_found'; end if;
  if v_request.status <> 'pending' then raise exception 'billing_live_approval_not_pending'; end if;
  if v_request.expires_at <= now() then
    update public.billing_live_activation_requests
    set status = 'expired',
        reviewed_by = auth.uid(),
        reviewed_by_email = v_actor_email,
        review_reason = 'คำขออนุมัติหมดอายุเกิน 24 ชั่วโมง',
        reviewed_at = now()
    where id = v_request.id
    returning * into v_request;

    insert into public.billing_live_activation_events (
      command_id, request_id, action, reason, details, actor_user_id, actor_email
    ) values (
      p_command_id, v_request.id, 'expire', v_request.review_reason,
      jsonb_build_object('pilot_enabled', false, 'emergency_stop', true),
      auth.uid(), v_actor_email
    );
    return v_request;
  end if;
  if v_request.requested_by = auth.uid() then
    raise exception 'billing_live_second_admin_required' using errcode = '42501';
  end if;

  if p_decision = 'approve' then
    select * into v_policy
    from public.billing_live_rollout_policies
    where provider = 'stripe'
    for update;

    select * into v_control
    from public.billing_live_safety_controls
    where provider = 'stripe'
    for update;

    select count(*)::integer into v_tester_count
    from public.billing_live_testers
    where provider = 'stripe' and active is true;

    select manual_status into v_readiness_status
    from public.billing_production_readiness_reviews
    order by created_at desc
    limit 1;

    if v_policy.version <> v_request.policy_version
       or v_policy.max_amount_per_charge <> v_request.max_amount_per_charge
       or v_policy.max_total_amount <> v_request.max_total_amount
       or v_policy.max_successful_charges <> v_request.max_successful_charges
       or v_tester_count <> v_request.tester_count then
      raise exception 'billing_live_approval_snapshot_changed';
    end if;
    if v_policy.pilot_enabled is true
       or v_control.emergency_stop is false
       or v_control.state <> 'review_ready'
       or v_readiness_status <> 'manual_complete' then
      raise exception 'billing_live_not_safely_locked';
    end if;
  end if;

  v_action := p_decision;
  v_status := case when p_decision = 'approve' then 'approved' else 'rejected' end;

  update public.billing_live_activation_requests
  set status = v_status,
      reviewed_by = auth.uid(),
      reviewed_by_email = v_actor_email,
      review_reason = btrim(p_reason),
      reviewed_at = now()
  where id = v_request.id
  returning * into v_request;

  insert into public.billing_live_activation_events (
    command_id, request_id, action, reason, details, actor_user_id, actor_email
  ) values (
    p_command_id, v_request.id, v_action, btrim(p_reason),
    jsonb_build_object(
      'requester_user_id', v_request.requested_by,
      'requester_email', v_request.requested_by_email,
      'reviewer_user_id', v_request.reviewed_by,
      'reviewer_email', v_request.reviewed_by_email,
      'policy_version', v_request.policy_version,
      'pilot_enabled', false,
      'emergency_stop', true
    ),
    auth.uid(), v_actor_email
  );

  return v_request;
end;
$$;

create or replace function public.platform_cancel_billing_live_activation(
  p_command_id uuid,
  p_request_id uuid,
  p_reason text
)
returns public.billing_live_activation_requests
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_request public.billing_live_activation_requests;
  v_existing public.billing_live_activation_requests;
  v_actor_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if p_request_id is null then raise exception 'billing_live_approval_request_required'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then
    raise exception 'billing_live_reason_invalid';
  end if;

  select r.* into v_existing
  from public.billing_live_activation_events e
  join public.billing_live_activation_requests r on r.id = e.request_id
  where e.command_id = p_command_id;
  if v_existing.id is not null then return v_existing; end if;

  select * into v_request
  from public.billing_live_activation_requests
  where id = p_request_id and provider = 'stripe'
  for update;

  if v_request.id is null then raise exception 'billing_live_approval_not_found'; end if;
  if v_request.status <> 'pending' then raise exception 'billing_live_approval_not_pending'; end if;
  if v_request.requested_by <> auth.uid() then
    raise exception 'billing_live_requester_only' using errcode = '42501';
  end if;

  update public.billing_live_activation_requests
  set status = 'canceled',
      reviewed_by = auth.uid(),
      reviewed_by_email = v_actor_email,
      review_reason = btrim(p_reason),
      reviewed_at = now()
  where id = v_request.id
  returning * into v_request;

  insert into public.billing_live_activation_events (
    command_id, request_id, action, reason, details, actor_user_id, actor_email
  ) values (
    p_command_id, v_request.id, 'cancel', btrim(p_reason),
    jsonb_build_object('pilot_enabled', false, 'emergency_stop', true),
    auth.uid(), v_actor_email
  );

  return v_request;
end;
$$;

revoke all on function public.platform_request_billing_live_activation(uuid, text)
  from public, anon;
revoke all on function public.platform_review_billing_live_activation(uuid, uuid, text, text)
  from public, anon;
revoke all on function public.platform_cancel_billing_live_activation(uuid, uuid, text)
  from public, anon;

grant execute on function public.platform_request_billing_live_activation(uuid, text)
  to authenticated;
grant execute on function public.platform_review_billing_live_activation(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.platform_cancel_billing_live_activation(uuid, uuid, text)
  to authenticated;

comment on table public.billing_live_activation_requests is
  'Two-person AAL2 Platform Admin approval requests for a future limited Live pilot. Approval does not enable Live Checkout.';
comment on table public.billing_live_activation_events is
  'Immutable audit trail for Live activation request, approval, rejection, cancellation and expiry.';
comment on function public.platform_request_billing_live_activation(uuid, text) is
  'Creates a 24-hour approval request from the current locked policy snapshot. It cannot enable Live Checkout.';
comment on function public.platform_review_billing_live_activation(uuid, uuid, text, text) is
  'Allows a different AAL2 Platform Admin to approve or reject a pending request. It cannot enable Live Checkout.';
