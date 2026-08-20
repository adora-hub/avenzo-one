-- Correct the trial timestamp matcher from Phase 1.0.5.1.
-- Use an explicit digit class so the expression is independent of backslash escaping.

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

revoke all on function public.platform_generate_subscription_notification_queue(timestamptz) from public, anon;
grant execute on function public.platform_generate_subscription_notification_queue(timestamptz) to authenticated;

