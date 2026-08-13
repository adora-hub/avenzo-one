-- AVENZO ONE Phase 1.0.5.2: scheduler-ready delivery worker, retries, and delivery history.

alter table public.subscription_notification_queue
  add column next_attempt_at timestamptz not null default now(),
  add column locked_at timestamptz,
  add column lock_token uuid,
  add column locked_by text,
  add column max_attempts smallint not null default 5,
  add column provider_message_id text,
  add column sent_at timestamptz,
  add column failed_at timestamptz,
  add column last_attempt_at timestamptz,
  add constraint subscription_notification_queue_max_attempts_check
    check (max_attempts between 1 and 10),
  add constraint subscription_notification_queue_lock_check
    check (status <> 'processing' or (locked_at is not null and lock_token is not null)),
  add constraint subscription_notification_queue_sent_check
    check (status <> 'sent' or sent_at is not null);

update public.subscription_notification_queue
set next_attempt_at = greatest(scheduled_for, created_at)
where status = 'pending';

create index subscription_notification_queue_retry_dispatch_idx
  on public.subscription_notification_queue (next_attempt_at, scheduled_for, id)
  where status in ('pending', 'failed', 'processing');

create table public.subscription_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.subscription_notification_queue(id) on delete restrict,
  attempt_number integer not null,
  outcome text not null,
  provider text not null default 'resend',
  provider_message_id text,
  error_code text,
  error_message text,
  response_summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint subscription_notification_deliveries_attempt_check check (attempt_number > 0),
  constraint subscription_notification_deliveries_outcome_check check (outcome in ('sent', 'retrying', 'failed')),
  constraint subscription_notification_deliveries_response_check check (jsonb_typeof(response_summary) = 'object'),
  unique (queue_id, attempt_number)
);

create index subscription_notification_deliveries_queue_created_idx
  on public.subscription_notification_deliveries (queue_id, created_at desc);
create index subscription_notification_deliveries_outcome_created_idx
  on public.subscription_notification_deliveries (outcome, created_at desc);

alter table public.subscription_notification_deliveries enable row level security;
revoke all on public.subscription_notification_deliveries from public, anon, authenticated;
grant select on public.subscription_notification_deliveries to authenticated;

create policy "aal2 platform admins read notification deliveries"
on public.subscription_notification_deliveries for select to authenticated
using (private.is_platform_admin());

create or replace function private.generate_subscription_notification_queue_core(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_inserted integer;
begin
  with owner_recipients as (
    select distinct om.organization_id, om.user_id
    from public.organization_members om
    join public.member_roles mr on mr.membership_id = om.id
    join public.organization_roles r on r.id = mr.role_id
    where om.membership_status = 'active'
      and r.code = 'owner'
  ), anchors as (
    select
      s.id as subscription_id,
      s.organization_id,
      s.plan_code,
      s.starts_at,
      r.id as rule_id,
      r.rule_key,
      r.template_key,
      r.offset_minutes,
      recipients.user_id as recipient_user_id,
      case r.timing_anchor
        when 'trial_ends_at' then case
          when jsonb_typeof(s.metadata -> 'trial_ends_at') = 'string'
            and (s.metadata ->> 'trial_ends_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
          then (s.metadata ->> 'trial_ends_at')::timestamptz
          else null
        end
        when 'expires_at' then s.expires_at
        when 'grace_ends_at' then s.grace_ends_at
      end as anchor_at
    from public.organization_subscriptions s
    join public.subscription_notification_rules r on r.is_enabled
    join owner_recipients recipients on recipients.organization_id = s.organization_id
    where s.lifecycle_status = 'active'
  ), candidates as (
    select *, anchor_at + (offset_minutes * interval '1 minute') as scheduled_for
    from anchors
    where anchor_at is not null
  ), inserted as (
    insert into public.subscription_notification_queue (
      rule_id, organization_id, subscription_id, recipient_user_id,
      scheduled_for, next_attempt_at, status, payload, dedupe_key
    )
    select
      c.rule_id, c.organization_id, c.subscription_id, c.recipient_user_id,
      c.scheduled_for, c.scheduled_for, 'pending',
      jsonb_build_object(
        'phase', '1.0.5.2', 'rule_key', c.rule_key,
        'template_key', c.template_key, 'plan_code', c.plan_code,
        'generated_at', p_now
      ),
      concat(c.subscription_id, ':', c.rule_id, ':', c.recipient_user_id, ':', c.anchor_at)
    from candidates c
    where c.scheduled_for >= c.starts_at
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*)::integer into v_inserted from inserted;

  return coalesce(v_inserted, 0);
end;
$$;

create or replace function public.worker_claim_subscription_notifications(
  p_worker_id text,
  p_limit integer default 10,
  p_now timestamptz default now()
)
returns table (
  queue_id uuid,
  recipient_user_id uuid,
  organization_id uuid,
  organization_name text,
  organization_timezone text,
  rule_name_th text,
  template_key text,
  scheduled_for timestamptz,
  attempt_number integer,
  lock_token uuid,
  payload jsonb,
  dedupe_key text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if length(btrim(p_worker_id)) not between 3 and 120 then
    raise exception 'invalid_worker_id';
  end if;

  update public.subscription_notification_queue q
  set status = case when q.attempt_count >= q.max_attempts then 'failed' else 'pending' end,
      next_attempt_at = p_now,
      last_error = 'processing_lock_expired',
      failed_at = case when q.attempt_count >= q.max_attempts then p_now else null end,
      locked_at = null,
      lock_token = null,
      locked_by = null,
      updated_at = p_now
  where q.status = 'processing'
    and q.locked_at < p_now - interval '10 minutes';

  return query
  with candidates as (
    select q.id
    from public.subscription_notification_queue q
    join public.subscription_notification_rules r on r.id = q.rule_id and r.is_enabled
    where q.status in ('pending', 'failed')
      and q.scheduled_for <= p_now
      and q.next_attempt_at <= p_now
      and q.attempt_count < q.max_attempts
    order by q.scheduled_for, q.id
    for update of q skip locked
    limit least(greatest(p_limit, 1), 50)
  ), claimed as (
    update public.subscription_notification_queue q
    set status = 'processing',
        attempt_count = q.attempt_count + 1,
        last_attempt_at = p_now,
        locked_at = p_now,
        lock_token = gen_random_uuid(),
        locked_by = btrim(p_worker_id),
        failed_at = null,
        updated_at = p_now
    from candidates c
    where q.id = c.id
    returning q.*
  )
  select
    c.id,
    c.recipient_user_id,
    c.organization_id,
    o.name,
    o.timezone,
    r.name_th,
    r.template_key,
    c.scheduled_for,
    c.attempt_count,
    c.lock_token,
    c.payload,
    c.dedupe_key
  from claimed c
  join public.organizations o on o.id = c.organization_id
  join public.subscription_notification_rules r on r.id = c.rule_id
  order by c.scheduled_for, c.id;
end;
$$;

create or replace function public.worker_complete_subscription_notification(
  p_queue_id uuid,
  p_lock_token uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_response_summary jsonb default '{}'::jsonb,
  p_now timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_queue public.subscription_notification_queue;
  v_outcome text;
  v_next_attempt timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_response_summary, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_response_summary';
  end if;

  select * into v_queue
  from public.subscription_notification_queue
  where id = p_queue_id and status = 'processing' and lock_token = p_lock_token
  for update;

  if v_queue.id is null then
    raise exception 'notification_lock_not_found';
  end if;

  if p_success then
    v_outcome := 'sent';
    update public.subscription_notification_queue
    set status = 'sent',
        provider_message_id = left(nullif(btrim(p_provider_message_id), ''), 255),
        sent_at = p_now,
        failed_at = null,
        last_error = null,
        locked_at = null,
        lock_token = null,
        locked_by = null,
        updated_at = p_now
    where id = v_queue.id;
  else
    v_outcome := case when v_queue.attempt_count >= v_queue.max_attempts then 'failed' else 'retrying' end;
    v_next_attempt := p_now + make_interval(
      mins => least(360, 5 * power(2, greatest(0, v_queue.attempt_count - 1))::integer)
    );
    update public.subscription_notification_queue
    set status = case when v_outcome = 'failed' then 'failed' else 'pending' end,
        next_attempt_at = v_next_attempt,
        failed_at = case when v_outcome = 'failed' then p_now else null end,
        last_error = left(coalesce(nullif(btrim(p_error_message), ''), 'delivery_failed'), 1000),
        locked_at = null,
        lock_token = null,
        locked_by = null,
        updated_at = p_now
    where id = v_queue.id;
  end if;

  insert into public.subscription_notification_deliveries (
    queue_id, attempt_number, outcome, provider, provider_message_id,
    error_code, error_message, response_summary, started_at, finished_at
  ) values (
    v_queue.id,
    v_queue.attempt_count,
    v_outcome,
    'resend',
    left(nullif(btrim(p_provider_message_id), ''), 255),
    left(nullif(btrim(p_error_code), ''), 120),
    left(nullif(btrim(p_error_message), ''), 1000),
    coalesce(p_response_summary, '{}'::jsonb),
    coalesce(v_queue.last_attempt_at, p_now),
    p_now
  );

  return v_outcome;
end;
$$;

revoke all on function private.generate_subscription_notification_queue_core(timestamptz)
from public, anon, authenticated;

create or replace function public.worker_generate_subscription_notification_queue(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  return private.generate_subscription_notification_queue_core(p_now);
end;
$$;

create or replace function public.worker_count_due_subscription_notifications(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select count(*)::integer into v_count
  from public.subscription_notification_queue q
  join public.subscription_notification_rules r on r.id = q.rule_id and r.is_enabled
  where q.status in ('pending', 'failed')
    and q.scheduled_for <= p_now
    and q.next_attempt_at <= p_now
    and q.attempt_count < q.max_attempts;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.platform_retry_subscription_notification(
  p_queue_id uuid
)
returns public.subscription_notification_queue
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_queue public.subscription_notification_queue;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;

  update public.subscription_notification_queue
  set status = 'pending',
      attempt_count = 0,
      next_attempt_at = now(),
      failed_at = null,
      last_error = null,
      locked_at = null,
      lock_token = null,
      locked_by = null,
      updated_at = now()
  where id = p_queue_id and status = 'failed'
  returning * into v_queue;

  if v_queue.id is null then
    raise exception 'failed_notification_not_found';
  end if;
  return v_queue;
end;
$$;

revoke all on function public.worker_generate_subscription_notification_queue(timestamptz) from public, anon, authenticated;
revoke all on function public.worker_count_due_subscription_notifications(timestamptz) from public, anon, authenticated;
revoke all on function public.worker_claim_subscription_notifications(text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.worker_complete_subscription_notification(uuid, uuid, boolean, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.worker_generate_subscription_notification_queue(timestamptz) to service_role;
grant execute on function public.worker_count_due_subscription_notifications(timestamptz) to service_role;
grant execute on function public.worker_claim_subscription_notifications(text, integer, timestamptz) to service_role;
grant execute on function public.worker_complete_subscription_notification(uuid, uuid, boolean, text, text, text, jsonb, timestamptz) to service_role;

revoke all on function public.platform_retry_subscription_notification(uuid) from public, anon;
grant execute on function public.platform_retry_subscription_notification(uuid) to authenticated;

comment on table public.subscription_notification_deliveries is
  'Append-only delivery attempt history for subscription notification queue items.';
comment on function public.worker_claim_subscription_notifications(text, integer, timestamptz) is
  'Service-role-only atomic claim using row locks and SKIP LOCKED.';
comment on function public.worker_complete_subscription_notification(uuid, uuid, boolean, text, text, text, jsonb, timestamptz) is
  'Service-role-only completion with exponential retry scheduling and append-only delivery history.';

