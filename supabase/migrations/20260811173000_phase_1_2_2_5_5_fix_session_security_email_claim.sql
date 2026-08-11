-- AVENZO ONE Phase 1.2.2.5.5: fix session security email claim.
-- The function returns a column named security_event_id, so an unqualified
-- ON CONFLICT (security_event_id) is ambiguous inside PL/pgSQL. Target the
-- generated unique constraint explicitly instead.

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

  insert into private.app_session_security_email_deliveries as delivery (
    security_event_id, user_id, notification_type
  ) values (
    v_event_id, v_user_id, p_notification_type
  )
  on conflict on constraint app_session_security_email_deliveries_security_event_id_key
    do nothing
  returning delivery.id into v_delivery_id;

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

revoke all on function public.app_claim_my_session_security_email(text) from public, anon;
grant execute on function public.app_claim_my_session_security_email(text) to authenticated;

comment on function public.app_claim_my_session_security_email(text) is
  'Claims one current-user current-session security event after feature enablement and returns a safe email projection exactly once.';
