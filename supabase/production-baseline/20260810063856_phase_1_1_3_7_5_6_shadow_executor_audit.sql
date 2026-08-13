-- Phase 1.1.3.7.5.6: immutable Shadow Executor command reservation and audit.
-- This table can never represent a Stripe call, Checkout Session, Payment Attempt,
-- successful payment, or permission to accept real money.

create table public.billing_live_shadow_commands (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null unique,
  source_dry_run_id uuid not null unique
    references public.billing_live_checkout_dry_runs(id) on delete restrict,
  provider text not null default 'stripe',
  executor_mode text not null default 'shadow',
  status text not null,
  idempotency_key text not null unique,
  tester_email text not null,
  requested_amount numeric(14,2) not null,
  reference text not null,
  reason text not null,
  policy_version bigint not null,
  approval_request_id uuid references public.billing_live_activation_requests(id) on delete restrict,
  checks jsonb not null,
  stage_snapshot jsonb not null,
  real_charge boolean not null default false,
  stripe_api_called boolean not null default false,
  checkout_session_id text,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  created_at timestamptz not null default now(),
  constraint billing_live_shadow_provider_check check (provider = 'stripe'),
  constraint billing_live_shadow_mode_check check (executor_mode = 'shadow'),
  constraint billing_live_shadow_status_check check (status in ('reserved', 'blocked')),
  constraint billing_live_shadow_idempotency_check check (
    idempotency_key = 'avenzo-shadow:' || command_id::text
  ),
  constraint billing_live_shadow_email_check check (
    tester_email = lower(btrim(tester_email))
    and tester_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint billing_live_shadow_amount_check check (requested_amount > 0),
  constraint billing_live_shadow_reference_check check (length(btrim(reference)) between 10 and 120),
  constraint billing_live_shadow_reason_check check (length(btrim(reason)) between 10 and 500),
  constraint billing_live_shadow_policy_version_check check (policy_version > 0),
  constraint billing_live_shadow_checks_check check (jsonb_typeof(checks) = 'object'),
  constraint billing_live_shadow_stages_check check (jsonb_typeof(stage_snapshot) = 'array'),
  constraint billing_live_shadow_no_real_charge_check check (real_charge is false),
  constraint billing_live_shadow_no_stripe_api_check check (stripe_api_called is false),
  constraint billing_live_shadow_no_checkout_check check (checkout_session_id is null),
  constraint billing_live_shadow_actor_email_check check (position('@' in actor_email) > 1)
);

create index billing_live_shadow_commands_created_idx
  on public.billing_live_shadow_commands (created_at desc, id desc);
create index billing_live_shadow_commands_actor_idx
  on public.billing_live_shadow_commands (actor_user_id, created_at desc);
create index billing_live_shadow_commands_status_idx
  on public.billing_live_shadow_commands (status, created_at desc);
create index billing_live_shadow_commands_approval_idx
  on public.billing_live_shadow_commands (approval_request_id, created_at desc)
  where approval_request_id is not null;

alter table public.billing_live_shadow_commands enable row level security;
revoke all on public.billing_live_shadow_commands from public, anon, authenticated;
grant select on public.billing_live_shadow_commands to authenticated;
grant select, insert on public.billing_live_shadow_commands to service_role;

create policy "aal2 platform admins read billing live shadow commands"
on public.billing_live_shadow_commands for select to authenticated
using (
  (select private.is_platform_admin())
  and (select auth.jwt() ->> 'aal') = 'aal2'
);

create or replace function private.prevent_billing_live_shadow_command_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'billing_live_shadow_command_is_immutable';
end;
$$;

revoke all on function private.prevent_billing_live_shadow_command_mutation()
  from public, anon, authenticated;

create trigger prevent_billing_live_shadow_command_mutation
before update or delete on public.billing_live_shadow_commands
for each row execute function private.prevent_billing_live_shadow_command_mutation();

comment on table public.billing_live_shadow_commands is
  'Immutable Phase 1.1.3.7.5.6 Shadow Executor reservations. Stripe API calls, Checkout Sessions and real charges are permanently forbidden.';

