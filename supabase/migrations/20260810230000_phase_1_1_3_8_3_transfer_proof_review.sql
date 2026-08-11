-- AVENZO ONE Phase 1.1.3.8.3: Platform Admin transfer-proof review queue.
-- This phase classifies evidence only. It never creates a Payment or changes an
-- Invoice / Subscription to paid or active.

alter table public.billing_transfer_proofs
  add column review_command_id uuid,
  add column reviewed_by uuid references auth.users(id) on delete restrict,
  add column reviewed_at timestamptz,
  add column review_reason text;

alter table public.billing_transfer_proofs
  add constraint billing_transfer_proof_review_reason_check
    check (review_reason is null or length(btrim(review_reason)) between 3 and 500),
  add constraint billing_transfer_proof_review_result_check
    check (
      (status in ('accepted', 'rejected')
        and review_command_id is not null
        and reviewed_by is not null
        and reviewed_at is not null
        and review_reason is not null)
      or
      (status not in ('accepted', 'rejected')
        and review_command_id is null
        and reviewed_by is null
        and reviewed_at is null
        and review_reason is null)
    );

create unique index billing_transfer_proofs_review_command_key
on public.billing_transfer_proofs (review_command_id)
where review_command_id is not null;

create unique index billing_transfer_proofs_one_accepted_per_invoice_key
on public.billing_transfer_proofs (invoice_id)
where status = 'accepted';

create index billing_transfer_proofs_review_queue_idx
on public.billing_transfer_proofs (submitted_at, created_at, id)
where status in ('submitted', 'under_review');

create or replace function public.platform_billing_transfer_proof_review_queue()
returns table (
  proof_id uuid,
  invoice_id uuid,
  invoice_number text,
  invoice_status text,
  invoice_total numeric,
  currency text,
  organization_id uuid,
  organization_name text,
  transfer_channel_id uuid,
  channel_display_name text,
  channel_provider_name text,
  channel_account_name text,
  channel_account_identifier text,
  storage_bucket text,
  storage_path text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  claimed_amount numeric,
  claimed_transfer_at timestamptz,
  customer_note text,
  proof_status text,
  uploaded_by uuid,
  uploader_email text,
  submitted_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.invoice_id,
    i.invoice_number,
    i.status,
    i.total_amount,
    i.currency,
    p.organization_id,
    o.name,
    p.transfer_channel_id,
    c.display_name,
    c.provider_name,
    c.account_name,
    c.account_identifier,
    p.storage_bucket,
    p.storage_path,
    p.original_file_name,
    p.mime_type,
    p.file_size_bytes,
    p.claimed_amount,
    p.claimed_transfer_at,
    p.customer_note,
    p.status,
    p.uploaded_by,
    u.email::text,
    p.submitted_at,
    p.created_at
  from public.billing_transfer_proofs p
  join public.billing_invoices i on i.id = p.invoice_id
  join public.organizations o on o.id = p.organization_id
  join public.billing_transfer_channels c on c.id = p.transfer_channel_id
  left join auth.users u on u.id = p.uploaded_by
  where p.status in ('submitted', 'under_review')
  order by p.submitted_at nulls last, p.created_at, p.id
  limit 100;
end;
$$;

revoke all on function public.platform_billing_transfer_proof_review_queue() from public, anon;
grant execute on function public.platform_billing_transfer_proof_review_queue() to authenticated;

create or replace function public.platform_review_billing_transfer_proof(
  p_proof_id uuid,
  p_decision text,
  p_reason text,
  p_command_id uuid
)
returns public.billing_transfer_proofs
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_proof public.billing_transfer_proofs;
  v_existing public.billing_transfer_proofs;
  v_invoice_status text;
  v_next_status text;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_proof_id is null then raise exception 'transfer_proof_required'; end if;
  if p_command_id is null then raise exception 'transfer_proof_review_command_required'; end if;
  if p_decision not in ('accept', 'reject') then raise exception 'transfer_proof_decision_invalid'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'transfer_proof_review_reason_invalid';
  end if;

  select * into v_existing
  from public.billing_transfer_proofs
  where review_command_id = p_command_id;
  if found then
    if v_existing.id <> p_proof_id
      or v_existing.status <> (case when p_decision = 'accept' then 'accepted' else 'rejected' end) then
      raise exception 'transfer_proof_review_command_conflict';
    end if;
    return v_existing;
  end if;

  select * into v_proof
  from public.billing_transfer_proofs
  where id = p_proof_id
  for update;
  if not found then raise exception 'transfer_proof_not_found'; end if;
  if v_proof.status not in ('submitted', 'under_review') then
    raise exception 'transfer_proof_already_reviewed';
  end if;

  select status into v_invoice_status
  from public.billing_invoices
  where id = v_proof.invoice_id
  for update;
  if v_invoice_status is null then raise exception 'billing_invoice_not_found'; end if;
  if p_decision = 'accept' and v_invoice_status <> 'pending' then
    raise exception 'billing_invoice_not_pending';
  end if;
  if p_decision = 'accept' and exists (
    select 1 from public.billing_transfer_proofs other
    where other.invoice_id = v_proof.invoice_id
      and other.status = 'accepted'
      and other.id <> v_proof.id
  ) then
    raise exception 'billing_invoice_transfer_proof_already_accepted';
  end if;

  v_next_status := case when p_decision = 'accept' then 'accepted' else 'rejected' end;
  update public.billing_transfer_proofs
  set status = v_next_status,
      review_command_id = p_command_id,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_reason = btrim(p_reason),
      updated_at = now()
  where id = v_proof.id and status in ('submitted', 'under_review')
  returning * into v_proof;
  if not found then raise exception 'transfer_proof_already_reviewed'; end if;

  return v_proof;
exception
  when unique_violation then
    select * into v_existing
    from public.billing_transfer_proofs
    where review_command_id = p_command_id;
    if found and v_existing.id = p_proof_id then return v_existing; end if;
    raise exception 'billing_invoice_transfer_proof_already_accepted';
end;
$$;

revoke all on function public.platform_review_billing_transfer_proof(uuid, text, text, uuid) from public, anon;
grant execute on function public.platform_review_billing_transfer_proof(uuid, text, text, uuid) to authenticated;

comment on function public.platform_billing_transfer_proof_review_queue() is
  'Returns the oldest pending private transfer evidence to an AAL2 Platform Admin.';
comment on function public.platform_review_billing_transfer_proof(uuid, text, text, uuid) is
  'Accepts or rejects transfer evidence exactly once without creating Payment or changing Invoice/Subscription state.';
