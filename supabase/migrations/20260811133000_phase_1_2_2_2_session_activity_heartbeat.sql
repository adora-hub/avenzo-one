-- AVENZO ONE Phase 1.2.2.2: Session Status & Activity Heartbeat.
-- Heartbeats are server-throttled and do not enforce logout in this phase.

create or replace function public.app_touch_current_session()
returns table (
  registered boolean,
  heartbeat_recorded boolean,
  policy_tier text,
  policy_version bigint,
  warning_seconds integer,
  server_time timestamptz,
  started_at timestamptz,
  last_seen_at timestamptz,
  idle_expires_at timestamptz,
  absolute_expires_at timestamptz,
  idle_expired boolean,
  absolute_expired boolean,
  revoked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := nullif(btrim(coalesce(auth.jwt() ->> 'session_id', '')), '');
  v_now timestamptz := clock_timestamp();
  v_session private.app_sessions;
  v_policy private.app_session_policies;
  v_idle_window interval;
  v_heartbeat_recorded boolean := false;
  v_idle_expired boolean;
  v_absolute_expired boolean;
  v_revoked boolean;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_session_id is null or length(v_session_id) > 255 then
    raise exception 'session_id_required' using errcode = '22023';
  end if;

  select s.* into v_session
  from private.app_sessions s
  where s.session_id = v_session_id
  for update;

  if v_session.id is null then
    select p.* into v_policy
    from private.app_session_policies p
    where p.policy_tier = private.current_app_session_policy_tier()
      and p.is_active = true;

    if not found then
      raise exception 'active_session_policy_not_found';
    end if;

    return query
    select false, false, v_policy.policy_tier, v_policy.version,
      v_policy.warning_seconds, v_now,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz,
      false, false, false;
    return;
  end if;

  if v_session.user_id <> v_user_id then
    raise exception 'session_owner_mismatch' using errcode = '42501';
  end if;

  select p.* into v_policy
  from private.app_session_policies p
  where p.policy_tier = v_session.policy_tier;

  if not found then
    raise exception 'session_policy_not_found';
  end if;

  v_idle_expired := v_now >= v_session.idle_expires_at;
  v_absolute_expired := v_now >= v_session.absolute_expires_at;
  v_revoked := v_session.revoked_at is not null;

  -- Preserve the session's registered idle window instead of silently moving
  -- an existing session to a newly edited policy version.
  v_idle_window := v_session.idle_expires_at - v_session.last_seen_at;

  if not v_idle_expired
    and not v_absolute_expired
    and not v_revoked
    and v_session.last_seen_at <= v_now - interval '60 seconds'
  then
    update private.app_sessions s
    set last_seen_at = v_now,
        idle_expires_at = least(v_now + v_idle_window, v_session.absolute_expires_at),
        updated_at = v_now
    where s.id = v_session.id
    returning s.* into v_session;

    v_heartbeat_recorded := true;
  end if;

  return query
  select true, v_heartbeat_recorded, v_session.policy_tier,
    v_session.policy_version, v_policy.warning_seconds, v_now,
    v_session.started_at, v_session.last_seen_at, v_session.idle_expires_at,
    v_session.absolute_expires_at, v_idle_expired, v_absolute_expired, v_revoked;
end;
$$;

revoke all on function public.app_touch_current_session() from public, anon;
grant execute on function public.app_touch_current_session() to authenticated;

comment on function public.app_touch_current_session() is
  'Returns current application-session status and records activity at most once per minute. It never revives expired or revoked sessions and does not enforce logout.';
