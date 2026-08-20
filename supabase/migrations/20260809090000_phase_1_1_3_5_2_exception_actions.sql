-- AVENZO ONE Phase 1.1.3.5.2: idempotent Payment Exception commands.
-- Every command is authorized by the server, recorded with an actor and reason,
-- and limited to Stripe Test Mode until Production onboarding is approved.

create table public.billing_payment_exception_commands (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null unique,
  attempt_id uuid not null references public.billing_payment_attempts(id) on delete restrict,
  invoice_id uuid not null references public.billing_invoices(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  action text not null,
  status text not null default 'pending',
  reason text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  result jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint billing_payment_exception_action_check
    check (action in ('reconcile_fee', 'refresh_provider_status', 'retry_checkout')),
  constraint billing_payment_exception_status_check
    check (status in ('pending', 'succeeded', 'failed')),
  constraint billing_payment_exception_reason_check
    check (length(btrim(reason)) between 3 and 500),
  constraint billing_payment_exception_actor_email_check
    check (position('@' in actor_email) > 1),
  constraint billing_payment_exception_result_check
    check (jsonb_typeof(result) = 'object'),
  constraint billing_payment_exception_completion_check
    check (
      (status = 'pending' and completed_at is null)
      or (status <> 'pending' and completed_at is not null)
    )
);

create index billing_payment_exception_attempt_created_idx
  on public.billing_payment_exception_commands (attempt_id, created_at desc, id desc);
create index billing_payment_exception_status_created_idx
  on public.billing_payment_exception_commands (status, created_at desc, id desc);

alter table public.billing_payment_exception_commands enable row level security;
revoke all on public.billing_payment_exception_commands from public, anon, authenticated;
grant select on public.billing_payment_exception_commands to authenticated;
grant select, insert, update on public.billing_payment_exception_commands to service_role;

create policy "platform admins can view payment exception commands"
on public.billing_payment_exception_commands for select to authenticated
using (private.is_platform_admin());

create or replace function private.protect_payment_exception_command_update()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_catalog
as $$
begin
  if old.command_id is distinct from new.command_id
    or old.attempt_id is distinct from new.attempt_id
    or old.invoice_id is distinct from new.invoice_id
    or old.organization_id is distinct from new.organization_id
    or old.action is distinct from new.action
    or old.reason is distinct from new.reason
    or old.actor_user_id is distinct from new.actor_user_id
    or old.actor_email is distinct from new.actor_email
    or old.created_at is distinct from new.created_at then
    raise exception 'payment_exception_command_identity_is_immutable';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_payment_exception_command_update() from public, anon, authenticated;
create trigger protect_payment_exception_command_before_update
before update on public.billing_payment_exception_commands
for each row execute function private.protect_payment_exception_command_update();

create or replace function public.server_repair_stripe_test_invoice_from_attempt(
  p_attempt_id uuid,
  p_command_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns public.billing_payment_attempts
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_attempt public.billing_payment_attempts;
  v_invoice public.billing_invoices;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if p_actor_user_id is null then raise exception 'actor_user_id_required'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_too_short'; end if;

  select * into v_attempt
  from public.billing_payment_attempts
  where id = p_attempt_id
  for update;
  if not found then raise exception 'payment_attempt_not_found'; end if;
  if v_attempt.provider <> 'stripe'
    or v_attempt.environment <> 'sandbox'
    or v_attempt.provider_session_id !~ '^cs_test_' then
    raise exception 'stripe_test_attempt_required';
  end if;
  if v_attempt.status <> 'succeeded' then raise exception 'stripe_successful_attempt_required'; end if;

  select * into v_invoice
  from public.billing_invoices
  where id = v_attempt.invoice_id
  for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_invoice.status = 'canceled' then raise exception 'canceled_invoice_is_final'; end if;
  if v_invoice.status = 'paid' then return v_attempt; end if;

  insert into public.billing_payments (
    payment_number, command_id, invoice_id, organization_id, provider, provider_reference,
    status, amount, currency, reason, metadata, recorded_by, occurred_at
  ) values (
    'PAY-' || to_char(now() at time zone 'Asia/Bangkok', 'YYYYMM') || '-' || lpad(nextval('public.billing_payment_number_seq')::text, 6, '0'),
    p_command_id, v_invoice.id, v_invoice.organization_id, 'stripe', v_attempt.provider_session_id,
    'paid', v_attempt.amount, v_attempt.currency, btrim(p_reason),
    jsonb_build_object(
      'attempt_id', v_attempt.id,
      'source', 'payment_exception_repair',
      'actor_user_id', p_actor_user_id,
      'real_charge', false
    ),
    p_actor_user_id, now()
  ) on conflict (command_id) do nothing;

  update public.billing_invoices
  set status = 'paid',
      paid_at = coalesce(paid_at, now()),
      failed_at = null,
      canceled_at = null,
      updated_by = p_actor_user_id,
      updated_at = now()
  where id = v_invoice.id and status <> 'paid';

  return v_attempt;
end;
$$;

revoke all on function public.server_repair_stripe_test_invoice_from_attempt(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.server_repair_stripe_test_invoice_from_attempt(uuid, uuid, uuid, text)
  to service_role;

comment on table public.billing_payment_exception_commands
is 'Idempotent operational command ledger for Payment Exception actions. Readable only by Platform Admin and writable only by the server.';
comment on function public.server_repair_stripe_test_invoice_from_attempt(uuid, uuid, uuid, text)
is 'Repairs an unpaid Invoice only after the server verifies a succeeded Stripe Test Mode attempt.';
