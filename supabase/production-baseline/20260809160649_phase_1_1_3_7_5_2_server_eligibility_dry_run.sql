-- Phase 1.1.3.7.5.2: immutable server-side Live eligibility dry-run audit.
-- This table records eligibility snapshots only. It never represents a payment,
-- Checkout Session, Payment Intent, or permission to accept real money.

create table public.billing_live_checkout_dry_runs (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null unique,
  provider text not null default 'stripe',
  environment text not null default 'production_dry_run',
  tester_email text not null,
  requested_amount numeric(14,2) not null,
  reference text not null,
  eligible boolean not null,
  real_charge boolean not null default false,
  checks jsonb not null,
  policy_version bigint not null,
  approval_request_id uuid references public.billing_live_activation_requests(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  created_at timestamptz not null default now(),
  constraint billing_live_dry_run_provider_check check (provider = 'stripe'),
  constraint billing_live_dry_run_environment_check check (environment = 'production_dry_run'),
  constraint billing_live_dry_run_email_check check (
    tester_email = lower(btrim(tester_email))
    and tester_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint billing_live_dry_run_amount_check check (requested_amount > 0),
  constraint billing_live_dry_run_reference_check check (length(btrim(reference)) between 10 and 120),
  constraint billing_live_dry_run_real_charge_check check (real_charge is false),
  constraint billing_live_dry_run_checks_check check (jsonb_typeof(checks) = 'object'),
  constraint billing_live_dry_run_policy_version_check check (policy_version > 0),
  constraint billing_live_dry_run_actor_email_check check (position('@' in actor_email) > 1)
);

create index billing_live_checkout_dry_runs_created_idx
  on public.billing_live_checkout_dry_runs (created_at desc, id desc);
create index billing_live_checkout_dry_runs_actor_idx
  on public.billing_live_checkout_dry_runs (actor_user_id, created_at desc);
create index billing_live_checkout_dry_runs_tester_idx
  on public.billing_live_checkout_dry_runs (tester_email, created_at desc);
create index billing_live_checkout_dry_runs_approval_idx
  on public.billing_live_checkout_dry_runs (approval_request_id, created_at desc)
  where approval_request_id is not null;

alter table public.billing_live_checkout_dry_runs enable row level security;
revoke all on public.billing_live_checkout_dry_runs from public, anon, authenticated;
grant select on public.billing_live_checkout_dry_runs to authenticated;
grant select, insert on public.billing_live_checkout_dry_runs to service_role;

create policy "aal2 platform admins read billing live checkout dry runs"
on public.billing_live_checkout_dry_runs for select to authenticated
using ((select private.is_platform_admin()));

create or replace function private.prevent_billing_live_dry_run_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'billing_live_dry_run_is_immutable';
end;
$$;

revoke all on function private.prevent_billing_live_dry_run_mutation()
  from public, anon, authenticated;

create trigger prevent_billing_live_checkout_dry_run_mutation
before update or delete on public.billing_live_checkout_dry_runs
for each row execute function private.prevent_billing_live_dry_run_mutation();

comment on table public.billing_live_checkout_dry_runs is
  'Immutable Phase 1.1.3.7.5.2 server eligibility snapshots. Dry-run only; real_charge is permanently false.';
