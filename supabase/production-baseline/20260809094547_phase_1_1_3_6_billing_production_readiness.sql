-- AVENZO ONE Phase 1.1.3.6: immutable Billing Production readiness reviews.
-- This phase records evidence and manual attestations only. It never enables
-- Stripe Live Mode or stores Stripe credentials in Postgres.

create table public.billing_production_readiness_reviews (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null unique,
  review_version text not null default 'phase_1_1_3_6_v1',
  manual_status text not null,
  manual_checklist jsonb not null,
  evidence_note text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  created_at timestamptz not null default now(),
  constraint billing_production_readiness_version_check
    check (review_version = 'phase_1_1_3_6_v1'),
  constraint billing_production_readiness_status_check
    check (manual_status in ('in_progress', 'manual_complete')),
  constraint billing_production_readiness_checklist_check
    check (jsonb_typeof(manual_checklist) = 'object'),
  constraint billing_production_readiness_evidence_check
    check (length(btrim(evidence_note)) between 10 and 2000),
  constraint billing_production_readiness_actor_email_check
    check (position('@' in actor_email) > 1)
);

create index billing_production_readiness_created_idx
  on public.billing_production_readiness_reviews (created_at desc, id desc);

alter table public.billing_production_readiness_reviews enable row level security;
revoke all on public.billing_production_readiness_reviews from public, anon, authenticated;
grant select on public.billing_production_readiness_reviews to authenticated;

create policy "aal2 platform admins read billing production readiness reviews"
on public.billing_production_readiness_reviews for select to authenticated
using (private.is_platform_admin());

create or replace function public.platform_record_billing_production_readiness_review(
  p_command_id uuid,
  p_manual_checklist jsonb,
  p_evidence_note text
)
returns public.billing_production_readiness_reviews
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_required_keys constant text[] := array[
    'stripe_account_kyc',
    'payout_bank_verified',
    'live_credentials_secured',
    'live_webhook_prepared',
    'refund_dispute_policy',
    'alert_owner_assigned',
    'accounting_legal_review',
    'rollback_drill',
    'live_safe_test_plan'
  ];
  v_key text;
  v_manual_complete boolean := true;
  v_result public.billing_production_readiness_reviews;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if jsonb_typeof(p_manual_checklist) is distinct from 'object' then
    raise exception 'readiness_checklist_object_required';
  end if;
  if length(btrim(coalesce(p_evidence_note, ''))) < 10 then
    raise exception 'readiness_evidence_too_short';
  end if;
  if length(p_evidence_note) > 2000 then
    raise exception 'readiness_evidence_too_long';
  end if;
  if exists (
    select 1 from jsonb_each(p_manual_checklist) item
    where item.key <> all(v_required_keys)
       or jsonb_typeof(item.value) <> 'boolean'
  ) then
    raise exception 'invalid_readiness_checklist';
  end if;

  foreach v_key in array v_required_keys loop
    if coalesce((p_manual_checklist ->> v_key)::boolean, false) is not true then
      v_manual_complete := false;
    end if;
  end loop;

  insert into public.billing_production_readiness_reviews (
    command_id,
    manual_status,
    manual_checklist,
    evidence_note,
    actor_user_id,
    actor_email
  ) values (
    p_command_id,
    case when v_manual_complete then 'manual_complete' else 'in_progress' end,
    p_manual_checklist,
    btrim(p_evidence_note),
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', '')
  )
  on conflict (command_id) do nothing
  returning * into v_result;

  if v_result.id is null then
    select * into v_result
    from public.billing_production_readiness_reviews
    where command_id = p_command_id;
  end if;

  return v_result;
end;
$$;

revoke all on function public.platform_record_billing_production_readiness_review(uuid, jsonb, text)
  from public, anon;
grant execute on function public.platform_record_billing_production_readiness_review(uuid, jsonb, text)
  to authenticated;

comment on table public.billing_production_readiness_reviews is
  'Immutable AAL2 Platform Admin attestations for Billing Production readiness. Contains no provider credentials.';
comment on function public.platform_record_billing_production_readiness_review(uuid, jsonb, text) is
  'Records an idempotent manual readiness review without enabling Stripe Live Mode.';
