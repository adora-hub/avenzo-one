-- Phase 1.1.3.7.2: privacy-minimized Stripe Live webhook inbox.
-- Verified Live events are quarantined for audit only. They cannot update an
-- Invoice, Payment Attempt, Subscription, or the Live safety control.

create table public.billing_live_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  environment text not null default 'production',
  provider_event_id text not null unique,
  event_type text not null,
  payload_sha256 text not null,
  livemode boolean not null,
  processing_status text not null default 'blocked_by_emergency_stop',
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint billing_live_webhook_provider_check check (provider = 'stripe'),
  constraint billing_live_webhook_environment_check check (environment = 'production'),
  constraint billing_live_webhook_event_id_check check (length(btrim(provider_event_id)) between 3 and 255),
  constraint billing_live_webhook_event_type_check check (length(btrim(event_type)) between 3 and 255),
  constraint billing_live_webhook_hash_check check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint billing_live_webhook_livemode_check check (livemode is true),
  constraint billing_live_webhook_status_check check (processing_status = 'blocked_by_emergency_stop')
);

create index billing_live_webhook_inbox_received_idx
  on public.billing_live_webhook_inbox (received_at desc, id desc);

alter table public.billing_live_webhook_inbox enable row level security;

revoke all on public.billing_live_webhook_inbox from public, anon, authenticated;
grant select on public.billing_live_webhook_inbox to authenticated;
grant select, insert on public.billing_live_webhook_inbox to service_role;

create policy "aal2 platform admins read live webhook quarantine"
on public.billing_live_webhook_inbox for select to authenticated
using (private.is_platform_admin());

comment on table public.billing_live_webhook_inbox is
  'Verified Stripe Live webhook metadata quarantined by Phase 1.1.3.7.2. Raw payload and customer data are intentionally not stored.';
