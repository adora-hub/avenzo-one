-- Phase 1.1.3.7.3: guarded Live pilot configuration.
-- This phase defines and tests the rules, but deliberately keeps pilot_enabled=false
-- and the existing billing emergency stop=true. It cannot accept real money.

alter table public.billing_live_safety_events
  drop constraint billing_live_safety_event_action_check;

alter table public.billing_live_safety_events
  add constraint billing_live_safety_event_action_check
  check (action in ('lock', 'mark_review_ready', 'rollback'));

create table public.billing_live_rollout_policies (
  provider text primary key,
  pilot_enabled boolean not null default false,
  max_amount_per_charge numeric(14,2) not null default 100.00,
  max_total_amount numeric(14,2) not null default 500.00,
  max_successful_charges integer not null default 3,
  reason text not null,
  version bigint not null default 1,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_by_email text,
  updated_at timestamptz not null default now(),
  constraint billing_live_rollout_policy_provider_check check (provider = 'stripe'),
  constraint billing_live_rollout_policy_disabled_check check (pilot_enabled is false),
  constraint billing_live_rollout_policy_charge_check check (max_amount_per_charge > 0),
  constraint billing_live_rollout_policy_total_check check (max_total_amount >= max_amount_per_charge),
  constraint billing_live_rollout_policy_count_check check (max_successful_charges between 1 and 100),
  constraint billing_live_rollout_policy_reason_check check (length(btrim(reason)) between 10 and 2000),
  constraint billing_live_rollout_policy_version_check check (version > 0)
);

create table public.billing_live_testers (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  email text not null,
  active boolean not null default true,
  reason text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_by_email text not null,
  updated_at timestamptz not null default now(),
  constraint billing_live_tester_provider_check check (provider = 'stripe'),
  constraint billing_live_tester_email_normalized_check check (
    email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint billing_live_tester_reason_check check (length(btrim(reason)) between 10 and 2000),
  constraint billing_live_tester_actor_email_check check (
    position('@' in created_by_email) > 1 and position('@' in updated_by_email) > 1
  ),
  unique (provider, email)
);

create table public.billing_live_rollout_events (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null unique,
  provider text not null default 'stripe',
  action text not null,
  tester_email text,
  requested_amount numeric(14,2),
  allowed boolean,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  created_at timestamptz not null default now(),
  constraint billing_live_rollout_event_provider_check check (provider = 'stripe'),
  constraint billing_live_rollout_event_action_check check (
    action in ('policy_update', 'tester_allow', 'tester_revoke', 'preview_check', 'rollback')
  ),
  constraint billing_live_rollout_event_amount_check check (requested_amount is null or requested_amount > 0),
  constraint billing_live_rollout_event_reason_check check (length(btrim(reason)) between 10 and 2000),
  constraint billing_live_rollout_event_details_check check (jsonb_typeof(details) = 'object'),
  constraint billing_live_rollout_event_actor_email_check check (position('@' in actor_email) > 1)
);

create index billing_live_testers_active_idx
  on public.billing_live_testers (active, email);
create index billing_live_testers_updated_by_idx
  on public.billing_live_testers (updated_by, updated_at desc);
create index billing_live_rollout_policy_updated_by_idx
  on public.billing_live_rollout_policies (updated_by)
  where updated_by is not null;
create index billing_live_rollout_events_created_idx
  on public.billing_live_rollout_events (created_at desc, id desc);
create index billing_live_rollout_events_actor_idx
  on public.billing_live_rollout_events (actor_user_id, created_at desc);

insert into public.billing_live_rollout_policies (
  provider, pilot_enabled, max_amount_per_charge, max_total_amount,
  max_successful_charges, reason
) values (
  'stripe', false, 100.00, 500.00, 3,
  'Phase 1.1.3.7.3 กำหนดวงเงินทดลองและยังปิดการรับเงินจริง'
)
on conflict (provider) do nothing;

alter table public.billing_live_rollout_policies enable row level security;
alter table public.billing_live_testers enable row level security;
alter table public.billing_live_rollout_events enable row level security;

revoke all on public.billing_live_rollout_policies from public, anon, authenticated;
revoke all on public.billing_live_testers from public, anon, authenticated;
revoke all on public.billing_live_rollout_events from public, anon, authenticated;
grant select on public.billing_live_rollout_policies to authenticated;
grant select on public.billing_live_testers to authenticated;
grant select on public.billing_live_rollout_events to authenticated;

create policy "aal2 platform admins read billing live rollout policy"
on public.billing_live_rollout_policies for select to authenticated
using ((select private.is_platform_admin()));

create policy "aal2 platform admins read billing live testers"
on public.billing_live_testers for select to authenticated
using ((select private.is_platform_admin()));

create policy "aal2 platform admins read billing live rollout events"
on public.billing_live_rollout_events for select to authenticated
using ((select private.is_platform_admin()));

create or replace function private.evaluate_billing_live_rollout(
  p_email text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_policy public.billing_live_rollout_policies;
  v_control public.billing_live_safety_controls;
  v_tester_allowed boolean;
  v_successful_count integer;
  v_successful_total numeric(14,2);
  v_amount_valid boolean;
  v_amount_within_limit boolean;
  v_count_within_limit boolean;
  v_total_within_limit boolean;
  v_allowed boolean;
begin
  select * into v_policy
  from public.billing_live_rollout_policies
  where provider = 'stripe';

  select * into v_control
  from public.billing_live_safety_controls
  where provider = 'stripe';

  select exists (
    select 1
    from public.billing_live_testers
    where provider = 'stripe' and email = v_email and active is true
  ) into v_tester_allowed;

  select count(*)::integer, coalesce(sum(amount), 0)::numeric(14,2)
    into v_successful_count, v_successful_total
  from public.billing_payment_attempts
  where provider = 'stripe'
    and environment = 'production'
    and status = 'succeeded';

  v_amount_valid := p_amount is not null and p_amount > 0;
  v_amount_within_limit := v_amount_valid and p_amount <= v_policy.max_amount_per_charge;
  v_count_within_limit := v_successful_count < v_policy.max_successful_charges;
  v_total_within_limit := v_amount_valid
    and (v_successful_total + p_amount) <= v_policy.max_total_amount;
  v_allowed := v_policy.pilot_enabled
    and v_control.emergency_stop is false
    and v_tester_allowed
    and v_amount_within_limit
    and v_count_within_limit
    and v_total_within_limit;

  return jsonb_build_object(
    'allowed', v_allowed,
    'phase', '1.1.3.7.3',
    'pilot_enabled', v_policy.pilot_enabled,
    'emergency_stop_clear', v_control.emergency_stop is false,
    'tester_allowed', v_tester_allowed,
    'amount_valid', v_amount_valid,
    'amount_within_limit', v_amount_within_limit,
    'count_within_limit', v_count_within_limit,
    'total_within_limit', v_total_within_limit,
    'max_amount_per_charge', v_policy.max_amount_per_charge,
    'max_total_amount', v_policy.max_total_amount,
    'max_successful_charges', v_policy.max_successful_charges,
    'successful_amount', v_successful_total,
    'successful_charges', v_successful_count,
    'requested_amount', p_amount
  );
end;
$$;

revoke all on function private.evaluate_billing_live_rollout(text, numeric)
  from public, anon, authenticated;

create or replace function public.platform_update_billing_live_rollout_policy(
  p_command_id uuid,
  p_max_amount_per_charge numeric,
  p_max_total_amount numeric,
  p_max_successful_charges integer,
  p_reason text
)
returns public.billing_live_rollout_policies
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_policy public.billing_live_rollout_policies;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then
    raise exception 'billing_live_reason_invalid';
  end if;
  if p_max_amount_per_charge is null or p_max_amount_per_charge <= 0
     or p_max_total_amount is null or p_max_total_amount < p_max_amount_per_charge
     or p_max_successful_charges is null or p_max_successful_charges not between 1 and 100 then
    raise exception 'billing_live_rollout_limit_invalid';
  end if;

  if exists (select 1 from public.billing_live_rollout_events where command_id = p_command_id) then
    select * into v_policy from public.billing_live_rollout_policies where provider = 'stripe';
    return v_policy;
  end if;

  select * into v_policy
  from public.billing_live_rollout_policies
  where provider = 'stripe'
  for update;

  insert into public.billing_live_rollout_events (
    command_id, action, reason, details, actor_user_id, actor_email
  ) values (
    p_command_id,
    'policy_update',
    btrim(p_reason),
    jsonb_build_object(
      'previous_max_amount_per_charge', v_policy.max_amount_per_charge,
      'previous_max_total_amount', v_policy.max_total_amount,
      'previous_max_successful_charges', v_policy.max_successful_charges,
      'next_max_amount_per_charge', p_max_amount_per_charge,
      'next_max_total_amount', p_max_total_amount,
      'next_max_successful_charges', p_max_successful_charges,
      'pilot_enabled', false
    ),
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', '')
  );

  update public.billing_live_rollout_policies
  set max_amount_per_charge = p_max_amount_per_charge,
      max_total_amount = p_max_total_amount,
      max_successful_charges = p_max_successful_charges,
      reason = btrim(p_reason),
      version = version + 1,
      updated_by = auth.uid(),
      updated_by_email = coalesce(auth.jwt() ->> 'email', ''),
      updated_at = now()
  where provider = 'stripe'
  returning * into v_policy;

  return v_policy;
end;
$$;

create or replace function public.platform_set_billing_live_tester(
  p_command_id uuid,
  p_email text,
  p_active boolean,
  p_reason text
)
returns public.billing_live_testers
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_tester public.billing_live_testers;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'billing_live_tester_email_invalid';
  end if;
  if p_active is null then raise exception 'billing_live_tester_state_required'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then
    raise exception 'billing_live_reason_invalid';
  end if;

  if exists (select 1 from public.billing_live_rollout_events where command_id = p_command_id) then
    select * into v_tester
    from public.billing_live_testers
    where provider = 'stripe' and email = v_email;
    return v_tester;
  end if;

  insert into public.billing_live_testers (
    provider, email, active, reason,
    created_by, created_by_email, updated_by, updated_by_email
  ) values (
    'stripe', v_email, p_active, btrim(p_reason),
    auth.uid(), coalesce(auth.jwt() ->> 'email', ''),
    auth.uid(), coalesce(auth.jwt() ->> 'email', '')
  )
  on conflict (provider, email) do update
  set active = excluded.active,
      reason = excluded.reason,
      updated_by = excluded.updated_by,
      updated_by_email = excluded.updated_by_email,
      updated_at = now()
  returning * into v_tester;

  insert into public.billing_live_rollout_events (
    command_id, action, tester_email, reason, details, actor_user_id, actor_email
  ) values (
    p_command_id,
    case when p_active then 'tester_allow' else 'tester_revoke' end,
    v_email,
    btrim(p_reason),
    jsonb_build_object('active', p_active),
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', '')
  );

  return v_tester;
end;
$$;

create or replace function public.platform_preview_billing_live_rollout(
  p_command_id uuid,
  p_email text,
  p_amount numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_result jsonb;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'billing_live_tester_email_invalid';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'billing_live_amount_invalid'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then
    raise exception 'billing_live_reason_invalid';
  end if;

  select details into v_result
  from public.billing_live_rollout_events
  where command_id = p_command_id and action = 'preview_check';
  if v_result is not null then return v_result; end if;

  v_result := private.evaluate_billing_live_rollout(v_email, p_amount);

  insert into public.billing_live_rollout_events (
    command_id, action, tester_email, requested_amount, allowed,
    reason, details, actor_user_id, actor_email
  ) values (
    p_command_id, 'preview_check', v_email, p_amount,
    (v_result ->> 'allowed')::boolean, btrim(p_reason), v_result,
    auth.uid(), coalesce(auth.jwt() ->> 'email', '')
  );

  return v_result;
end;
$$;

create or replace function public.platform_trigger_billing_live_rollback(
  p_command_id uuid,
  p_reason text
)
returns public.billing_live_safety_controls
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_control public.billing_live_safety_controls;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then
    raise exception 'billing_live_reason_invalid';
  end if;

  if exists (select 1 from public.billing_live_rollout_events where command_id = p_command_id) then
    select * into v_control from public.billing_live_safety_controls where provider = 'stripe';
    return v_control;
  end if;

  select * into v_control
  from public.billing_live_safety_controls
  where provider = 'stripe'
  for update;

  insert into public.billing_live_rollout_events (
    command_id, action, reason, details, actor_user_id, actor_email
  ) values (
    p_command_id, 'rollback', btrim(p_reason),
    jsonb_build_object('previous_state', v_control.state, 'emergency_stop', true, 'pilot_enabled', false),
    auth.uid(), coalesce(auth.jwt() ->> 'email', '')
  );

  insert into public.billing_live_safety_events (
    command_id, provider, action, previous_state, next_state,
    emergency_stop, reason, actor_user_id, actor_email
  ) values (
    gen_random_uuid(), 'stripe', 'rollback', v_control.state, 'locked',
    true, btrim(p_reason), auth.uid(), coalesce(auth.jwt() ->> 'email', '')
  );

  update public.billing_live_safety_controls
  set state = 'locked',
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

revoke all on function public.platform_update_billing_live_rollout_policy(uuid, numeric, numeric, integer, text)
  from public, anon;
revoke all on function public.platform_set_billing_live_tester(uuid, text, boolean, text)
  from public, anon;
revoke all on function public.platform_preview_billing_live_rollout(uuid, text, numeric, text)
  from public, anon;
revoke all on function public.platform_trigger_billing_live_rollback(uuid, text)
  from public, anon;

grant execute on function public.platform_update_billing_live_rollout_policy(uuid, numeric, numeric, integer, text)
  to authenticated;
grant execute on function public.platform_set_billing_live_tester(uuid, text, boolean, text)
  to authenticated;
grant execute on function public.platform_preview_billing_live_rollout(uuid, text, numeric, text)
  to authenticated;
grant execute on function public.platform_trigger_billing_live_rollback(uuid, text)
  to authenticated;

comment on table public.billing_live_rollout_policies is
  'Server-enforced Stripe Live pilot limits. Phase 1.1.3.7.3 constrains pilot_enabled=false.';
comment on table public.billing_live_testers is
  'Explicit tester allowlist for a future limited Stripe Live pilot.';
comment on table public.billing_live_rollout_events is
  'Immutable AAL2 Platform Admin audit trail for pilot limits, testers, previews and rollback.';
comment on function private.evaluate_billing_live_rollout(text, numeric) is
  'Central server-side evaluation of allowlist, per-charge, cumulative, count, pilot and emergency-stop rules.';
comment on function public.platform_preview_billing_live_rollout(uuid, text, numeric, text) is
  'Audited dry-run of Live pilot rules. Phase 1.1.3.7.3 always returns allowed=false.';
