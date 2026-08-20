-- AVENZO ONE Phase 1.0.5.3: verified Resend webhook events and recipient suppression.

alter table public.subscription_notification_deliveries
  add column provider_status text,
  add column provider_status_at timestamptz,
  add column provider_event_id text,
  add constraint subscription_notification_deliveries_provider_status_check
    check (provider_status is null or provider_status in (
      'sent', 'delivery_delayed', 'delivered', 'failed', 'bounced', 'complained', 'suppressed'
    ));

alter table public.subscription_notification_deliveries
  drop constraint subscription_notification_deliveries_outcome_check,
  add constraint subscription_notification_deliveries_outcome_check
    check (outcome in ('sent', 'retrying', 'failed', 'suppressed'));

create index subscription_notification_deliveries_provider_message_idx
  on public.subscription_notification_deliveries (provider_message_id)
  where provider_message_id is not null;

create table public.subscription_notification_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  provider_message_id text not null,
  occurred_at timestamptz not null,
  processing_status text not null default 'processed',
  payload_summary jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint subscription_notification_webhook_event_id_check check (length(btrim(event_id)) between 3 and 255),
  constraint subscription_notification_webhook_type_check check (event_type in (
    'sent', 'delivery_delayed', 'delivered', 'failed', 'bounced', 'complained', 'suppressed'
  )),
  constraint subscription_notification_webhook_processing_check check (processing_status in ('processed', 'ignored', 'failed')),
  constraint subscription_notification_webhook_summary_check check (jsonb_typeof(payload_summary) = 'object')
);

create index subscription_notification_webhook_events_message_idx
  on public.subscription_notification_webhook_events (provider_message_id, occurred_at desc);
create index subscription_notification_webhook_events_received_idx
  on public.subscription_notification_webhook_events (received_at desc);

create table public.subscription_notification_suppressions (
  recipient_user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null,
  source_event_id text not null,
  provider_message_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_notification_suppression_reason_check
    check (reason in ('bounced', 'complained', 'suppressed'))
);

create index subscription_notification_suppressions_active_idx
  on public.subscription_notification_suppressions (active, updated_at desc);

alter table public.subscription_notification_webhook_events enable row level security;
alter table public.subscription_notification_suppressions enable row level security;

revoke all on public.subscription_notification_webhook_events,
  public.subscription_notification_suppressions from public, anon, authenticated;
grant select on public.subscription_notification_webhook_events,
  public.subscription_notification_suppressions to authenticated;
grant select, insert, update on public.subscription_notification_webhook_events,
  public.subscription_notification_suppressions to service_role;

create policy "aal2 platform admins read notification webhook events"
on public.subscription_notification_webhook_events for select to authenticated
using (private.is_platform_admin());

create policy "aal2 platform admins read notification suppressions"
on public.subscription_notification_suppressions for select to authenticated
using (private.is_platform_admin());

create or replace function public.worker_record_resend_webhook(
  p_event_id text,
  p_event_type text,
  p_provider_message_id text,
  p_occurred_at timestamptz,
  p_payload_summary jsonb default '{}'::jsonb,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event_type text := replace(lower(btrim(p_event_type)), 'email.', '');
  v_delivery public.subscription_notification_deliveries;
  v_recipient_user_id uuid;
  v_existing_rank integer;
  v_incoming_rank integer;
  v_inserted integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_event_id, ''))) not between 3 and 255
    or length(btrim(coalesce(p_provider_message_id, ''))) not between 3 and 255 then
    raise exception 'invalid_webhook_identifiers';
  end if;
  if v_event_type not in ('sent', 'delivery_delayed', 'delivered', 'failed', 'bounced', 'complained', 'suppressed') then
    raise exception 'unsupported_webhook_event';
  end if;
  if jsonb_typeof(coalesce(p_payload_summary, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_payload_summary';
  end if;

  insert into public.subscription_notification_webhook_events (
    event_id, event_type, provider_message_id, occurred_at, processing_status,
    payload_summary, received_at
  ) values (
    left(btrim(p_event_id), 255), v_event_type, left(btrim(p_provider_message_id), 255),
    p_occurred_at, 'processed', coalesce(p_payload_summary, '{}'::jsonb), p_now
  ) on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object('duplicate', true, 'matched', false, 'suppressed', false);
  end if;

  select d.* into v_delivery
  from public.subscription_notification_deliveries d
  where d.provider_message_id = left(btrim(p_provider_message_id), 255)
  order by d.created_at desc
  limit 1
  for update;

  if v_delivery.id is null then
    update public.subscription_notification_webhook_events
    set processing_status = 'ignored', processed_at = p_now
    where event_id = left(btrim(p_event_id), 255);
    return jsonb_build_object('duplicate', false, 'matched', false, 'suppressed', false);
  end if;

  v_existing_rank := case v_delivery.provider_status
    when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
    when 'failed' then 40 when 'bounced' then 50 when 'complained' then 50
    when 'suppressed' then 50 else 0 end;
  v_incoming_rank := case v_event_type
    when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
    when 'failed' then 40 when 'bounced' then 50 when 'complained' then 50
    when 'suppressed' then 50 else 0 end;

  if v_incoming_rank > v_existing_rank
    or (v_incoming_rank = v_existing_rank
      and p_occurred_at >= coalesce(v_delivery.provider_status_at, '-infinity'::timestamptz)) then
    update public.subscription_notification_deliveries
    set provider_status = v_event_type,
        provider_status_at = p_occurred_at,
        provider_event_id = left(btrim(p_event_id), 255)
    where id = v_delivery.id;
  end if;

  if v_event_type in ('bounced', 'complained', 'suppressed') then
    select q.recipient_user_id into v_recipient_user_id
    from public.subscription_notification_queue q
    where q.id = v_delivery.queue_id;

    insert into public.subscription_notification_suppressions (
      recipient_user_id, reason, source_event_id, provider_message_id,
      active, created_at, updated_at
    ) values (
      v_recipient_user_id, v_event_type, left(btrim(p_event_id), 255),
      left(btrim(p_provider_message_id), 255), true, p_now, p_now
    ) on conflict (recipient_user_id) do update
      set reason = excluded.reason,
          source_event_id = excluded.source_event_id,
          provider_message_id = excluded.provider_message_id,
          active = true,
          updated_at = excluded.updated_at;

    update public.subscription_notification_queue
    set status = 'canceled',
        last_error = 'recipient_suppressed:' || v_event_type,
        locked_at = null,
        lock_token = null,
        locked_by = null,
        updated_at = p_now
    where recipient_user_id = v_recipient_user_id
      and status in ('pending', 'failed');
  end if;

  update public.subscription_notification_webhook_events
  set processing_status = 'processed', processed_at = p_now
  where event_id = left(btrim(p_event_id), 255);

  return jsonb_build_object(
    'duplicate', false,
    'matched', true,
    'suppressed', v_event_type in ('bounced', 'complained', 'suppressed')
  );
end;
$$;

create or replace function public.worker_cancel_suppressed_notification(
  p_queue_id uuid,
  p_lock_token uuid,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_queue public.subscription_notification_queue;
  v_suppression_reason text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select q.* into v_queue
  from public.subscription_notification_queue q
  where q.id = p_queue_id and q.status = 'processing' and q.lock_token = p_lock_token
  for update;

  if v_queue.id is null then
    raise exception 'notification_lock_not_found';
  end if;

  select s.reason into v_suppression_reason
  from public.subscription_notification_suppressions s
  where s.recipient_user_id = v_queue.recipient_user_id and s.active;

  if v_suppression_reason is null then
    return false;
  end if;

  update public.subscription_notification_queue
  set status = 'canceled',
      last_error = 'recipient_suppressed:' || v_suppression_reason,
      locked_at = null,
      lock_token = null,
      locked_by = null,
      updated_at = p_now
  where id = v_queue.id;

  insert into public.subscription_notification_deliveries (
    queue_id, attempt_number, outcome, provider, error_code, error_message,
    response_summary, started_at, finished_at
  ) values (
    v_queue.id, v_queue.attempt_count, 'suppressed', 'resend',
    'recipient_suppressed', 'Delivery canceled before resolving recipient email.',
    jsonb_build_object('reason', v_suppression_reason),
    coalesce(v_queue.last_attempt_at, p_now), p_now
  );

  return true;
end;
$$;

revoke all on function public.worker_record_resend_webhook(text, text, text, timestamptz, jsonb, timestamptz)
from public, anon, authenticated;
revoke all on function public.worker_cancel_suppressed_notification(uuid, uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.worker_record_resend_webhook(text, text, text, timestamptz, jsonb, timestamptz)
to service_role;
grant execute on function public.worker_cancel_suppressed_notification(uuid, uuid, timestamptz)
to service_role;

comment on table public.subscription_notification_webhook_events is
  'Deduplicated, privacy-minimized Resend delivery webhook events. Recipient email is intentionally excluded.';
comment on table public.subscription_notification_suppressions is
  'Recipients blocked from further subscription emails after bounce, complaint, or provider suppression.';
comment on function public.worker_record_resend_webhook(text, text, text, timestamptz, jsonb, timestamptz) is
  'Service-role-only idempotent Resend event processor using verified svix-id values.';

