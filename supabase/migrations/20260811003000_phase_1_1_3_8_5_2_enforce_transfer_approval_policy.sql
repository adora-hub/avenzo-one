-- AVENZO ONE Phase 1.1.3.8.5.2: enforce configurable transfer approval policy.
-- Low-risk transfers at or below the configured limit may be fulfilled by the reviewer.
-- High-value or risk-flagged transfers require a different second Platform Admin.

alter table public.billing_transfer_proofs
  add column risk_flagged boolean not null default false,
  add column risk_reason text,
  add column approval_policy_version bigint,
  add column approval_required_count smallint;

alter table public.billing_transfer_proofs
  add constraint billing_transfer_proof_risk_reason_check
    check (
      (risk_flagged and length(btrim(coalesce(risk_reason, ''))) between 3 and 500)
      or (not risk_flagged and risk_reason is null)
    ),
  add constraint billing_transfer_proof_approval_required_count_check
    check (approval_required_count is null or approval_required_count in (1, 2));

create or replace function public.platform_review_billing_transfer_proof_v2(
  p_proof_id uuid,
  p_decision text,
  p_reason text,
  p_command_id uuid,
  p_risk_flagged boolean default false,
  p_risk_reason text default null
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
  v_risk_reason text := nullif(btrim(coalesce(p_risk_reason, '')), '');
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
  if p_risk_flagged is null then raise exception 'transfer_proof_risk_flag_required'; end if;
  if p_decision = 'accept' and p_risk_flagged
    and length(coalesce(v_risk_reason, '')) not between 3 and 500 then
    raise exception 'transfer_proof_risk_reason_invalid';
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
      risk_flagged = case when p_decision = 'accept' then p_risk_flagged else false end,
      risk_reason = case when p_decision = 'accept' and p_risk_flagged then v_risk_reason else null end,
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

revoke all on function public.platform_review_billing_transfer_proof_v2(uuid, text, text, uuid, boolean, text) from public, anon;
grant execute on function public.platform_review_billing_transfer_proof_v2(uuid, text, text, uuid, boolean, text) to authenticated;
revoke execute on function public.platform_review_billing_transfer_proof(uuid, text, text, uuid) from authenticated;

create or replace function public.platform_billing_transfer_fulfillment_queue_v2()
returns table (
  proof_id uuid,
  invoice_id uuid,
  invoice_number text,
  invoice_status text,
  invoice_total numeric,
  currency text,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  organization_id uuid,
  organization_name text,
  subscription_id uuid,
  subscription_status text,
  plan_code text,
  plan_version_id uuid,
  plan_version_label text,
  grace_period_days integer,
  channel_display_name text,
  channel_provider_name text,
  channel_account_name text,
  channel_account_identifier text,
  claimed_amount numeric,
  claimed_transfer_at timestamptz,
  original_file_name text,
  reviewed_by uuid,
  reviewer_email text,
  reviewed_at timestamptz,
  review_reason text,
  risk_flagged boolean,
  risk_reason text,
  approval_required_count smallint,
  approval_policy_version bigint,
  single_admin_limit numeric
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
    p.id, i.id, i.invoice_number, i.status, i.total_amount, i.currency,
    i.billing_period_start, i.billing_period_end,
    o.id, o.name, s.id, s.lifecycle_status,
    plan.code, v.id, v.name, v.grace_period_days,
    c.display_name, c.provider_name, c.account_name, c.account_identifier,
    p.claimed_amount, p.claimed_transfer_at, p.original_file_name,
    p.reviewed_by, reviewer.email::text, p.reviewed_at, p.review_reason,
    p.risk_flagged, p.risk_reason,
    (case
      when i.total_amount > policy.single_admin_limit
        or (policy.require_two_person_on_risk and p.risk_flagged)
      then 2 else 1
    end)::smallint,
    policy.version,
    policy.single_admin_limit
  from public.billing_transfer_proofs p
  join public.billing_invoices i on i.id = p.invoice_id
  join public.organizations o on o.id = p.organization_id
  join public.organization_subscriptions s on s.id = i.subscription_id
  join public.subscription_plan_versions v on v.id = i.plan_version_id
  join public.subscription_plans plan on plan.id = v.plan_id
  join public.billing_transfer_channels c on c.id = p.transfer_channel_id
  cross join public.billing_transfer_approval_policies policy
  left join auth.users reviewer on reviewer.id = p.reviewed_by
  where policy.policy_key = 'default'
    and p.status = 'accepted'
    and p.fulfilled_payment_id is null
  order by p.reviewed_at nulls last, p.id
  limit 100;
end;
$$;

revoke all on function public.platform_billing_transfer_fulfillment_queue_v2() from public, anon;
grant execute on function public.platform_billing_transfer_fulfillment_queue_v2() to authenticated;

create or replace function public.platform_fulfill_billing_transfer_proof(
  p_proof_id uuid,
  p_reason text,
  p_command_id uuid
)
returns table (
  proof_id uuid,
  payment_id uuid,
  payment_number text,
  invoice_id uuid,
  invoice_status text,
  subscription_id uuid,
  subscription_status text,
  subscription_expires_at timestamptz,
  subscription_grace_ends_at timestamptz,
  fulfilled_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_proof public.billing_transfer_proofs;
  v_existing public.billing_transfer_proofs;
  v_invoice public.billing_invoices;
  v_subscription public.organization_subscriptions;
  v_version public.subscription_plan_versions;
  v_payment public.billing_payments;
  v_policy public.billing_transfer_approval_policies;
  v_required_count smallint;
  v_now timestamptz := now();
  v_grace_ends_at timestamptz;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_proof_id is null then raise exception 'transfer_proof_required'; end if;
  if p_command_id is null then raise exception 'transfer_fulfillment_command_required'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'transfer_fulfillment_reason_invalid';
  end if;

  select * into v_existing
  from public.billing_transfer_proofs
  where fulfillment_command_id = p_command_id;
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

  select * into v_proof
  from public.billing_transfer_proofs
  where id = p_proof_id
  for update;
  if not found then raise exception 'transfer_proof_not_found'; end if;
  if v_proof.status <> 'accepted' then raise exception 'accepted_transfer_proof_required'; end if;
  if v_proof.fulfilled_payment_id is not null then raise exception 'transfer_proof_already_fulfilled'; end if;

  select * into v_invoice
  from public.billing_invoices
  where id = v_proof.invoice_id
  for update;
  if not found then raise exception 'billing_invoice_not_found'; end if;
  if v_invoice.status <> 'pending' then raise exception 'billing_invoice_not_pending'; end if;
  if v_invoice.organization_id <> v_proof.organization_id then raise exception 'transfer_proof_organization_mismatch'; end if;
  if v_proof.claimed_amount <> v_invoice.total_amount then raise exception 'transfer_amount_must_equal_invoice_total'; end if;

  select * into v_policy
  from public.billing_transfer_approval_policies
  where policy_key = 'default'
  for share;
  if not found then raise exception 'transfer_approval_policy_not_found'; end if;

  v_required_count := case
    when v_invoice.total_amount > v_policy.single_admin_limit
      or (v_policy.require_two_person_on_risk and v_proof.risk_flagged)
    then 2 else 1
  end;
  if v_required_count = 2 and v_proof.reviewed_by = v_actor then
    raise exception 'second_platform_admin_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_invoice.organization_id::text, 8404));

  select * into v_subscription
  from public.organization_subscriptions
  where id = v_invoice.subscription_id
    and organization_id = v_invoice.organization_id
  for update;
  if not found then raise exception 'billing_subscription_not_found'; end if;
  if v_subscription.lifecycle_status <> 'active' then raise exception 'active_subscription_required'; end if;
  if v_subscription.plan_version_id is distinct from v_invoice.plan_version_id then
    raise exception 'invoice_subscription_plan_version_mismatch';
  end if;

  select * into v_version
  from public.subscription_plan_versions
  where id = v_invoice.plan_version_id;
  if not found then raise exception 'subscription_plan_version_not_found'; end if;
  v_grace_ends_at := v_invoice.billing_period_end + make_interval(days => v_version.grace_period_days);

  insert into public.billing_payments (
    payment_number, command_id, invoice_id, organization_id, provider, provider_reference,
    status, amount, currency, reason, metadata, recorded_by, occurred_at
  ) values (
    'PAY-' || to_char(v_now at time zone 'Asia/Bangkok', 'YYYYMM') || '-' || lpad(nextval('public.billing_payment_number_seq')::text, 6, '0'),
    p_command_id, v_invoice.id, v_invoice.organization_id, 'bank_transfer', v_proof.id::text,
    'paid', v_invoice.total_amount, v_invoice.currency, btrim(p_reason),
    jsonb_build_object(
      'phase', '1.1.3.8.5.2',
      'transfer_proof_id', v_proof.id,
      'transfer_channel_id', v_proof.transfer_channel_id,
      'claimed_transfer_at', v_proof.claimed_transfer_at,
      'reviewed_by', v_proof.reviewed_by,
      'fulfilled_by', v_actor,
      'risk_flagged', v_proof.risk_flagged,
      'risk_reason', v_proof.risk_reason,
      'approval_policy_version', v_policy.version,
      'approval_required_count', v_required_count,
      'single_admin_limit', v_policy.single_admin_limit,
      'subscription_event_type', 'renew'
    ),
    v_actor, v_proof.claimed_transfer_at
  ) returning * into v_payment;

  update public.billing_invoices
  set status = 'paid', paid_at = v_now, failed_at = null, canceled_at = null,
      updated_by = v_actor, updated_at = v_now
  where id = v_invoice.id;

  update public.organization_subscriptions
  set lifecycle_status = 'active',
      starts_at = v_invoice.billing_period_start,
      expires_at = v_invoice.billing_period_end,
      grace_ends_at = v_grace_ends_at,
      canceled_at = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_paid_invoice_id', v_invoice.id,
        'last_payment_id', v_payment.id,
        'last_transfer_proof_id', v_proof.id
      ),
      updated_at = v_now
  where id = v_subscription.id
  returning * into v_subscription;

  insert into public.subscription_events (
    organization_id, subscription_id, event_type, previous_status, new_status,
    reason, metadata, performed_by
  ) values (
    v_invoice.organization_id, v_subscription.id, 'renew', 'active', 'active',
    btrim(p_reason),
    jsonb_build_object(
      'phase', '1.1.3.8.5.2',
      'command_id', p_command_id,
      'invoice_id', v_invoice.id,
      'payment_id', v_payment.id,
      'transfer_proof_id', v_proof.id,
      'plan_version_id', v_invoice.plan_version_id,
      'approval_policy_version', v_policy.version,
      'approval_required_count', v_required_count,
      'billing_period_start', v_invoice.billing_period_start,
      'billing_period_end', v_invoice.billing_period_end
    ),
    v_actor
  );

  update public.billing_transfer_proofs
  set fulfillment_command_id = p_command_id,
      fulfilled_payment_id = v_payment.id,
      fulfilled_by = v_actor,
      fulfilled_at = v_now,
      fulfillment_reason = btrim(p_reason),
      approval_policy_version = v_policy.version,
      approval_required_count = v_required_count,
      updated_at = v_now
  where id = v_proof.id
  returning * into v_proof;

  return query select v_proof.id, v_payment.id, v_payment.payment_number, v_invoice.id,
    'paid'::text, v_subscription.id, v_subscription.lifecycle_status,
    v_subscription.expires_at, v_subscription.grace_ends_at, v_proof.fulfilled_at;
exception
  when unique_violation then
    select * into v_existing
    from public.billing_transfer_proofs
    where fulfillment_command_id = p_command_id;
    if found and v_existing.id = p_proof_id then
      select * into v_payment from public.billing_payments where id = v_existing.fulfilled_payment_id;
      select * into v_invoice from public.billing_invoices where id = v_existing.invoice_id;
      select * into v_subscription from public.organization_subscriptions where id = v_invoice.subscription_id;
      return query select v_existing.id, v_payment.id, v_payment.payment_number, v_invoice.id,
        v_invoice.status, v_subscription.id, v_subscription.lifecycle_status,
        v_subscription.expires_at, v_subscription.grace_ends_at, v_existing.fulfilled_at;
      return;
    end if;
    raise;
end;
$$;

revoke all on function public.platform_fulfill_billing_transfer_proof(uuid, text, uuid) from public, anon;
grant execute on function public.platform_fulfill_billing_transfer_proof(uuid, text, uuid) to authenticated;

comment on function public.platform_review_billing_transfer_proof_v2(uuid, text, text, uuid, boolean, text) is
  'AAL2 Platform Admin transfer-proof review with an explicit auditable risk flag.';
comment on function public.platform_billing_transfer_fulfillment_queue_v2() is
  'Returns accepted transfer proofs with the current server-side approval requirement.';
comment on function public.platform_fulfill_billing_transfer_proof(uuid, text, uuid) is
  'Policy-enforced, idempotent and atomic bank-transfer fulfillment. One admin is allowed only within the low-risk configured limit.';
