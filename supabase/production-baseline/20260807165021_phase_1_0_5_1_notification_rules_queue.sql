-- AVENZO ONE Phase 1.0.5.1: subscription notification rules and idempotent queue.
-- This phase prepares and previews notifications only. It does not send email.

create table public.subscription_notification_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  name_th text not null,
  timing_anchor text not null,
  offset_minutes integer not null,
  channel text not null default 'email',
  template_key text not null,
  is_enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_notification_rules_key_check
    check (rule_key = lower(rule_key) and rule_key ~ '^[a-z][a-z0-9_]*$'),
  constraint subscription_notification_rules_name_check check (length(btrim(name_th)) between 3 and 120),
  constraint subscription_notification_rules_anchor_check
    check (timing_anchor in ('trial_ends_at', 'expires_at', 'grace_ends_at')),
  constraint subscription_notification_rules_offset_check check (offset_minutes between -525600 and 525600),
  constraint subscription_notification_rules_channel_check check (channel = 'email'),
  constraint subscription_notification_rules_template_check
    check (template_key = lower(template_key) and template_key ~ '^[a-z][a-z0-9_]*$')
);

create table public.subscription_notification_queue (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.subscription_notification_rules(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_notification_queue_status_check
    check (status in ('pending', 'processing', 'sent', 'failed', 'canceled')),
  constraint subscription_notification_queue_attempt_check check (attempt_count >= 0),
  constraint subscription_notification_queue_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint subscription_notification_queue_dedupe_check check (length(dedupe_key) between 10 and 500)
);

create index subscription_notification_queue_dispatch_idx
  on public.subscription_notification_queue (status, scheduled_for, id);
create index subscription_notification_queue_organization_idx
  on public.subscription_notification_queue (organization_id, scheduled_for desc);
create index subscription_notification_queue_subscription_idx
  on public.subscription_notification_queue (subscription_id, scheduled_for desc);
create index subscription_notification_queue_recipient_idx
  on public.subscription_notification_queue (recipient_user_id, scheduled_for desc);

create table private.subscription_notification_rule_audit_logs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.subscription_notification_rules(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index subscription_notification_rule_audit_rule_created_idx
  on private.subscription_notification_rule_audit_logs (rule_id, created_at desc);

alter table public.subscription_notification_rules enable row level security;
alter table public.subscription_notification_queue enable row level security;
alter table private.subscription_notification_rule_audit_logs enable row level security;

revoke all on public.subscription_notification_rules, public.subscription_notification_queue from public, anon, authenticated;
grant select, update on public.subscription_notification_rules to authenticated;
grant select, insert, update on public.subscription_notification_queue to authenticated;
revoke all on private.subscription_notification_rule_audit_logs from public, anon, authenticated;

create policy "aal2 platform admins read notification rules"
on public.subscription_notification_rules for select to authenticated
using (private.is_platform_admin());

create policy "aal2 platform admins update notification rules"
on public.subscription_notification_rules for update to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

create policy "aal2 platform admins read notification queue"
on public.subscription_notification_queue for select to authenticated
using (private.is_platform_admin());

create policy "aal2 platform admins create notification queue"
on public.subscription_notification_queue for insert to authenticated
with check (private.is_platform_admin() and generated_by = (select auth.uid()));

create policy "aal2 platform admins update notification queue"
on public.subscription_notification_queue for update to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

create policy "deny direct notification rule audit access"
on private.subscription_notification_rule_audit_logs
for all to public
using (false)
with check (false);

create or replace function private.audit_subscription_notification_rule()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into private.subscription_notification_rule_audit_logs (
    rule_id, actor_user_id, previous_data, new_data
  ) values (
    new.id, (select auth.uid()), to_jsonb(old), to_jsonb(new)
  );
  return new;
end;
$$;

revoke all on function private.audit_subscription_notification_rule() from public, anon, authenticated;

create trigger audit_subscription_notification_rule
after update on public.subscription_notification_rules
for each row execute function private.audit_subscription_notification_rule();

create or replace function public.platform_set_subscription_notification_rule(
  p_rule_id uuid,
  p_is_enabled boolean
)
returns public.subscription_notification_rules
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_rule public.subscription_notification_rules;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;

  update public.subscription_notification_rules
  set is_enabled = p_is_enabled,
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = p_rule_id
  returning * into v_rule;

  if v_rule.id is null then
    raise exception 'notification_rule_not_found';
  end if;

  if not p_is_enabled then
    update public.subscription_notification_queue
    set status = 'canceled', last_error = 'rule_disabled', updated_at = now()
    where rule_id = p_rule_id and status = 'pending';
  else
    update public.subscription_notification_queue
    set status = 'pending', last_error = null, updated_at = now()
    where rule_id = p_rule_id and status = 'canceled' and last_error = 'rule_disabled';
  end if;

  return v_rule;
end;
$$;

create or replace function public.platform_generate_subscription_notification_queue(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_inserted integer;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;

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
            and (s.metadata ->> 'trial_ends_at') ~ '^\\d{4}-\\d{2}-\\d{2}T'
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
      scheduled_for, status, payload, dedupe_key, generated_by
    )
    select
      c.rule_id,
      c.organization_id,
      c.subscription_id,
      c.recipient_user_id,
      c.scheduled_for,
      'pending',
      jsonb_build_object(
        'phase', '1.0.5.1',
        'rule_key', c.rule_key,
        'template_key', c.template_key,
        'plan_code', c.plan_code,
        'generated_at', p_now
      ),
      concat(c.subscription_id, ':', c.rule_id, ':', c.recipient_user_id, ':', c.anchor_at),
      (select auth.uid())
    from candidates c
    where c.scheduled_for >= c.starts_at
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*)::integer into v_inserted from inserted;

  return coalesce(v_inserted, 0);
end;
$$;

revoke all on function public.platform_set_subscription_notification_rule(uuid, boolean) from public, anon;
grant execute on function public.platform_set_subscription_notification_rule(uuid, boolean) to authenticated;
revoke all on function public.platform_generate_subscription_notification_queue(timestamptz) from public, anon;
grant execute on function public.platform_generate_subscription_notification_queue(timestamptz) to authenticated;

insert into public.subscription_notification_rules (
  rule_key, name_th, timing_anchor, offset_minutes, template_key
) values
  ('trial_ending_1d', 'ทดลองใช้จะสิ้นสุดใน 1 วัน', 'trial_ends_at', -1440, 'subscription_trial_ending'),
  ('expiry_7d', 'Subscription จะหมดอายุใน 7 วัน', 'expires_at', -10080, 'subscription_expiry_reminder'),
  ('expiry_3d', 'Subscription จะหมดอายุใน 3 วัน', 'expires_at', -4320, 'subscription_expiry_reminder'),
  ('expiry_1d', 'Subscription จะหมดอายุใน 1 วัน', 'expires_at', -1440, 'subscription_expiry_reminder'),
  ('grace_started', 'Subscription เข้าสู่ช่วงผ่อนผัน', 'expires_at', 0, 'subscription_grace_started'),
  ('grace_ending_1d', 'ช่วงผ่อนผันจะสิ้นสุดใน 1 วัน', 'grace_ends_at', -1440, 'subscription_grace_ending'),
  ('subscription_expired', 'Subscription หมดอายุแล้ว', 'grace_ends_at', 0, 'subscription_expired')
on conflict (rule_key) do nothing;

comment on table public.subscription_notification_rules is
  'Phase 1.0.5.1 configurable rules for subscription lifecycle notifications.';
comment on table public.subscription_notification_queue is
  'Idempotent preview and delivery queue. Phase 1.0.5.1 does not send email.';
comment on function public.platform_generate_subscription_notification_queue(timestamptz) is
  'Creates one queue item per enabled rule, active subscription, and active owner. Duplicate generation is safe.';

