-- AVENZO ONE Phase 1.1.3.8.2: private customer transfer-proof upload.
-- Uploading a proof never marks an invoice, payment, or subscription as paid.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'billing-transfer-proofs',
  'billing-transfer-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.billing_transfer_proofs (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null unique,
  invoice_id uuid not null references public.billing_invoices(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  transfer_channel_id uuid not null references public.billing_transfer_channels(id) on delete restrict,
  storage_bucket text not null default 'billing-transfer-proofs',
  storage_path text not null unique,
  original_file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  claimed_amount numeric(14,2) not null,
  claimed_transfer_at timestamptz not null,
  customer_note text,
  status text not null default 'uploading',
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_transfer_proof_bucket_check check (storage_bucket = 'billing-transfer-proofs'),
  constraint billing_transfer_proof_file_name_check check (length(btrim(original_file_name)) between 1 and 180),
  constraint billing_transfer_proof_mime_check check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  constraint billing_transfer_proof_size_check check (file_size_bytes between 1 and 5242880),
  constraint billing_transfer_proof_amount_check check (claimed_amount > 0),
  constraint billing_transfer_proof_note_check check (customer_note is null or length(btrim(customer_note)) between 1 and 500),
  constraint billing_transfer_proof_status_check check (status in ('uploading', 'submitted', 'under_review', 'accepted', 'rejected', 'canceled')),
  constraint billing_transfer_proof_submitted_check check (
    (status = 'uploading' and submitted_at is null)
    or (status <> 'uploading' and submitted_at is not null)
  )
);

create index billing_transfer_proofs_invoice_created_idx
on public.billing_transfer_proofs (invoice_id, created_at desc, id desc);
create index billing_transfer_proofs_organization_status_idx
on public.billing_transfer_proofs (organization_id, status, created_at desc, id desc);
create index billing_transfer_proofs_uploaded_by_idx
on public.billing_transfer_proofs (uploaded_by, created_at desc);

alter table public.billing_transfer_proofs enable row level security;
revoke all on public.billing_transfer_proofs from public, anon, authenticated;
grant select on public.billing_transfer_proofs to authenticated;

create policy "authorized organization users can view transfer proofs"
on public.billing_transfer_proofs for select to authenticated
using (
  private.is_platform_admin()
  or private.has_org_permission(organization_id, 'billing.read'::text, null::uuid)
);

alter table private.billing_audit_logs drop constraint billing_audit_entity_check;
alter table private.billing_audit_logs add constraint billing_audit_entity_check
check (entity_type in ('invoice', 'payment', 'issuer_profile', 'customer_profile', 'invoice_document', 'credit_note', 'bank_transfer_channel', 'bank_transfer_proof'));

create or replace function private.audit_billing_transfer_proof_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  insert into private.billing_audit_logs (
    entity_type, entity_id, organization_id, action, actor_user_id, before_data, after_data
  ) values (
    'bank_transfer_proof', new.id, new.organization_id,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    (select auth.uid()),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;
revoke all on function private.audit_billing_transfer_proof_write() from public, anon, authenticated;

create trigger audit_billing_transfer_proof_write
after insert or update on public.billing_transfer_proofs
for each row execute function private.audit_billing_transfer_proof_write();

create or replace function public.customer_active_billing_transfer_channels(p_organization_id uuid)
returns setof public.billing_transfer_channels
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if (select auth.uid()) is null
    or not private.has_org_permission(p_organization_id, 'billing.read'::text, null::uuid) then
    raise exception 'billing_read_permission_required' using errcode = '42501';
  end if;

  return query
  select c.*
  from public.billing_transfer_channels c
  where c.status = 'active'
  order by c.display_order, c.created_at, c.id;
end;
$$;
revoke all on function public.customer_active_billing_transfer_channels(uuid) from public, anon;
grant execute on function public.customer_active_billing_transfer_channels(uuid) to authenticated;

create or replace function public.customer_prepare_billing_transfer_proof(
  p_invoice_id uuid,
  p_transfer_channel_id uuid,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_claimed_amount numeric,
  p_claimed_transfer_at timestamptz,
  p_customer_note text,
  p_command_id uuid
)
returns public.billing_transfer_proofs
language plpgsql
security definer
set search_path = public, private, storage, pg_catalog
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invoice public.billing_invoices;
  v_proof public.billing_transfer_proofs;
  v_proof_id uuid := gen_random_uuid();
  v_extension text;
  v_path text;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_command_id is null then raise exception 'transfer_proof_command_required'; end if;

  select * into v_proof
  from public.billing_transfer_proofs
  where command_id = p_command_id and uploaded_by = v_user_id;
  if found then return v_proof; end if;

  select * into v_invoice from public.billing_invoices where id = p_invoice_id;
  if not found then raise exception 'billing_invoice_not_found'; end if;
  if v_invoice.status <> 'pending' then raise exception 'billing_invoice_not_pending'; end if;
  if not private.has_org_permission(v_invoice.organization_id, 'billing.read'::text, null::uuid) then
    raise exception 'billing_read_permission_required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.billing_transfer_channels
    where id = p_transfer_channel_id and status = 'active'
  ) then
    raise exception 'active_transfer_channel_required';
  end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'unsupported_transfer_proof_type';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes < 1 or p_file_size_bytes > 5242880 then
    raise exception 'transfer_proof_file_too_large';
  end if;
  if length(btrim(coalesce(p_original_file_name, ''))) < 1
    or length(btrim(p_original_file_name)) > 180 then
    raise exception 'invalid_transfer_proof_file_name';
  end if;
  if p_claimed_amount is null or p_claimed_amount <= 0 then raise exception 'invalid_claimed_transfer_amount'; end if;
  if p_claimed_transfer_at is null or p_claimed_transfer_at > now() + interval '10 minutes' then
    raise exception 'invalid_claimed_transfer_time';
  end if;
  if nullif(btrim(coalesce(p_customer_note, '')), '') is not null
    and length(btrim(p_customer_note)) > 500 then
    raise exception 'transfer_proof_note_too_long';
  end if;

  v_extension := case p_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'application/pdf' then 'pdf'
  end;
  v_path := v_invoice.organization_id::text || '/' || v_invoice.id::text || '/' || v_user_id::text || '/' || v_proof_id::text || '.' || v_extension;

  insert into public.billing_transfer_proofs (
    id, command_id, invoice_id, organization_id, transfer_channel_id,
    storage_path, original_file_name, mime_type, file_size_bytes,
    claimed_amount, claimed_transfer_at, customer_note, uploaded_by
  ) values (
    v_proof_id, p_command_id, v_invoice.id, v_invoice.organization_id, p_transfer_channel_id,
    v_path, btrim(p_original_file_name), p_mime_type, p_file_size_bytes,
    p_claimed_amount, p_claimed_transfer_at, nullif(btrim(coalesce(p_customer_note, '')), ''), v_user_id
  ) returning * into v_proof;

  return v_proof;
exception
  when unique_violation then
    select * into v_proof
    from public.billing_transfer_proofs
    where command_id = p_command_id and uploaded_by = v_user_id;
    if found then return v_proof; end if;
    raise;
end;
$$;

revoke all on function public.customer_prepare_billing_transfer_proof(uuid, uuid, text, text, bigint, numeric, timestamptz, text, uuid) from public, anon;
grant execute on function public.customer_prepare_billing_transfer_proof(uuid, uuid, text, text, bigint, numeric, timestamptz, text, uuid) to authenticated;

create policy "customers can upload prepared transfer proofs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'billing-transfer-proofs'
  and exists (
    select 1
    from public.billing_transfer_proofs p
    where p.storage_bucket = bucket_id
      and p.storage_path = name
      and p.uploaded_by = (select auth.uid())
      and p.status = 'uploading'
      and private.has_org_permission(p.organization_id, 'billing.read'::text, null::uuid)
  )
);

create policy "authorized users can read transfer proof files"
on storage.objects for select to authenticated
using (
  bucket_id = 'billing-transfer-proofs'
  and exists (
    select 1
    from public.billing_transfer_proofs p
    where p.storage_bucket = bucket_id
      and p.storage_path = name
      and (
        p.uploaded_by = (select auth.uid())
        or private.is_platform_admin()
        or private.has_org_permission(p.organization_id, 'billing.read'::text, null::uuid)
      )
  )
);

create or replace function public.customer_finalize_billing_transfer_proof(p_proof_id uuid)
returns public.billing_transfer_proofs
language plpgsql
security definer
set search_path = public, private, storage, pg_catalog
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_proof public.billing_transfer_proofs;
  v_object storage.objects;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;

  select * into v_proof
  from public.billing_transfer_proofs
  where id = p_proof_id and uploaded_by = v_user_id
  for update;
  if not found then raise exception 'transfer_proof_not_found'; end if;
  if v_proof.status = 'submitted' then return v_proof; end if;
  if v_proof.status <> 'uploading' then raise exception 'transfer_proof_not_uploadable'; end if;
  if not private.has_org_permission(v_proof.organization_id, 'billing.read'::text, null::uuid) then
    raise exception 'billing_read_permission_required' using errcode = '42501';
  end if;

  select * into v_object
  from storage.objects
  where bucket_id = v_proof.storage_bucket and name = v_proof.storage_path;
  if not found then raise exception 'transfer_proof_file_missing'; end if;
  if coalesce(v_object.metadata ->> 'mimetype', '') <> v_proof.mime_type then
    raise exception 'transfer_proof_mime_mismatch';
  end if;
  if coalesce((v_object.metadata ->> 'size')::bigint, 0) <> v_proof.file_size_bytes then
    raise exception 'transfer_proof_size_mismatch';
  end if;

  update public.billing_transfer_proofs
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where id = v_proof.id
  returning * into v_proof;

  return v_proof;
end;
$$;

revoke all on function public.customer_finalize_billing_transfer_proof(uuid) from public, anon;
grant execute on function public.customer_finalize_billing_transfer_proof(uuid) to authenticated;

comment on table public.billing_transfer_proofs is
  'Private customer-submitted transfer evidence. A submitted proof is not payment confirmation.';
comment on function public.customer_prepare_billing_transfer_proof(uuid, uuid, text, text, bigint, numeric, timestamptz, text, uuid) is
  'Creates a one-use private Storage path after invoice, channel, membership, MIME and size validation.';
comment on function public.customer_finalize_billing_transfer_proof(uuid) is
  'Verifies the uploaded Storage object and records evidence submission without changing payment state.';

