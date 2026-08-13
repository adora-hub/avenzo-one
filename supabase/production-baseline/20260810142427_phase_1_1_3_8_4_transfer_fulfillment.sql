-- AVENZO ONE Phase 1.1.3.8.4: atomic fulfillment for accepted bank-transfer evidence.
-- A different AAL2 Platform Admin must perform fulfillment after evidence review.

alter table public.billing_transfer_proofs
  add column fulfillment_command_id uuid,
  add column fulfilled_payment_id uuid references public.billing_payments(id) on delete restrict,
  add column fulfilled_by uuid references auth.users(id) on delete restrict,
  add column fulfilled_at timestamptz,
  add column fulfillment_reason text;

alter table public.billing_transfer_proofs
  add constraint billing_transfer_proof_fulfillment_reason_check
    check (fulfillment_reason is null or length(btrim(fulfillment_reason)) between 3 and 500),
  add constraint billing_transfer_proof_fulfillment_state_check
    check (
      (fulfillment_command_id is null
        and fulfilled_payment_id is null
        and fulfilled_by is null
        and fulfilled_at is null
        and fulfillment_reason is null)
      or
      (status = 'accepted'
        and fulfillment_command_id is not null
        and fulfilled_payment_id is not null
        and fulfilled_by is not null
        and fulfilled_at is not null
        and fulfillment_reason is not null)
    );

create unique index billing_transfer_proofs_fulfillment_command_key
on public.billing_transfer_proofs (fulfillment_command_id)
where fulfillment_command_id is not null;

create unique index billing_transfer_proofs_fulfilled_payment_key
on public.billing_transfer_proofs (fulfilled_payment_id)
where fulfilled_payment_id is not null;

create unique index billing_payments_transfer_proof_key
on public.billing_payments (provider_reference)
where provider = 'bank_transfer' and provider_reference is not null;

create index billing_transfer_proofs_fulfillment_queue_idx
on public.billing_transfer_proofs (reviewed_at, id)
where status = 'accepted' and fulfilled_payment_id is null;

create or replace function public.platform_billing_transfer_fulfillment_queue()
returns table (
  proof_id uuid, invoice_id uuid, invoice_number text, invoice_status text,
  invoice_total numeric, currency text, billing_period_start timestamptz,
  billing_period_end timestamptz, organization_id uuid, organization_name text,
  subscription_id uuid, subscription_status text, plan_code text,
  plan_version_id uuid, plan_version_label text, grace_period_days integer,
  channel_display_name text, channel_provider_name text, channel_account_name text,
  channel_account_identifier text, claimed_amount numeric, claimed_transfer_at timestamptz,
  original_file_name text, reviewed_by uuid, reviewer_email text,
  reviewed_at timestamptz, review_reason text
)
language plpgsql stable security definer set search_path = pg_catalog
as $$
begin
  if not private.is_platform_admin() then raise exception 'platform_admin_aal2_required' using errcode = '42501'; end if;
  return query
  select p.id, i.id, i.invoice_number, i.status, i.total_amount, i.currency,
    i.billing_period_start, i.billing_period_end, i.organization_id, o.name,
    i.subscription_id, s.lifecycle_status, s.plan_code, s.plan_version_id,
    v.label, v.grace_period_days, c.display_name, c.provider_name, c.account_name,
    c.account_identifier, p.claimed_amount, p.claimed_transfer_at, p.original_file_name,
    p.reviewed_by, reviewer.email::text, p.reviewed_at, p.review_reason
  from public.billing_transfer_proofs p
  join public.billing_invoices i on i.id = p.invoice_id
  join public.organizations o on o.id = i.organization_id
  join public.organization_subscriptions s on s.id = i.subscription_id
  join public.subscription_plan_versions v on v.id = i.plan_version_id
  join public.billing_transfer_channels c on c.id = p.transfer_channel_id
  left join auth.users reviewer on reviewer.id = p.reviewed_by
  where p.status = 'accepted' and p.fulfilled_payment_id is null
  order by p.reviewed_at nulls last, p.id limit 100;
end;
$$;

revoke all on function public.platform_billing_transfer_fulfillment_queue() from public, anon;
grant execute on function public.platform_billing_transfer_fulfillment_queue() to authenticated;

create or replace function public.platform_fulfill_billing_transfer_proof(
  p_proof_id uuid, p_reason text, p_command_id uuid
)
returns table (
  proof_id uuid, payment_id uuid, payment_number text, invoice_id uuid,
  invoice_status text, subscription_id uuid, subscription_status text,
  subscription_expires_at timestamptz, subscription_grace_ends_at timestamptz,
  fulfilled_at timestamptz
)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_proof public.billing_transfer_proofs;
  v_existing public.billing_transfer_proofs;
  v_invoice public.billing_invoices;
  v_subscription public.organization_subscriptions;
  v_version public.subscription_plan_versions;
  v_payment public.billing_payments;
  v_now timestamptz := now();
  v_grace_ends_at timestamptz;
begin
  if not private.is_platform_admin() then raise exception 'platform_admin_aal2_required' using errcode = '42501'; end if;
  if p_proof_id is null then raise exception 'transfer_proof_required'; end if;
  if p_command_id is null then raise exception 'transfer_fulfillment_command_required'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'transfer_fulfillment_reason_invalid'; end if;

  select * into v_existing from public.billing_transfer_proofs where fulfillment_command_id = p_command_id;
  if found then
    if v_existing.id <> p_proof_id then raise exception 'transfer_fulfillment_command_conflict'; end if;
    select * into v_payment from public.billing_payments where id = v_existing.fulfilled_payment_id;
    select * into v_invoice from public.billing_invoices where id = v_existing.invoice_id;
    select * into v_subscription from public.organization_subscriptions where id = v_invoice.subscription_id;
    return query select v_existing.id, v_payment.id, v_payment.payment_number, v_invoice.id,
      v_invoice.status, v_subscription.id, v_subscription.lifecycle_status,
      v_subscription.expires_at, v_subscription.grace_ends_at, v_existing.fulfilled_at;
    return;
  end if;

  select * into v_proof from public.billing_transfer_proofs where id = p_proof_id for update;
  if not found then raise exception 'transfer_proof_not_found'; end if;
  if v_proof.status <> 'accepted' then raise exception 'accepted_transfer_proof_required'; end if;
  if v_proof.fulfilled_payment_id is not null then raise exception 'transfer_proof_already_fulfilled'; end if;
  if v_proof.reviewed_by = v_actor then raise exception 'second_platform_admin_required' using errcode = '42501'; end if;

  select * into v_invoice from public.billing_invoices where id = v_proof.invoice_id for update;
  if not found then raise exception 'billing_invoice_not_found'; end if;
  if v_invoice.status <> 'pending' then raise exception 'billing_invoice_not_pending'; end if;
  if v_invoice.organization_id <> v_proof.organization_id then raise exception 'transfer_proof_organization_mismatch'; end if;
  if v_proof.claimed_amount <> v_invoice.total_amount then raise exception 'transfer_amount_must_equal_invoice_total'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_invoice.organization_id::text, 8404));

  select * into v_subscription
  from public.organization_subscriptions
  where id = v_invoice.subscription_id and organization_id = v_invoice.organization_id for update;
  if not found then raise exception 'billing_subscription_not_found'; end if;
  if v_subscription.lifecycle_status <> 'active' then raise exception 'active_subscription_required'; end if;
  if v_subscription.plan_version_id is distinct from v_invoice.plan_version_id then raise exception 'invoice_subscription_plan_version_mismatch'; end if;

  select * into v_version from public.subscription_plan_versions where id = v_invoice.plan_version_id;
  if not found then raise exception 'subscription_plan_version_not_found'; end if;
  v_grace_ends_at := v_invoice.billing_period_end + make_interval(days => v_version.grace_period_days);

  insert into public.billing_payments (
    payment_number, command_id, invoice_id, organization_id, provider, provider_reference,
    status, amount, currency, reason, metadata, recorded_by, occurred_at
  ) values (
    'PAY-' || to_char(v_now at time zone 'Asia/Bangkok', 'YYYYMM') || '-' || lpad(nextval('public.billing_payment_number_seq')::text, 6, '0'),
    p_command_id, v_invoice.id, v_invoice.organization_id, 'bank_transfer', v_proof.id::text,
    'paid', v_invoice.total_amount, v_invoice.currency, btrim(p_reason),
    jsonb_build_object('phase','1.1.3.8.4','transfer_proof_id',v_proof.id,
      'transfer_channel_id',v_proof.transfer_channel_id,'claimed_transfer_at',v_proof.claimed_transfer_at,
      'reviewed_by',v_proof.reviewed_by,'fulfilled_by',v_actor,'subscription_event_type','renew'),
    v_actor, v_proof.claimed_transfer_at
  ) returning * into v_payment;

  update public.billing_invoices
  set status='paid', paid_at=v_now, failed_at=null, canceled_at=null, updated_by=v_actor, updated_at=v_now
  where id=v_invoice.id;

  update public.organization_subscriptions
  set lifecycle_status='active', starts_at=v_invoice.billing_period_start,
    expires_at=v_invoice.billing_period_end, grace_ends_at=v_grace_ends_at, canceled_at=null,
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'last_paid_invoice_id',v_invoice.id,'last_payment_id',v_payment.id,'last_transfer_proof_id',v_proof.id),
    updated_at=v_now
  where id=v_subscription.id returning * into v_subscription;

  insert into public.subscription_events (
    organization_id, subscription_id, event_type, previous_status, new_status, reason, metadata, performed_by
  ) values (
    v_invoice.organization_id, v_subscription.id, 'renew', 'active', 'active', btrim(p_reason),
    jsonb_build_object('phase','1.1.3.8.4','command_id',p_command_id,'invoice_id',v_invoice.id,
      'payment_id',v_payment.id,'transfer_proof_id',v_proof.id,'plan_version_id',v_invoice.plan_version_id,
      'billing_period_start',v_invoice.billing_period_start,'billing_period_end',v_invoice.billing_period_end),
    v_actor
  );

  update public.billing_transfer_proofs
  set fulfillment_command_id=p_command_id, fulfilled_payment_id=v_payment.id,
    fulfilled_by=v_actor, fulfilled_at=v_now, fulfillment_reason=btrim(p_reason), updated_at=v_now
  where id=v_proof.id returning * into v_proof;

  return query select v_proof.id, v_payment.id, v_payment.payment_number, v_invoice.id,
    'paid'::text, v_subscription.id, v_subscription.lifecycle_status,
    v_subscription.expires_at, v_subscription.grace_ends_at, v_proof.fulfilled_at;
exception
  when unique_violation then
    select * into v_existing from public.billing_transfer_proofs where fulfillment_command_id=p_command_id;
    if found and v_existing.id=p_proof_id then
      select * into v_payment from public.billing_payments where id=v_existing.fulfilled_payment_id;
      select * into v_invoice from public.billing_invoices where id=v_existing.invoice_id;
      select * into v_subscription from public.organization_subscriptions where id=v_invoice.subscription_id;
      return query select v_existing.id, v_payment.id, v_payment.payment_number, v_invoice.id,
        v_invoice.status, v_subscription.id, v_subscription.lifecycle_status,
        v_subscription.expires_at, v_subscription.grace_ends_at, v_existing.fulfilled_at;
      return;
    end if;
    raise;
end;
$$;

revoke all on function public.platform_fulfill_billing_transfer_proof(uuid,text,uuid) from public, anon;
grant execute on function public.platform_fulfill_billing_transfer_proof(uuid,text,uuid) to authenticated;

comment on function public.platform_billing_transfer_fulfillment_queue() is
  'Returns accepted, unfulfilled transfer evidence to an AAL2 Platform Admin.';
comment on function public.platform_fulfill_billing_transfer_proof(uuid,text,uuid) is
  'Second-admin, idempotent and atomic bank-transfer fulfillment: Payment, Invoice and Subscription in one transaction.';
