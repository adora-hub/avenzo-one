-- Phase 1.1.3.8.5.2 hotfix
-- subscription_plans is keyed by code and subscription_plan_versions references it with plan_code.

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
  join public.subscription_plans plan on plan.code = v.plan_code
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

comment on function public.platform_billing_transfer_fulfillment_queue_v2() is
  'Returns accepted transfer proofs with the current server-side approval requirement. Plan lookup uses the canonical plan code relation.';

