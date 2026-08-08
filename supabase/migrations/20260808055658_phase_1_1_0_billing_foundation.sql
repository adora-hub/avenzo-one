-- AVENZO ONE Phase 1.1.0: provider-neutral Billing Foundation.
-- This phase records invoices and payment outcomes only. It never calls or charges a payment provider.

insert into public.permissions (code, resource, action, description)
values
  ('billing.read', 'billing', 'read', 'View invoices and payment history'),
  ('billing.manage', 'billing', 'manage', 'Manage invoices and record payment outcomes')
on conflict (code) do update set
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.organization_roles r
join public.permissions p on p.code in ('billing.read', 'billing.manage')
where r.code in ('owner', 'admin')
on conflict do nothing;

create sequence if not exists public.billing_invoice_number_seq;
create sequence if not exists public.billing_payment_number_seq;
revoke all on sequence public.billing_invoice_number_seq, public.billing_payment_number_seq from public, anon, authenticated;

create table public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  command_id uuid not null unique,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  plan_version_id uuid not null references public.subscription_plan_versions(id) on delete restrict,
  plan_price_id uuid references public.subscription_plan_prices(id) on delete restrict,
  billing_interval text not null,
  billing_period_start timestamptz not null,
  billing_period_end timestamptz not null,
  currency text not null,
  subtotal_amount numeric(14,2) not null,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) generated always as (subtotal_amount - discount_amount + tax_amount) stored,
  status text not null default 'pending',
  issued_at timestamptz not null default now(),
  due_at timestamptz not null,
  paid_at timestamptz,
  failed_at timestamptz,
  canceled_at timestamptz,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_invoices_interval_check check (billing_interval in ('monthly', 'yearly', 'one_time')),
  constraint billing_invoices_period_check check (billing_period_start < billing_period_end),
  constraint billing_invoices_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint billing_invoices_amount_check check (
    subtotal_amount >= 0 and discount_amount >= 0 and discount_amount <= subtotal_amount and tax_amount >= 0
  ),
  constraint billing_invoices_total_check check (subtotal_amount - discount_amount + tax_amount >= 0),
  constraint billing_invoices_status_check check (status in ('pending', 'paid', 'failed', 'canceled')),
  constraint billing_invoices_due_check check (due_at >= issued_at),
  constraint billing_invoices_reason_check check (length(btrim(reason)) between 3 and 500),
  constraint billing_invoices_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint billing_invoices_status_dates_check check (
    (status = 'pending' and paid_at is null and failed_at is null and canceled_at is null)
    or (status = 'paid' and paid_at is not null and failed_at is null and canceled_at is null)
    or (status = 'failed' and paid_at is null and failed_at is not null and canceled_at is null)
    or (status = 'canceled' and paid_at is null and canceled_at is not null)
  )
);

create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text not null unique,
  command_id uuid not null unique,
  invoice_id uuid not null references public.billing_invoices(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider text not null default 'manual',
  provider_reference text,
  status text not null,
  amount numeric(14,2) not null,
  currency text not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint billing_payments_provider_check check (provider ~ '^[a-z][a-z0-9_-]{1,49}$'),
  constraint billing_payments_reference_check check (provider_reference is null or length(btrim(provider_reference)) between 1 and 120),
  constraint billing_payments_status_check check (status in ('pending', 'paid', 'failed', 'canceled')),
  constraint billing_payments_amount_check check (amount >= 0),
  constraint billing_payments_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint billing_payments_reason_check check (length(btrim(reason)) between 3 and 500),
  constraint billing_payments_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create table private.billing_audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  action text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now(),
  constraint billing_audit_entity_check check (entity_type in ('invoice', 'payment')),
  constraint billing_audit_action_check check (action in ('created', 'updated'))
);

create index billing_invoices_organization_issued_idx on public.billing_invoices (organization_id, issued_at desc, id desc);
create index billing_invoices_subscription_idx on public.billing_invoices (subscription_id);
create index billing_invoices_plan_version_idx on public.billing_invoices (plan_version_id);
create index billing_invoices_plan_price_idx on public.billing_invoices (plan_price_id) where plan_price_id is not null;
create index billing_invoices_status_due_idx on public.billing_invoices (status, due_at);
create index billing_invoices_created_by_idx on public.billing_invoices (created_by);
create index billing_invoices_updated_by_idx on public.billing_invoices (updated_by);
create index billing_payments_invoice_created_idx on public.billing_payments (invoice_id, created_at desc, id desc);
create index billing_payments_organization_created_idx on public.billing_payments (organization_id, created_at desc, id desc);
create index billing_payments_recorded_by_idx on public.billing_payments (recorded_by);
create index billing_audit_entity_created_idx on private.billing_audit_logs (entity_type, entity_id, created_at desc);
create index billing_audit_organization_created_idx on private.billing_audit_logs (organization_id, created_at desc);
create index billing_audit_actor_idx on private.billing_audit_logs (actor_user_id);

alter table public.billing_invoices enable row level security;
alter table public.billing_payments enable row level security;
alter table private.billing_audit_logs enable row level security;

revoke all on public.billing_invoices, public.billing_payments from public, anon, authenticated;
grant select on public.billing_invoices, public.billing_payments to authenticated;
revoke all on private.billing_audit_logs from public, anon, authenticated;

create policy "authorized users can view billing invoices"
on public.billing_invoices for select to authenticated
using (private.is_platform_admin() or private.has_org_permission(organization_id, 'billing.read'::text, null::uuid));

create policy "authorized users can view billing payments"
on public.billing_payments for select to authenticated
using (private.is_platform_admin() or private.has_org_permission(organization_id, 'billing.read'::text, null::uuid));

create policy "deny direct access to billing audit logs"
on private.billing_audit_logs for all to public
using (false) with check (false);

create or replace function private.audit_billing_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  insert into private.billing_audit_logs (
    entity_type, entity_id, organization_id, action, actor_user_id, before_data, after_data
  ) values (
    case when tg_table_name = 'billing_invoices' then 'invoice' else 'payment' end,
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

revoke all on function private.audit_billing_write() from public, anon, authenticated;

create trigger audit_billing_invoice_write
after insert or update on public.billing_invoices
for each row execute function private.audit_billing_write();

create trigger audit_billing_payment_write
after insert on public.billing_payments
for each row execute function private.audit_billing_write();

create or replace function public.platform_create_billing_invoice(
  p_organization_id uuid,
  p_subscription_id uuid,
  p_plan_price_id uuid,
  p_billing_period_start timestamptz,
  p_billing_period_end timestamptz,
  p_discount_amount numeric,
  p_tax_amount numeric,
  p_due_at timestamptz,
  p_reason text,
  p_command_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns public.billing_invoices
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_subscription public.organization_subscriptions;
  v_price public.subscription_plan_prices;
  v_invoice public.billing_invoices;
  v_now timestamptz := now();
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;

  select * into v_invoice from public.billing_invoices where command_id = p_command_id;
  if found then return v_invoice; end if;

  select * into v_subscription
  from public.organization_subscriptions
  where id = p_subscription_id and organization_id = p_organization_id;
  if not found then raise exception 'subscription_not_found'; end if;
  if v_subscription.plan_version_id is null then raise exception 'subscription_plan_version_required'; end if;

  select * into v_price
  from public.subscription_plan_prices
  where id = p_plan_price_id
    and plan_version_id = v_subscription.plan_version_id
    and is_active;
  if not found then raise exception 'active_plan_price_not_found'; end if;
  if p_billing_period_start >= p_billing_period_end then raise exception 'invalid_billing_period'; end if;
  if p_due_at < v_now then raise exception 'invoice_due_date_in_past'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'billing_reason_too_short'; end if;
  if coalesce(p_discount_amount, 0) < 0 or coalesce(p_discount_amount, 0) > v_price.amount then raise exception 'invalid_discount_amount'; end if;
  if coalesce(p_tax_amount, 0) < 0 then raise exception 'invalid_tax_amount'; end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then raise exception 'invalid_metadata'; end if;

  insert into public.billing_invoices (
    invoice_number, command_id, organization_id, subscription_id, plan_version_id, plan_price_id,
    billing_interval, billing_period_start, billing_period_end, currency,
    subtotal_amount, discount_amount, tax_amount, status, issued_at, due_at, reason, metadata,
    created_by, updated_by
  ) values (
    'INV-' || to_char(v_now at time zone 'Asia/Bangkok', 'YYYYMM') || '-' || lpad(nextval('public.billing_invoice_number_seq')::text, 6, '0'),
    p_command_id, p_organization_id, p_subscription_id, v_subscription.plan_version_id, v_price.id,
    v_price.billing_interval, p_billing_period_start, p_billing_period_end, v_price.currency,
    v_price.amount, coalesce(p_discount_amount, 0), coalesce(p_tax_amount, 0), 'pending', v_now, p_due_at,
    btrim(p_reason), coalesce(p_metadata, '{}'::jsonb), (select auth.uid()), (select auth.uid())
  ) returning * into v_invoice;

  return v_invoice;
end;
$$;

create or replace function public.platform_record_billing_payment(
  p_invoice_id uuid,
  p_status text,
  p_amount numeric,
  p_provider text,
  p_provider_reference text,
  p_reason text,
  p_command_id uuid,
  p_occurred_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb
)
returns public.billing_payments
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_invoice public.billing_invoices;
  v_payment public.billing_payments;
  v_status text := lower(btrim(coalesce(p_status, '')));
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;

  select * into v_payment from public.billing_payments where command_id = p_command_id;
  if found then return v_payment; end if;

  select * into v_invoice from public.billing_invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_invoice.status = 'canceled' then raise exception 'canceled_invoice_is_final'; end if;
  if v_invoice.status = 'paid' then raise exception 'paid_invoice_is_final'; end if;
  if v_status not in ('pending', 'paid', 'failed', 'canceled') then raise exception 'invalid_payment_status'; end if;
  if p_amount < 0 then raise exception 'invalid_payment_amount'; end if;
  if v_status = 'paid' and p_amount <> v_invoice.total_amount then raise exception 'payment_amount_must_equal_invoice_total'; end if;
  if length(btrim(coalesce(p_provider, ''))) < 2 then raise exception 'invalid_payment_provider'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'billing_reason_too_short'; end if;

  insert into public.billing_payments (
    payment_number, command_id, invoice_id, organization_id, provider, provider_reference,
    status, amount, currency, reason, metadata, recorded_by, occurred_at
  ) values (
    'PAY-' || to_char(coalesce(p_occurred_at, now()) at time zone 'Asia/Bangkok', 'YYYYMM') || '-' || lpad(nextval('public.billing_payment_number_seq')::text, 6, '0'),
    p_command_id, v_invoice.id, v_invoice.organization_id, lower(btrim(p_provider)), nullif(btrim(p_provider_reference), ''),
    v_status, p_amount, v_invoice.currency, btrim(p_reason), coalesce(p_metadata, '{}'::jsonb),
    (select auth.uid()), coalesce(p_occurred_at, now())
  ) returning * into v_payment;

  update public.billing_invoices
  set status = v_status,
      paid_at = case when v_status = 'paid' then v_payment.occurred_at else null end,
      failed_at = case when v_status = 'failed' then v_payment.occurred_at else null end,
      canceled_at = case when v_status = 'canceled' then v_payment.occurred_at else null end,
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = v_invoice.id;

  return v_payment;
end;
$$;

revoke all on function public.platform_create_billing_invoice(
  uuid, uuid, uuid, timestamptz, timestamptz, numeric, numeric, timestamptz, text, uuid, jsonb
) from public, anon;
grant execute on function public.platform_create_billing_invoice(
  uuid, uuid, uuid, timestamptz, timestamptz, numeric, numeric, timestamptz, text, uuid, jsonb
) to authenticated;

revoke all on function public.platform_record_billing_payment(
  uuid, text, numeric, text, text, text, uuid, timestamptz, jsonb
) from public, anon;
grant execute on function public.platform_record_billing_payment(
  uuid, text, numeric, text, text, text, uuid, timestamptz, jsonb
) to authenticated;

comment on table public.billing_invoices is 'Immutable commercial snapshot for each subscription billing period.';
comment on table public.billing_payments is 'Provider-neutral payment outcome history; no provider charge occurs inside this table or RPC.';
comment on table private.billing_audit_logs is 'Append-only invoice and payment audit history.';
comment on function public.platform_create_billing_invoice(
  uuid, uuid, uuid, timestamptz, timestamptz, numeric, numeric, timestamptz, text, uuid, jsonb
) is 'Creates an idempotent pending invoice from the active price snapshot. Requires Platform Admin AAL2.';
comment on function public.platform_record_billing_payment(
  uuid, text, numeric, text, text, text, uuid, timestamptz, jsonb
) is 'Records a provider-neutral payment result and updates invoice status atomically. Does not charge money.';
