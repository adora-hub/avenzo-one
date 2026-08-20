-- AVENZO ONE Phase 1.2.2.5.2: revoke one owned app session.
-- Supabase does not expose a client API for revoking an arbitrary selected
-- session. AVENZO therefore revokes the selected app session and the existing
-- middleware denies that session on its next protected request.

create or replace function public.app_revoke_my_session(
  p_app_session_id uuid
)
returns table (
  app_session_id uuid,
  revoked_at timestamptz,
  already_revoked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_session_id text := nullif(btrim(coalesce(auth.jwt() ->> 'session_id', '')), '');
  v_reason constant text := 'Signed out from AVENZO session device management';
  v_target private.app_sessions;
  v_was_revoked boolean;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_current_session_id is null or length(v_current_session_id) > 255 then
    raise exception 'session_id_required' using errcode = '22023';
  end if;
  if p_app_session_id is null then
    raise exception 'app_session_id_required' using errcode = '22023';
  end if;
  select s.* into v_target
  from private.app_sessions s
  where s.id = p_app_session_id
    and s.user_id = v_user_id
  for update;

  if not found then
    raise exception 'session_not_found_or_not_owned' using errcode = '42501';
  end if;
  if v_target.session_id = v_current_session_id then
    raise exception 'cannot_revoke_current_session' using errcode = '22023';
  end if;

  v_was_revoked := v_target.revoked_at is not null;

  if not v_was_revoked then
    update private.app_sessions s
    set revoked_at = now(),
        revoke_reason = v_reason,
        updated_at = now()
    where s.id = v_target.id
    returning s.* into v_target;

    insert into private.app_session_security_events (
      session_id, user_id, action, policy_tier, policy_version, metadata
    ) values (
      v_target.session_id,
      v_target.user_id,
      'session_device_revoked',
      v_target.policy_tier,
      v_target.policy_version,
      jsonb_build_object(
        'target_app_session_id', v_target.id,
        'device_label', v_target.device_label,
        'browser_name', v_target.browser_name,
        'operating_system', v_target.operating_system,
        'reason', v_reason,
        'revoked_by_user_id', v_user_id
      )
    );
  end if;

  return query
  select v_target.id, v_target.revoked_at, v_was_revoked;
end;
$$;

revoke all on function public.app_revoke_my_session(uuid) from public, anon;
grant execute on function public.app_revoke_my_session(uuid) to authenticated;

comment on function public.app_revoke_my_session(uuid) is
  'Revokes one non-current app session owned by the authenticated caller and appends a private security audit event.';
