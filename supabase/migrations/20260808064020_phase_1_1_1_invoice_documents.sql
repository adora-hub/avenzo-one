-- AVENZO ONE Phase 1.1.1: invoice document snapshots and correction policy.
-- This phase does not create a tax invoice under any particular jurisdiction.
-- Legal/tax review is required before using generated documents as statutory tax invoices.

create sequence if not exists public.billing_document_number_seq;
create sequence if not exists public.billing_credit_note_number_seq;
revoke all on sequence public.billing_document_number_seq, public.billing_credit_note_number_seq from public, anon, authenticated;

create table public.billing_issuer_profiles (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  tax_id text,
  branch_code text,
  address text not null,
  email text,
  phone text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_issuer_legal_name_check check (length(btrim(legal_name)) between 2 and 250),
  constraint billing_issuer_address_check check (length(btrim(address)) between 5 and 1200),
  constraint billing_issuer_tax_id_check check (tax_id is null or length(btrim(tax_id)) between 3 and 32),
  constraint billing_issuer_branch_code_check check (branch_code is null or length(btrim(branch_code)) between 1 and 20),
  constraint billing_issuer_email_check check (email is null or length(btrim(email)) between 3 and 320),
  constraint billing_issuer_phone_check check (phone is null or length(btrim(phone)) between 3 and 60)
);
create unique index billing_issuer_one_active_idx on public.billing_issuer_profiles (is_active) where is_active;

create table public.billing_customer_profiles (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  legal_name text not null,
  tax_id text,
  branch_code text,
  address text not null,
  email text,
  phone text,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_customer_legal_name_check check (length(btrim(legal_name)) between 2 and 250),
  constraint billing_customer_address_check check (length(btrim(address)) between 5 and 1200),
  constraint billing_customer_tax_id_check check (tax_id is null or length(btrim(tax_id)) between 3 and 32),
  constraint billing_customer_branch_code_check check (branch_code is null or length(btrim(branch_code)) between 1 and 20),
  constraint billing_customer_email_check check (email is null or length(btrim(email)) between 3 and 320),
  constraint billing_customer_phone_check check (phone is null or length(btrim(phone)) between 3 and 60)
);

create table public.billing_invoice_documents (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.billing_invoices(id) on delete restrict,
  document_number text not null unique,
  command_id uuid not null unique,
  status text not null default 'issued',
  issuer_snapshot jsonb not null,
  recipient_snapshot jsonb not null,
  line_items jsonb not null,
  subtotal_amount numeric(14,2) not null,
  discount_amount numeric(14,2) not null,
  tax_amount numeric(14,2) not null,
  total_amount numeric(14,2) not null,
  currency text not null,
  issued_at timestamptz not null default now(),
  issued_by uuid not null references auth.users(id) on delete restrict,
  canceled_at timestamptz,
  canceled_by uuid references auth.users(id) on delete restrict,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_invoice_document_status_check check (status in ('issued', 'canceled')),
  constraint billing_invoice_document_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint billing_invoice_document_amount_check check (subtotal_amount >= 0 and discount_amount >= 0 and tax_amount >= 0 and total_amount >= 0),
  constraint billing_invoice_document_snapshot_check check (jsonb_typeof(issuer_snapshot) = 'object' and jsonb_typeof(recipient_snapshot) = 'object' and jsonb_typeof(line_items) = 'array'),
  constraint billing_invoice_document_cancel_check check (
    (status = 'issued' and canceled_at is null and canceled_by is null and cancellation_reason is null)
    or (status = 'canceled' and canceled_at is not null and canceled_by is not null and length(btrim(cancellation_reason)) between 3 and 500)
  )
);

create table public.billing_credit_notes (
  id uuid primary key default gen_random_uuid(),
  invoice_document_id uuid not null references public.billing_invoice_documents(id) on delete restrict,
  credit_note_number text not null unique,
  command_id uuid not null unique,
  status text not null default 'issued',
  issuer_snapshot jsonb not null,
  recipient_snapshot jsonb not null,
  line_items jsonb not null,
  subtotal_amount numeric(14,2) not null,
  tax_amount numeric(14,2) not null,
  total_amount numeric(14,2) not null,
  currency text not null,
  reason text not null,
  issued_at timestamptz not null default now(),
  issued_by uuid not null references auth.users(id) on delete restrict,
  canceled_at timestamptz,
  canceled_by uuid references auth.users(id) on delete restrict,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_credit_note_status_check check (status in ('issued', 'canceled')),
  constraint billing_credit_note_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint billing_credit_note_amount_check check (subtotal_amount >= 0 and tax_amount >= 0 and total_amount >= 0 and subtotal_amount + tax_amount = total_amount),
  constraint billing_credit_note_reason_check check (length(btrim(reason)) between 3 and 500),
  constraint billing_credit_note_snapshot_check check (jsonb_typeof(issuer_snapshot) = 'object' and jsonb_typeof(recipient_snapshot) = 'object' and jsonb_typeof(line_items) = 'array'),
  constraint billing_credit_note_cancel_check check (
    (status = 'issued' and canceled_at is null and canceled_by is null and cancellation_reason is null)
    or (status = 'canceled' and canceled_at is not null and canceled_by is not null and length(btrim(cancellation_reason)) between 3 and 500)
  )
);

create index billing_customer_profiles_updated_by_idx on public.billing_customer_profiles (updated_by);
create index billing_invoice_documents_issued_idx on public.billing_invoice_documents (issued_at desc, id desc);
create index billing_invoice_documents_status_idx on public.billing_invoice_documents (status, issued_at desc);
create index billing_credit_notes_invoice_document_idx on public.billing_credit_notes (invoice_document_id, issued_at desc, id desc);
create index billing_credit_notes_status_idx on public.billing_credit_notes (status, issued_at desc);

alter table public.billing_issuer_profiles enable row level security;
alter table public.billing_customer_profiles enable row level security;
alter table public.billing_invoice_documents enable row level security;
alter table public.billing_credit_notes enable row level security;

revoke all on public.billing_issuer_profiles, public.billing_customer_profiles, public.billing_invoice_documents, public.billing_credit_notes from public, anon, authenticated;
grant select on public.billing_issuer_profiles, public.billing_customer_profiles, public.billing_invoice_documents, public.billing_credit_notes to authenticated;

create policy "platform admins can view issuer profiles"
on public.billing_issuer_profiles for select to authenticated
using (private.is_platform_admin());

create policy "authorized users can view customer billing profiles"
on public.billing_customer_profiles for select to authenticated
using (private.is_platform_admin() or private.has_org_permission(organization_id, 'billing.read'::text, null::uuid));

create policy "authorized users can view invoice documents"
on public.billing_invoice_documents for select to authenticated
using (private.is_platform_admin() or exists (
  select 1 from public.billing_invoices i
  where i.id = billing_invoice_documents.invoice_id
    and private.has_org_permission(i.organization_id, 'billing.read'::text, null::uuid)
));

create policy "authorized users can view credit notes"
on public.billing_credit_notes for select to authenticated
using (private.is_platform_admin() or exists (
  select 1
  from public.billing_invoice_documents d
  join public.billing_invoices i on i.id = d.invoice_id
  where d.id = billing_credit_notes.invoice_document_id
    and private.has_org_permission(i.organization_id, 'billing.read'::text, null::uuid)
));

alter table private.billing_audit_logs drop constraint billing_audit_entity_check;
alter table private.billing_audit_logs add constraint billing_audit_entity_check
check (entity_type in ('invoice', 'payment', 'issuer_profile', 'customer_profile', 'invoice_document', 'credit_note'));

create or replace function private.audit_billing_document_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_organization_id uuid;
  v_entity_type text;
begin
  v_entity_type := case tg_table_name
    when 'billing_issuer_profiles' then 'issuer_profile'
    when 'billing_customer_profiles' then 'customer_profile'
    when 'billing_invoice_documents' then 'invoice_document'
    when 'billing_credit_notes' then 'credit_note'
  end;

  if tg_table_name = 'billing_customer_profiles' then
    v_organization_id := new.organization_id;
  elsif tg_table_name = 'billing_invoice_documents' then
    select organization_id into v_organization_id from public.billing_invoices where id = new.invoice_id;
  elsif tg_table_name = 'billing_credit_notes' then
    select i.organization_id into v_organization_id
    from public.billing_invoice_documents d
    join public.billing_invoices i on i.id = d.invoice_id
    where d.id = new.invoice_document_id;
  else
    v_organization_id := null;
  end if;

  insert into private.billing_audit_logs (entity_type, entity_id, organization_id, action, actor_user_id, before_data, after_data)
  values (v_entity_type, coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(new) ->> 'organization_id')::uuid), v_organization_id, case when tg_op = 'INSERT' then 'created' else 'updated' end, (select auth.uid()), case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
  return new;
end;
$$;
revoke all on function private.audit_billing_document_write() from public, anon, authenticated;

create trigger audit_billing_issuer_profile_write after insert or update on public.billing_issuer_profiles for each row execute function private.audit_billing_document_write();
create trigger audit_billing_customer_profile_write after insert or update on public.billing_customer_profiles for each row execute function private.audit_billing_document_write();
create trigger audit_billing_invoice_document_write after insert or update on public.billing_invoice_documents for each row execute function private.audit_billing_document_write();
create trigger audit_billing_credit_note_write after insert or update on public.billing_credit_notes for each row execute function private.audit_billing_document_write();

create or replace function private.prevent_invoice_commercial_changes()
returns trigger
language plpgsql
set search_path = public, private, pg_catalog
as $$
begin
  if old.invoice_number is distinct from new.invoice_number
    or old.command_id is distinct from new.command_id
    or old.organization_id is distinct from new.organization_id
    or old.subscription_id is distinct from new.subscription_id
    or old.plan_version_id is distinct from new.plan_version_id
    or old.plan_price_id is distinct from new.plan_price_id
    or old.billing_interval is distinct from new.billing_interval
    or old.billing_period_start is distinct from new.billing_period_start
    or old.billing_period_end is distinct from new.billing_period_end
    or old.currency is distinct from new.currency
    or old.subtotal_amount is distinct from new.subtotal_amount
    or old.discount_amount is distinct from new.discount_amount
    or old.tax_amount is distinct from new.tax_amount
    or old.issued_at is distinct from new.issued_at
    or old.due_at is distinct from new.due_at
    or old.reason is distinct from new.reason
    or old.metadata is distinct from new.metadata
    or old.created_by is distinct from new.created_by
  then raise exception 'invoice_commercial_snapshot_is_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_invoice_commercial_changes() from public, anon, authenticated;
create trigger prevent_invoice_commercial_changes before update on public.billing_invoices for each row execute function private.prevent_invoice_commercial_changes();

create or replace function private.prevent_invoice_document_mutation()
returns trigger
language plpgsql
set search_path = public, private, pg_catalog
as $$
begin
  if old.invoice_id is distinct from new.invoice_id
    or old.document_number is distinct from new.document_number
    or old.command_id is distinct from new.command_id
    or old.issuer_snapshot is distinct from new.issuer_snapshot
    or old.recipient_snapshot is distinct from new.recipient_snapshot
    or old.line_items is distinct from new.line_items
    or old.subtotal_amount is distinct from new.subtotal_amount
    or old.discount_amount is distinct from new.discount_amount
    or old.tax_amount is distinct from new.tax_amount
    or old.total_amount is distinct from new.total_amount
    or old.currency is distinct from new.currency
    or old.issued_at is distinct from new.issued_at
    or old.issued_by is distinct from new.issued_by
    or old.created_at is distinct from new.created_at
  then raise exception 'invoice_document_snapshot_is_immutable' using errcode = '23514';
  end if;
  if old.status = 'canceled' then raise exception 'canceled_document_is_final' using errcode = '23514'; end if;
  return new;
end;
$$;
revoke all on function private.prevent_invoice_document_mutation() from public, anon, authenticated;
create trigger prevent_invoice_document_mutation before update on public.billing_invoice_documents for each row execute function private.prevent_invoice_document_mutation();

create or replace function private.prevent_credit_note_mutation()
returns trigger
language plpgsql
set search_path = public, private, pg_catalog
as $$
begin
  if old.invoice_document_id is distinct from new.invoice_document_id
    or old.credit_note_number is distinct from new.credit_note_number
    or old.command_id is distinct from new.command_id
    or old.issuer_snapshot is distinct from new.issuer_snapshot
    or old.recipient_snapshot is distinct from new.recipient_snapshot
    or old.line_items is distinct from new.line_items
    or old.subtotal_amount is distinct from new.subtotal_amount
    or old.tax_amount is distinct from new.tax_amount
    or old.total_amount is distinct from new.total_amount
    or old.currency is distinct from new.currency
    or old.reason is distinct from new.reason
    or old.issued_at is distinct from new.issued_at
    or old.issued_by is distinct from new.issued_by
    or old.created_at is distinct from new.created_at
  then raise exception 'credit_note_snapshot_is_immutable' using errcode = '23514';
  end if;
  if old.status = 'canceled' then raise exception 'canceled_credit_note_is_final' using errcode = '23514'; end if;
  return new;
end;
$$;
revoke all on function private.prevent_credit_note_mutation() from public, anon, authenticated;
create trigger prevent_credit_note_mutation before update on public.billing_credit_notes for each row execute function private.prevent_credit_note_mutation();

create or replace function public.platform_upsert_billing_issuer_profile(
  p_legal_name text, p_tax_id text, p_branch_code text, p_address text, p_email text, p_phone text
)
returns public.billing_issuer_profiles
language plpgsql security definer
set search_path = public, private, pg_catalog
as $$
declare v_profile public.billing_issuer_profiles;
begin
  if not private.is_platform_admin() then raise exception 'platform_admin_aal2_required' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_legal_name, ''))) < 2 or length(btrim(coalesce(p_address, ''))) < 5 then raise exception 'issuer_legal_name_and_address_required'; end if;
  select * into v_profile from public.billing_issuer_profiles where is_active for update;
  if found then
    update public.billing_issuer_profiles set legal_name = btrim(p_legal_name), tax_id = nullif(btrim(p_tax_id), ''), branch_code = nullif(btrim(p_branch_code), ''), address = btrim(p_address), email = nullif(btrim(p_email), ''), phone = nullif(btrim(p_phone), ''), updated_by = (select auth.uid()), updated_at = now() where id = v_profile.id returning * into v_profile;
  else
    insert into public.billing_issuer_profiles (legal_name, tax_id, branch_code, address, email, phone, created_by, updated_by) values (btrim(p_legal_name), nullif(btrim(p_tax_id), ''), nullif(btrim(p_branch_code), ''), btrim(p_address), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''), (select auth.uid()), (select auth.uid())) returning * into v_profile;
  end if;
  return v_profile;
end;
$$;

create or replace function public.platform_upsert_billing_customer_profile(
  p_organization_id uuid, p_legal_name text, p_tax_id text, p_branch_code text, p_address text, p_email text, p_phone text
)
returns public.billing_customer_profiles
language plpgsql security definer
set search_path = public, private, pg_catalog
as $$
declare v_profile public.billing_customer_profiles;
begin
  if not private.is_platform_admin() then raise exception 'platform_admin_aal2_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'organization_not_found'; end if;
  if length(btrim(coalesce(p_legal_name, ''))) < 2 or length(btrim(coalesce(p_address, ''))) < 5 then raise exception 'customer_legal_name_and_address_required'; end if;
  insert into public.billing_customer_profiles (organization_id, legal_name, tax_id, branch_code, address, email, phone, updated_by)
  values (p_organization_id, btrim(p_legal_name), nullif(btrim(p_tax_id), ''), nullif(btrim(p_branch_code), ''), btrim(p_address), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''), (select auth.uid()))
  on conflict (organization_id) do update set legal_name = excluded.legal_name, tax_id = excluded.tax_id, branch_code = excluded.branch_code, address = excluded.address, email = excluded.email, phone = excluded.phone, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_profile;
  return v_profile;
end;
$$;

create or replace function public.platform_issue_billing_invoice_document(p_invoice_id uuid, p_command_id uuid)
returns public.billing_invoice_documents
language plpgsql security definer
set search_path = public, private, pg_catalog
as $$
declare v_invoice public.billing_invoices; v_issuer public.billing_issuer_profiles; v_customer public.billing_customer_profiles; v_document public.billing_invoice_documents; v_now timestamptz := now();
begin
  if not private.is_platform_admin() then raise exception 'platform_admin_aal2_required' using errcode = '42501'; end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  select * into v_document from public.billing_invoice_documents where command_id = p_command_id;
  if found then return v_document; end if;
  select * into v_document from public.billing_invoice_documents where invoice_id = p_invoice_id;
  if found then raise exception 'invoice_document_already_issued'; end if;
  select * into v_invoice from public.billing_invoices where id = p_invoice_id;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_invoice.status = 'canceled' then raise exception 'cannot_issue_document_for_canceled_invoice'; end if;
  select * into v_issuer from public.billing_issuer_profiles where is_active;
  if not found then raise exception 'billing_issuer_profile_required'; end if;
  select * into v_customer from public.billing_customer_profiles where organization_id = v_invoice.organization_id;
  if not found then raise exception 'billing_customer_profile_required'; end if;
  insert into public.billing_invoice_documents (invoice_id, document_number, command_id, issuer_snapshot, recipient_snapshot, line_items, subtotal_amount, discount_amount, tax_amount, total_amount, currency, issued_at, issued_by)
  values (v_invoice.id, 'BILL-' || to_char(v_now at time zone 'Asia/Bangkok', 'YYYYMM') || '-' || lpad(nextval('public.billing_document_number_seq')::text, 6, '0'), p_command_id,
    jsonb_build_object('legal_name', v_issuer.legal_name, 'tax_id', v_issuer.tax_id, 'branch_code', v_issuer.branch_code, 'address', v_issuer.address, 'email', v_issuer.email, 'phone', v_issuer.phone),
    jsonb_build_object('legal_name', v_customer.legal_name, 'tax_id', v_customer.tax_id, 'branch_code', v_customer.branch_code, 'address', v_customer.address, 'email', v_customer.email, 'phone', v_customer.phone),
    jsonb_build_array(jsonb_build_object('description', 'Subscription ' || v_invoice.billing_interval || ' (' || to_char(v_invoice.billing_period_start at time zone 'Asia/Bangkok', 'YYYY-MM-DD') || ' – ' || to_char(v_invoice.billing_period_end at time zone 'Asia/Bangkok', 'YYYY-MM-DD') || ')', 'subtotal_amount', v_invoice.subtotal_amount, 'discount_amount', v_invoice.discount_amount, 'tax_amount', v_invoice.tax_amount, 'total_amount', v_invoice.total_amount, 'currency', v_invoice.currency)),
    v_invoice.subtotal_amount, v_invoice.discount_amount, v_invoice.tax_amount, v_invoice.total_amount, v_invoice.currency, v_now, (select auth.uid())) returning * into v_document;
  return v_document;
end;
$$;

create or replace function public.platform_cancel_billing_invoice_document(p_document_id uuid, p_reason text)
returns public.billing_invoice_documents
language plpgsql security definer
set search_path = public, private, pg_catalog
as $$
declare v_document public.billing_invoice_documents; v_invoice public.billing_invoices;
begin
  if not private.is_platform_admin() then raise exception 'platform_admin_aal2_required' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'billing_reason_too_short'; end if;
  select * into v_document from public.billing_invoice_documents where id = p_document_id for update;
  if not found then raise exception 'invoice_document_not_found'; end if;
  if v_document.status = 'canceled' then return v_document; end if;
  select * into v_invoice from public.billing_invoices where id = v_document.invoice_id;
  if v_invoice.status <> 'canceled' then raise exception 'cancel_invoice_before_canceling_document'; end if;
  update public.billing_invoice_documents set status = 'canceled', canceled_at = now(), canceled_by = (select auth.uid()), cancellation_reason = btrim(p_reason), updated_at = now() where id = v_document.id returning * into v_document;
  return v_document;
end;
$$;

create or replace function public.platform_create_billing_credit_note(p_invoice_document_id uuid, p_subtotal_amount numeric, p_tax_amount numeric, p_reason text, p_command_id uuid)
returns public.billing_credit_notes
language plpgsql security definer
set search_path = public, private, pg_catalog
as $$
declare v_document public.billing_invoice_documents; v_invoice public.billing_invoices; v_credit public.billing_credit_notes; v_existing_total numeric(14,2); v_total numeric(14,2); v_now timestamptz := now();
begin
  if not private.is_platform_admin() then raise exception 'platform_admin_aal2_required' using errcode = '42501'; end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if coalesce(p_subtotal_amount, -1) < 0 or coalesce(p_tax_amount, -1) < 0 then raise exception 'invalid_credit_amount'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'billing_reason_too_short'; end if;
  select * into v_credit from public.billing_credit_notes where command_id = p_command_id;
  if found then return v_credit; end if;
  select * into v_document from public.billing_invoice_documents where id = p_invoice_document_id for update;
  if not found then raise exception 'invoice_document_not_found'; end if;
  if v_document.status <> 'issued' then raise exception 'invoice_document_not_issued'; end if;
  select * into v_invoice from public.billing_invoices where id = v_document.invoice_id;
  if v_invoice.status <> 'paid' then raise exception 'credit_note_requires_paid_invoice'; end if;
  v_total := p_subtotal_amount + p_tax_amount;
  select coalesce(sum(total_amount), 0) into v_existing_total from public.billing_credit_notes where invoice_document_id = v_document.id and status = 'issued';
  if v_existing_total + v_total > v_document.total_amount then raise exception 'credit_note_exceeds_invoice_total'; end if;
  insert into public.billing_credit_notes (invoice_document_id, credit_note_number, command_id, issuer_snapshot, recipient_snapshot, line_items, subtotal_amount, tax_amount, total_amount, currency, reason, issued_at, issued_by)
  values (v_document.id, 'CRN-' || to_char(v_now at time zone 'Asia/Bangkok', 'YYYYMM') || '-' || lpad(nextval('public.billing_credit_note_number_seq')::text, 6, '0'), p_command_id, v_document.issuer_snapshot, v_document.recipient_snapshot,
    jsonb_build_array(jsonb_build_object('description', 'Credit note for ' || v_document.document_number, 'subtotal_amount', p_subtotal_amount, 'tax_amount', p_tax_amount, 'total_amount', v_total, 'currency', v_document.currency)), p_subtotal_amount, p_tax_amount, v_total, v_document.currency, btrim(p_reason), v_now, (select auth.uid())) returning * into v_credit;
  return v_credit;
end;
$$;

create or replace function public.platform_cancel_billing_credit_note(p_credit_note_id uuid, p_reason text)
returns public.billing_credit_notes
language plpgsql security definer
set search_path = public, private, pg_catalog
as $$
declare v_credit public.billing_credit_notes;
begin
  if not private.is_platform_admin() then raise exception 'platform_admin_aal2_required' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'billing_reason_too_short'; end if;
  select * into v_credit from public.billing_credit_notes where id = p_credit_note_id for update;
  if not found then raise exception 'credit_note_not_found'; end if;
  if v_credit.status = 'canceled' then return v_credit; end if;
  update public.billing_credit_notes set status = 'canceled', canceled_at = now(), canceled_by = (select auth.uid()), cancellation_reason = btrim(p_reason), updated_at = now() where id = v_credit.id returning * into v_credit;
  return v_credit;
end;
$$;

revoke all on function public.platform_upsert_billing_issuer_profile(text, text, text, text, text, text) from public, anon;
grant execute on function public.platform_upsert_billing_issuer_profile(text, text, text, text, text, text) to authenticated;
revoke all on function public.platform_upsert_billing_customer_profile(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.platform_upsert_billing_customer_profile(uuid, text, text, text, text, text, text) to authenticated;
revoke all on function public.platform_issue_billing_invoice_document(uuid, uuid) from public, anon;
grant execute on function public.platform_issue_billing_invoice_document(uuid, uuid) to authenticated;
revoke all on function public.platform_cancel_billing_invoice_document(uuid, text) from public, anon;
grant execute on function public.platform_cancel_billing_invoice_document(uuid, text) to authenticated;
revoke all on function public.platform_create_billing_credit_note(uuid, numeric, numeric, text, uuid) from public, anon;
grant execute on function public.platform_create_billing_credit_note(uuid, numeric, numeric, text, uuid) to authenticated;
revoke all on function public.platform_cancel_billing_credit_note(uuid, text) from public, anon;
grant execute on function public.platform_cancel_billing_credit_note(uuid, text) to authenticated;

comment on table public.billing_invoice_documents is 'Immutable billing document snapshot. It can only transition from issued to canceled after its source invoice is canceled.';
comment on table public.billing_credit_notes is 'Immutable credit note snapshot for a paid invoice document. It does not process a refund.';
comment on table public.billing_issuer_profiles is 'Platform billing issuer identity. The active profile is snapshotted into every issued document.';
comment on table public.billing_customer_profiles is 'Organization billing recipient identity. The profile is snapshotted into each issued document.';
