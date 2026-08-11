-- AVENZO ONE Phase 1.2.2.5.3: revoke all other owned app sessions.
-- The current app session is always excluded. Existing middleware enforces
-- each revoked app session on its next protected request.

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
  v_target private.app_sessions;
  v_revoked_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_current_session_id is null or length(v_current_session_id) > 255 then
    raise exception 'session_id_required' using errcode = '22023';
  end if;

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

  return v_revoked_count;
end;
$$;

revoke all on function public.app_revoke_my_other_sessions() from public, anon;
grant execute on function public.app_revoke_my_other_sessions() to authenticated;

comment on function public.app_revoke_my_other_sessions() is
  'Revokes every active non-current app session owned by the authenticated caller and appends one private security audit event per revoked session.';
