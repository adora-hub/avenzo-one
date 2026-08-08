-- AVENZO ONE Phase 1.0.6: production monitoring and in-app alerting.

create table public.subscription_notification_worker_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  delivery_mode text not null,
  status text not null default 'running',
  generated_count integer not null default 0,
  due_count integer not null default 0,
  claimed_count integer not null default 0,
  sent_count integer not null default 0,
  suppressed_count integer not null default 0,
  retrying_count integer not null default 0,
  failed_count integer not null default 0,
  error_count integer not null default 0,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null default now(),
  constraint subscription_notification_worker_runs_source_check
    check (source in ('cron', 'manual')),
  constraint subscription_notification_worker_runs_mode_check
    check (delivery_mode in ('preview', 'live')),
  constraint subscription_notification_worker_runs_status_check
    check (status in ('running', 'succeeded', 'failed')),
  constraint subscription_notification_worker_runs_counts_check
    check (
      generated_count >= 0 and due_count >= 0 and claimed_count >= 0
      and sent_count >= 0 and suppressed_count >= 0 and retrying_count >= 0
      and failed_count >= 0 and error_count >= 0
    ),
  constraint subscription_notification_worker_runs_duration_check
    check (duration_ms is null or duration_ms >= 0),
  constraint subscription_notification_worker_runs_finished_check
    check (status = 'running' or finished_at is not null)
);

create index subscription_notification_worker_runs_source_started_idx
  on public.subscription_notification_worker_runs (source, started_at desc);
create index subscription_notification_worker_runs_status_started_idx
  on public.subscription_notification_worker_runs (status, started_at desc);

alter table public.subscription_notification_worker_runs enable row level security;
revoke all on public.subscription_notification_worker_runs from public, anon, authenticated;

create policy "aal2 platform admins read notification worker runs"
on public.subscription_notification_worker_runs for select to authenticated
using (private.is_platform_admin());

create or replace function public.worker_start_subscription_notification_run(
  p_source text,
  p_delivery_mode text,
  p_started_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_source not in ('cron', 'manual') then
    raise exception 'invalid_worker_source';
  end if;
  if p_delivery_mode not in ('preview', 'live') then
    raise exception 'invalid_delivery_mode';
  end if;

  insert into public.subscription_notification_worker_runs (
    source, delivery_mode, status, started_at
  ) values (
    p_source, p_delivery_mode, 'running', p_started_at
  ) returning id into v_run_id;

  return v_run_id;
end;
$$;

create or replace function public.worker_finish_subscription_notification_run(
  p_run_id uuid,
  p_status text,
  p_generated_count integer default 0,
  p_due_count integer default 0,
  p_claimed_count integer default 0,
  p_sent_count integer default 0,
  p_suppressed_count integer default 0,
  p_retrying_count integer default 0,
  p_failed_count integer default 0,
  p_error_count integer default 0,
  p_error_code text default null,
  p_finished_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_status not in ('succeeded', 'failed') then
    raise exception 'invalid_worker_status';
  end if;

  update public.subscription_notification_worker_runs
  set status = p_status,
      generated_count = greatest(coalesce(p_generated_count, 0), 0),
      due_count = greatest(coalesce(p_due_count, 0), 0),
      claimed_count = greatest(coalesce(p_claimed_count, 0), 0),
      sent_count = greatest(coalesce(p_sent_count, 0), 0),
      suppressed_count = greatest(coalesce(p_suppressed_count, 0), 0),
      retrying_count = greatest(coalesce(p_retrying_count, 0), 0),
      failed_count = greatest(coalesce(p_failed_count, 0), 0),
      error_count = greatest(coalesce(p_error_count, 0), 0),
      error_code = nullif(left(coalesce(p_error_code, ''), 160), ''),
      finished_at = p_finished_at,
      duration_ms = greatest(0, floor(extract(epoch from (p_finished_at - started_at)) * 1000)::integer)
  where id = p_run_id and status = 'running';

  return found;
end;
$$;

create or replace function public.platform_subscription_notification_health(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_cron_active boolean := false;
  v_cron_schedule text;
  v_last_run jsonb;
  v_last_run_status text;
  v_last_run_started_at timestamptz;
  v_latest_http jsonb;
  v_pending integer := 0;
  v_due integer := 0;
  v_processing integer := 0;
  v_stuck integer := 0;
  v_failed integer := 0;
  v_exhausted integer := 0;
  v_sent integer := 0;
  v_attempts_24h integer := 0;
  v_sent_24h integer := 0;
  v_retrying_24h integer := 0;
  v_failed_24h integer := 0;
  v_delivered_24h integer := 0;
  v_bounced_24h integer := 0;
  v_complained_24h integer := 0;
  v_suppressed_24h integer := 0;
  v_waiting_webhook integer := 0;
  v_webhook_failed_24h integer := 0;
  v_runs_24h integer := 0;
  v_runs_failed_24h integer := 0;
  v_alerts jsonb := '[]'::jsonb;
  v_overall text := 'healthy';
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;

  select coalesce(j.active, false), j.schedule
    into v_cron_active, v_cron_schedule
  from cron.job j
  where j.jobname = 'avenzo-subscription-notifications-hourly';

  select r.status, r.started_at,
         jsonb_build_object(
           'id', r.id,
           'status', r.status,
           'delivery_mode', r.delivery_mode,
           'started_at', r.started_at,
           'finished_at', r.finished_at,
           'duration_ms', r.duration_ms,
           'generated', r.generated_count,
           'due', r.due_count,
           'claimed', r.claimed_count,
           'sent', r.sent_count,
           'suppressed', r.suppressed_count,
           'retrying', r.retrying_count,
           'failed', r.failed_count,
           'errors', r.error_count,
           'error_code', r.error_code
         )
    into v_last_run_status, v_last_run_started_at, v_last_run
  from public.subscription_notification_worker_runs r
  where r.source = 'cron'
  order by r.started_at desc
  limit 1;

  select jsonb_build_object(
           'status_code', h.status_code,
           'timed_out', h.timed_out,
           'has_error', h.error_msg is not null,
           'created_at', h.created
         )
    into v_latest_http
  from net._http_response h
  order by h.created desc
  limit 1;

  select
    count(*) filter (where q.status = 'pending'),
    count(*) filter (where q.status = 'pending' and q.next_attempt_at <= p_now),
    count(*) filter (where q.status = 'processing'),
    count(*) filter (where q.status = 'processing' and q.locked_at < p_now - interval '15 minutes'),
    count(*) filter (where q.status = 'failed'),
    count(*) filter (where q.status = 'failed' and q.attempt_count >= q.max_attempts),
    count(*) filter (where q.status = 'sent')
  into v_pending, v_due, v_processing, v_stuck, v_failed, v_exhausted, v_sent
  from public.subscription_notification_queue q;

  select
    count(*),
    count(*) filter (where d.outcome = 'sent'),
    count(*) filter (where d.outcome = 'retrying'),
    count(*) filter (where d.outcome = 'failed'),
    count(*) filter (where d.provider_status = 'delivered'),
    count(*) filter (where d.provider_status = 'bounced'),
    count(*) filter (where d.provider_status = 'complained'),
    count(*) filter (where d.provider_status = 'suppressed' or d.outcome = 'suppressed'),
    count(*) filter (
      where d.outcome = 'sent' and d.provider_status is null
        and d.finished_at < p_now - interval '15 minutes'
    )
  into v_attempts_24h, v_sent_24h, v_retrying_24h, v_failed_24h,
       v_delivered_24h, v_bounced_24h, v_complained_24h,
       v_suppressed_24h, v_waiting_webhook
  from public.subscription_notification_deliveries d
  where d.created_at >= p_now - interval '24 hours';

  select count(*) filter (where e.processing_status = 'failed')
    into v_webhook_failed_24h
  from public.subscription_notification_webhook_events e
  where e.received_at >= p_now - interval '24 hours';

  select count(*), count(*) filter (where r.status = 'failed')
    into v_runs_24h, v_runs_failed_24h
  from public.subscription_notification_worker_runs r
  where r.started_at >= p_now - interval '24 hours';

  if not v_cron_active then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'cron_inactive', 'severity', 'critical',
      'title', 'Cron ถูกปิดใช้งาน',
      'detail', 'ระบบจะไม่ตรวจและส่งการแจ้งเตือนตามรอบจนกว่าจะเปิด Cron'
    ));
  end if;

  if v_last_run is null then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'cron_worker_not_observed', 'severity', 'warning',
      'title', 'ยังไม่มีหลักฐานการทำงานของ Worker รุ่นใหม่',
      'detail', 'ให้รอรอบ Cron ถัดไปหรือกดประมวลผลด้วยตนเองหลัง Deploy'
    ));
  elsif v_last_run_status = 'failed' then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'cron_worker_failed', 'severity', 'critical',
      'title', 'Worker รอบล่าสุดทำงานไม่สำเร็จ',
      'detail', 'ตรวจ Error Code และ Runtime Log ก่อนส่งซ้ำ'
    ));
  elsif v_last_run_started_at < p_now - interval '125 minutes' then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'cron_worker_late', 'severity', 'critical',
      'title', 'Cron ขาดการทำงานเกิน 2 ชั่วโมง',
      'detail', 'ตรวจ Supabase Cron, pg_net และ Production API'
    ));
  end if;

  if v_stuck > 0 then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'queue_stuck', 'severity', 'critical',
      'title', 'พบคิวค้างระหว่างส่ง',
      'detail', format('มี %s รายการค้างเกิน 15 นาที', v_stuck)
    ));
  end if;

  if v_exhausted > 0 then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'retry_exhausted', 'severity', 'critical',
      'title', 'มีรายการลองส่งครบจำนวนแล้ว',
      'detail', format('มี %s รายการที่ต้องตรวจและสั่งลองใหม่โดย Platform Admin', v_exhausted)
    ));
  end if;

  if v_webhook_failed_24h > 0 then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'webhook_processing_failed', 'severity', 'critical',
      'title', 'Webhook ประมวลผลไม่สำเร็จ',
      'detail', format('พบ %s Event ใน 24 ชั่วโมง', v_webhook_failed_24h)
    ));
  end if;

  if v_due > 0 then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'queue_due', 'severity', 'warning',
      'title', 'มีคิวถึงกำหนดรอประมวลผล',
      'detail', format('มี %s รายการ ระบบจะประมวลผลในรอบ Cron ถัดไป', v_due)
    ));
  end if;

  if v_failed_24h > 0 or v_retrying_24h > 0 then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'delivery_errors', 'severity', 'warning',
      'title', 'มีการส่งที่ต้องติดตาม',
      'detail', format('ล้มเหลว %s ครั้ง และรอลองใหม่ %s ครั้งใน 24 ชั่วโมง', v_failed_24h, v_retrying_24h)
    ));
  end if;

  if v_bounced_24h > 0 or v_complained_24h > 0 or v_suppressed_24h > 0 then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'recipient_reputation', 'severity', 'warning',
      'title', 'พบสถานะผู้รับที่ต้องตรวจสอบ',
      'detail', format('ตีกลับ %s · แจ้งสแปม %s · ระงับ %s', v_bounced_24h, v_complained_24h, v_suppressed_24h)
    ));
  end if;

  if v_waiting_webhook > 0 then
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'webhook_status_missing', 'severity', 'warning',
      'title', 'ยังไม่ได้รับสถานะตอบกลับจาก Resend',
      'detail', format('มี %s อีเมลที่ส่งเกิน 15 นาทีแล้วแต่ยังไม่มี Webhook', v_waiting_webhook)
    ));
  end if;

  if exists (select 1 from jsonb_array_elements(v_alerts) a where a ->> 'severity' = 'critical') then
    v_overall := 'critical';
  elsif jsonb_array_length(v_alerts) > 0 then
    v_overall := 'warning';
  end if;

  return jsonb_build_object(
    'checked_at', p_now,
    'overall_status', v_overall,
    'alerts', v_alerts,
    'cron', jsonb_build_object(
      'active', v_cron_active,
      'schedule', v_cron_schedule,
      'last_run', v_last_run,
      'latest_http', v_latest_http,
      'runs_24h', v_runs_24h,
      'failed_runs_24h', v_runs_failed_24h
    ),
    'queue', jsonb_build_object(
      'pending', v_pending,
      'due', v_due,
      'processing', v_processing,
      'stuck', v_stuck,
      'failed', v_failed,
      'exhausted', v_exhausted,
      'sent', v_sent
    ),
    'email_24h', jsonb_build_object(
      'attempts', v_attempts_24h,
      'accepted_by_resend', v_sent_24h,
      'retrying', v_retrying_24h,
      'failed', v_failed_24h,
      'delivered', v_delivered_24h,
      'bounced', v_bounced_24h,
      'complained', v_complained_24h,
      'suppressed', v_suppressed_24h,
      'waiting_webhook', v_waiting_webhook,
      'webhook_failed', v_webhook_failed_24h
    )
  );
end;
$$;

revoke all on function public.worker_start_subscription_notification_run(text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.worker_finish_subscription_notification_run(
  uuid, text, integer, integer, integer, integer, integer, integer, integer, integer, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.platform_subscription_notification_health(timestamptz)
  from public, anon;

grant execute on function public.worker_start_subscription_notification_run(text, text, timestamptz)
  to service_role;
grant execute on function public.worker_finish_subscription_notification_run(
  uuid, text, integer, integer, integer, integer, integer, integer, integer, integer, text, timestamptz
) to service_role;
grant execute on function public.platform_subscription_notification_health(timestamptz)
  to authenticated;

comment on table public.subscription_notification_worker_runs is
  'Production-safe worker execution metrics without recipient email addresses or secrets.';
comment on function public.platform_subscription_notification_health(timestamptz) is
  'AAL2 Platform Admin health summary and derived alerts for Cron, queue, deliveries, and Resend webhook.';
