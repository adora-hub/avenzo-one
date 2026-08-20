-- AVENZO ONE Phase 1.2.2.5.5: session security email alerts.
-- Email delivery remains in the Next.js server. PostgreSQL only owns the
-- audit event claim, idempotency ledger and safe completion state.

create table if not exists private.app_session_security_email_config (
  singleton boolean primary key default true,
  enabled_at timestamptz not null default now(),
  constraint app_session_security_email_config_singleton_check check (singleton)
);

insert into private.app_session_security_email_config (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists private.app_session_security_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  security_event_id uuid not null unique
    references private.app_session_security_events(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  status text not null default 'processing',
  provider_message_id text,
  safe_error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_session_security_email_type_check
    check (notification_type in ('new_device_login', 'other_sessions_revoked')),
  constraint app_session_security_email_status_check
    check (status in ('processing', 'sent', 'failed')),
  constraint app_session_security_email_provider_id_check
    check (provider_message_id is null or length(provider_message_id) between 1 and 255),
  constraint app_session_security_email_error_code_check
    check (safe_error_code is null or length(safe_error_code) between 1 and 120),
  constraint app_session_security_email_sent_state_check
    check ((status = 'sent' and sent_at is not null) or status <> 'sent')
);

create index if not exists app_session_security_email_user_created_idx
  on private.app_session_security_email_deliveries (user_id, created_at desc, id desc);

alter table private.app_session_security_email_config enable row level security;
alter table private.app_session_security_email_deliveries enable row level security;

revoke all on table private.app_session_security_email_config from public, anon, authenticated;
revoke all on table private.app_session_security_email_deliveries from public, anon, authenticated;

create or replace function public.app_revoke_my_other_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_session_id text := nullif(btrim(coalesce(auth.jwt() ->> 'session_id', '')), '');
  v_reason constant text := 'Signed out all other devices from AVENZO session device management';
  v_current private.app_sessions;
  v_target private.app_sessions;
  v_revoked_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_current_session_id is null or length(v_current_session_id) > 255 then
    raise exception 'session_id_required' using errcode = '22023';
  end if;

  select s.* into v_current
  from private.app_sessions s
  where s.user_id = v_user_id
    and s.session_id = v_current_session_id;

  for v_target in
    select s.*
    from private.app_sessions s
    where s.user_id = v_user_id
      and s.session_id <> v_current_session_id
      and s.revoked_at is null
      and s.idle_expires_at > now()
      and s.absolute_expires_at > now()
    order by s.started_at asc, s.id asc
    for update
  loop
    update private.app_sessions s
    set revoked_at = now(),
        revoke_reason = v_reason,
        updated_at = now()
    where s.id = v_target.id;

    insert into private.app_session_security_events (
      session_id, user_id, action, policy_tier, policy_version, metadata
    ) values (
      v_target.session_id,
      v_target.user_id,
      'session_other_devices_revoked',
      v_target.policy_tier,
      v_target.policy_version,
      jsonb_build_object(
        'target_app_session_id', v_target.id,
        'device_label', v_target.device_label,
        'browser_name', v_target.browser_name,
        'operating_system', v_target.operating_system,
        'reason', v_reason,
        'revoked_by_user_id', v_user_id,
        'current_session_excluded', true
      )
    );

    v_revoked_count := v_revoked_count + 1;
  end loop;

  if v_revoked_count > 0 and v_current.id is not null then
    insert into private.app_session_security_events (
      session_id, user_id, action, policy_tier, policy_version, metadata
    ) values (
      v_current.session_id,
      v_current.user_id,
      'session_other_devices_revoked_summary',
      v_current.policy_tier,
      v_current.policy_version,
      jsonb_build_object(
        'revoked_count', v_revoked_count,
        'current_session_excluded', true
      )
    );
  end if;

  return v_revoked_count;
end;
$$;

create or replace function public.app_claim_my_session_security_email(
  p_notification_type text
)
returns table (
  delivery_id uuid,
  security_event_id uuid,
  notification_type text,
  event_created_at timestamptz,
  device_label text,
  browser_name text,
  operating_system text,
  revoked_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := nullif(btrim(coalesce(auth.jwt() ->> 'session_id', '')), '');
  v_event_id uuid;
  v_event_created_at timestamptz;
  v_event_metadata jsonb;
  v_device_label text;
  v_browser_name text;
  v_operating_system text;
  v_delivery_id uuid;
  v_expected_action text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_session_id is null or length(v_session_id) > 255 then
    raise exception 'session_id_required' using errcode = '22023';
  end if;

  v_expected_action := case p_notification_type
    when 'new_device_login' then 'session_registered'
    when 'other_sessions_revoked' then 'session_other_devices_revoked_summary'
    else null
  end;
  if v_expected_action is null then
    raise exception 'unsupported_notification_type' using errcode = '22023';
  end if;

  select
    e.id,
    e.created_at,
    e.metadata,
    s.device_label,
    s.browser_name,
    s.operating_system
  into
    v_event_id,
    v_event_created_at,
    v_event_metadata,
    v_device_label,
    v_browser_name,
    v_operating_system
  from private.app_session_security_events e
  join private.app_sessions s
    on s.session_id = e.session_id
   and s.user_id = e.user_id
  cross join private.app_session_security_email_config c
  where c.singleton = true
    and e.user_id = v_user_id
    and e.session_id = v_session_id
    and e.action = v_expected_action
    and e.created_at >= c.enabled_at
  order by e.created_at desc, e.id desc
  limit 1;

  if v_event_id is null then return; end if;

  insert into private.app_session_security_email_deliveries (
    security_event_id, user_id, notification_type
  ) values (
    v_event_id, v_user_id, p_notification_type
  )
  on conflict (security_event_id) do nothing
  returning id into v_delivery_id;

  if v_delivery_id is null then return; end if;

  return query
  select
    v_delivery_id,
    v_event_id,
    p_notification_type,
    v_event_created_at,
    v_device_label,
    v_browser_name,
    v_operating_system,
    case
      when coalesce(v_event_metadata ->> 'revoked_count', '') ~ '^[0-9]+$'
        then (v_event_metadata ->> 'revoked_count')::integer
      else 0
    end;
end;
$$;

create or replace function public.app_complete_my_session_security_email(
  p_delivery_id uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_safe_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  update private.app_session_security_email_deliveries d
  set status = case when p_success then 'sent' else 'failed' end,
      provider_message_id = case
        when p_success then left(nullif(btrim(coalesce(p_provider_message_id, '')), ''), 255)
        else null
      end,
      safe_error_code = case
        when p_success then null
        else left(coalesce(nullif(btrim(coalesce(p_safe_error_code, '')), ''), 'delivery_failed'), 120)
      end,
      sent_at = case when p_success then now() else null end,
      updated_at = now()
  where d.id = p_delivery_id
    and d.user_id = v_user_id
    and d.status = 'processing'
  returning d.id into v_updated_id;

  return v_updated_id is not null;
end;
$$;

revoke all on function public.app_revoke_my_other_sessions() from public, anon;
revoke all on function public.app_claim_my_session_security_email(text) from public, anon;
revoke all on function public.app_complete_my_session_security_email(uuid, boolean, text, text) from public, anon;

grant execute on function public.app_revoke_my_other_sessions() to authenticated;
grant execute on function public.app_claim_my_session_security_email(text) to authenticated;
grant execute on function public.app_complete_my_session_security_email(uuid, boolean, text, text) to authenticated;

comment on table private.app_session_security_email_deliveries is
  'Private idempotency and safe delivery outcome ledger for session security emails; never exposed to browser roles.';
comment on function public.app_claim_my_session_security_email(text) is
  'Claims one current-user current-session security event after feature enablement and returns a safe email projection exactly once.';
comment on function public.app_complete_my_session_security_email(uuid, boolean, text, text) is
  'Completes only the authenticated callers claimed session security email using safe provider outcome fields.';
