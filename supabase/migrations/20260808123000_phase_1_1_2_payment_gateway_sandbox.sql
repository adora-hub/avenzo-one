-- AVENZO ONE Phase 1.1.2: provider-neutral payment gateway sandbox and reconciliation foundation.
-- No real provider is called and no real money is charged in this phase.

create table public.billing_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null unique,
  invoice_id uuid not null references public.billing_invoices(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider text not null,
  environment text not null default 'sandbox',
  provider_session_id text not null unique,
  idempotency_key uuid not null unique,
  status text not null default 'pending',
  amount numeric(14,2) not null,
  currency text not null,
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint billing_payment_attempt_provider_check check (provider ~ '^[a-z][a-z0-9_-]{1,49}$'),
  constraint billing_payment_attempt_environment_check check (environment in ('sandbox', 'production')),
  constraint billing_payment_attempt_status_check check (status in ('pending', 'succeeded', 'failed', 'canceled')),
  constraint billing_payment_attempt_amount_check check (amount > 0),
  constraint billing_payment_attempt_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint billing_payment_attempt_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint billing_payment_attempt_completion_check check (
    (status = 'pending' and completed_at is null)
    or (status <> 'pending' and completed_at is not null)
  )
);

create table public.billing_payment_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.billing_payment_attempts(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider text not null,
  environment text not null,
  provider_event_id text not null unique,
  event_type text not null,
  result_status text not null,
  processing_status text not null default 'processed',
  payload_sha256 text not null,
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint billing_payment_event_provider_check check (provider ~ '^[a-z][a-z0-9_-]{1,49}$'),
  constraint billing_payment_event_environment_check check (environment in ('sandbox', 'production')),
  constraint billing_payment_event_result_check check (result_status in ('succeeded', 'failed', 'canceled')),
  constraint billing_payment_event_processing_check check (processing_status in ('processed', 'ignored', 'failed')),
  constraint billing_payment_event_hash_check check (payload_sha256 ~ '^[0-9a-f]{64}$')
);

create table private.billing_gateway_audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  action text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now(),
  constraint billing_gateway_audit_entity_check check (entity_type in ('payment_attempt', 'payment_event')),
  constraint billing_gateway_audit_action_check check (action in ('created', 'updated'))
);

create index billing_payment_attempts_invoice_created_idx on public.billing_payment_attempts (invoice_id, created_at desc, id desc);
create index billing_payment_attempts_status_updated_idx on public.billing_payment_attempts (status, updated_at desc);
create index billing_payment_attempts_organization_idx on public.billing_payment_attempts (organization_id, created_at desc);
create index billing_payment_events_attempt_received_idx on public.billing_payment_events (attempt_id, received_at desc, id desc);
create index billing_payment_events_processing_idx on public.billing_payment_events (processing_status, received_at desc);
create index billing_gateway_audit_entity_idx on private.billing_gateway_audit_logs (entity_type, entity_id, created_at desc);

alter table public.billing_payment_attempts enable row level security;
alter table public.billing_payment_events enable row level security;
alter table private.billing_gateway_audit_logs enable row level security;

revoke all on public.billing_payment_attempts, public.billing_payment_events from public, anon, authenticated;
grant select on public.billing_payment_attempts, public.billing_payment_events to authenticated;
revoke all on private.billing_gateway_audit_logs from public, anon, authenticated;

create policy "platform admins can view payment attempts"
on public.billing_payment_attempts for select to authenticated
using (private.is_platform_admin());

create policy "platform admins can view payment events"
on public.billing_payment_events for select to authenticated
using (private.is_platform_admin());

create policy "deny direct access to gateway audit logs"
on private.billing_gateway_audit_logs for all to public
using (false) with check (false);

create or replace function private.audit_billing_gateway_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  insert into private.billing_gateway_audit_logs (
    entity_type, entity_id, organization_id, action, actor_user_id, before_data, after_data
  ) values (
    case when tg_table_name = 'billing_payment_attempts' then 'payment_attempt' else 'payment_event' end,
    new.id,
    new.organization_id,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    (select auth.uid()),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

revoke all on function private.audit_billing_gateway_write() from public, anon, authenticated;
create trigger audit_billing_payment_attempt_write after insert or update on public.billing_payment_attempts for each row execute function private.audit_billing_gateway_write();
create trigger audit_billing_payment_event_write after insert on public.billing_payment_events for each row execute function private.audit_billing_gateway_write();

create or replace function public.platform_create_sandbox_payment_attempt(
  p_invoice_id uuid,
  p_command_id uuid
)
returns public.billing_payment_attempts
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_invoice public.billing_invoices;
  v_attempt public.billing_payment_attempts;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;

  select * into v_attempt from public.billing_payment_attempts where command_id = p_command_id;
  if found then return v_attempt; end if;

  select * into v_invoice from public.billing_invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_invoice.status = 'paid' then raise exception 'paid_invoice_is_final'; end if;
  if v_invoice.status = 'canceled' then raise exception 'canceled_invoice_is_final'; end if;
  if v_invoice.total_amount <= 0 then raise exception 'gateway_requires_positive_amount'; end if;

  insert into public.billing_payment_attempts (
    command_id, invoice_id, organization_id, provider, environment, provider_session_id,
    idempotency_key, status, amount, currency, metadata, created_by
  ) values (
    p_command_id, v_invoice.id, v_invoice.organization_id, 'sandbox', 'sandbox',
    'sandbox_' || replace(p_command_id::text, '-', ''), p_command_id, 'pending',
    v_invoice.total_amount, v_invoice.currency,
    jsonb_build_object('source', 'platform_admin_billing_ui', 'real_charge', false),
    (select auth.uid())
  ) returning * into v_attempt;

  return v_attempt;
end;
$$;

create or replace function public.platform_simulate_sandbox_payment_event(
  p_attempt_id uuid,
  p_result_status text,
  p_command_id uuid
)
returns public.billing_payment_attempts
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_attempt public.billing_payment_attempts;
  v_result text := lower(btrim(coalesce(p_result_status, '')));
  v_event_id text;
  v_payment_status text;
  v_payment public.billing_payments;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if v_result not in ('succeeded', 'failed') then raise exception 'invalid_sandbox_result'; end if;

  v_event_id := 'sandbox_event_' || replace(p_command_id::text, '-', '');
  select a.* into v_attempt
  from public.billing_payment_events e
  join public.billing_payment_attempts a on a.id = e.attempt_id
  where e.provider_event_id = v_event_id;
  if found then return v_attempt; end if;

  select * into v_attempt from public.billing_payment_attempts where id = p_attempt_id for update;
  if not found then raise exception 'payment_attempt_not_found'; end if;
  if v_attempt.provider <> 'sandbox' or v_attempt.environment <> 'sandbox' then raise exception 'sandbox_attempt_required'; end if;
  if v_attempt.status <> 'pending' then raise exception 'payment_attempt_is_final'; end if;

  update public.billing_payment_attempts
  set status = v_result,
      failure_code = case when v_result = 'failed' then 'sandbox_declined' else null end,
      failure_message = case when v_result = 'failed' then 'Sandbox simulated payment failure' else null end,
      completed_at = now(),
      updated_at = now()
  where id = v_attempt.id
  returning * into v_attempt;

  insert into public.billing_payment_events (
    attempt_id, organization_id, provider, environment, provider_event_id,
    event_type, result_status, processing_status, payload_sha256, processed_at
  ) values (
    v_attempt.id, v_attempt.organization_id, 'sandbox', 'sandbox', v_event_id,
    case when v_result = 'succeeded' then 'payment.succeeded' else 'payment.failed' end,
    v_result, 'processed', encode(extensions.digest(v_event_id || ':' || v_result, 'sha256'), 'hex'), now()
  );

  v_payment_status := case when v_result = 'succeeded' then 'paid' else 'failed' end;
  select * into v_payment from public.platform_record_billing_payment(
    v_attempt.invoice_id,
    v_payment_status,
    v_attempt.amount,
    'sandbox',
    v_attempt.provider_session_id,
    case when v_result = 'succeeded' then 'ทดสอบ Gateway Sandbox สำเร็จ' else 'ทดสอบ Gateway Sandbox ไม่สำเร็จ' end,
    p_command_id,
    now(),
    jsonb_build_object('attempt_id', v_attempt.id, 'provider_event_id', v_event_id, 'real_charge', false)
  );

  return v_attempt;
end;
$$;

revoke all on function public.platform_create_sandbox_payment_attempt(uuid, uuid) from public, anon;
grant execute on function public.platform_create_sandbox_payment_attempt(uuid, uuid) to authenticated;
revoke all on function public.platform_simulate_sandbox_payment_event(uuid, text, uuid) from public, anon;
grant execute on function public.platform_simulate_sandbox_payment_event(uuid, text, uuid) to authenticated;

comment on table public.billing_payment_attempts is 'Provider-neutral payment attempts. Phase 1.1.2 creates sandbox attempts only and never charges real money.';
comment on table public.billing_payment_events is 'Sanitized and idempotent gateway event ledger. Raw provider secrets and full payloads are never stored here.';
comment on function public.platform_create_sandbox_payment_attempt(uuid, uuid) is 'Creates an idempotent sandbox payment attempt for an unpaid invoice. Requires Platform Admin AAL2.';
comment on function public.platform_simulate_sandbox_payment_event(uuid, text, uuid) is 'Simulates a signed provider result for local acceptance testing. Never calls an external payment provider.';
