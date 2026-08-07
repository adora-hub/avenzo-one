-- AVENZO ONE Phase 0.10.4: audit MFA factor recovery and session revocation.

alter table private.platform_security_audit_logs
  drop constraint if exists platform_security_audit_action_check;

alter table private.platform_security_audit_logs
  add constraint platform_security_audit_action_check
  check (action in (
    'mfa_enrollment_started',
    'mfa_enrollment_verified',
    'mfa_challenge_verified',
    'mfa_factor_unenrolled',
    'mfa_other_sessions_revoked'
  ));

create or replace function private.record_platform_security_event(
  p_action text,
  p_factor_type text default 'totp'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_platform_admin() then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  if p_action not in (
    'mfa_enrollment_started',
    'mfa_enrollment_verified',
    'mfa_challenge_verified',
    'mfa_factor_unenrolled',
    'mfa_other_sessions_revoked'
  ) then
    raise exception 'invalid_platform_security_action' using errcode = '22023';
  end if;

  if p_factor_type <> 'totp' then
    raise exception 'invalid_mfa_factor_type' using errcode = '22023';
  end if;

  insert into private.platform_security_audit_logs (actor_user_id, actor_email, action, factor_type)
  values ((select auth.uid()), (select auth.jwt() ->> 'email'), p_action, p_factor_type);
end;
$$;

revoke all on function private.record_platform_security_event(text,text)
  from public, anon, authenticated;
grant execute on function private.record_platform_security_event(text,text)
  to authenticated;

comment on function public.record_platform_security_event(text,text) is
  'Records allowlisted Platform Admin MFA enrollment, challenge, factor removal, and session revocation events after AAL2 authorization.';
