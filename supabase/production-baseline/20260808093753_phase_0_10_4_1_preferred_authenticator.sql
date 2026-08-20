-- AVENZO ONE Phase 0.10.4.1: preferred Authenticator selection.
-- This stores only a factor identifier used for UI ordering. It never stores a TOTP secret or OTP.

create table public.platform_mfa_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_factor_id uuid not null,
  updated_at timestamptz not null default now(),
  constraint platform_mfa_preferred_factor_required check (preferred_factor_id <> '00000000-0000-0000-0000-000000000000'::uuid)
);

alter table public.platform_mfa_preferences enable row level security;
revoke all on public.platform_mfa_preferences from public, anon, authenticated;
grant select on public.platform_mfa_preferences to authenticated;

create policy "users can read their own MFA preference"
on public.platform_mfa_preferences for select to authenticated
using ((select auth.uid()) = user_id);

alter table private.platform_security_audit_logs
  drop constraint if exists platform_security_audit_action_check;

alter table private.platform_security_audit_logs
  add constraint platform_security_audit_action_check
  check (action in (
    'mfa_enrollment_started',
    'mfa_enrollment_verified',
    'mfa_challenge_verified',
    'mfa_factor_unenrolled',
    'mfa_other_sessions_revoked',
    'mfa_preferred_factor_changed'
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
    'mfa_other_sessions_revoked',
    'mfa_preferred_factor_changed'
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

revoke all on function private.record_platform_security_event(text,text) from public, anon, authenticated;
grant execute on function private.record_platform_security_event(text,text) to authenticated;

create or replace function public.set_platform_mfa_preferred_factor(p_factor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_factor_id is null or p_factor_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'mfa_factor_id_required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from auth.mfa_factors
    where id = p_factor_id
      and user_id = (select auth.uid())
      and factor_type = 'totp'
      and status = 'verified'
  ) then
    raise exception 'verified_mfa_factor_not_found' using errcode = '22023';
  end if;

  insert into public.platform_mfa_preferences (user_id, preferred_factor_id, updated_at)
  values ((select auth.uid()), p_factor_id, now())
  on conflict (user_id) do update
    set preferred_factor_id = excluded.preferred_factor_id,
        updated_at = excluded.updated_at;

  perform private.record_platform_security_event('mfa_preferred_factor_changed', 'totp');
end;
$$;

revoke all on function public.set_platform_mfa_preferred_factor(uuid) from public, anon;
grant execute on function public.set_platform_mfa_preferred_factor(uuid) to authenticated;

comment on table public.platform_mfa_preferences is 'Stores the preferred MFA factor identifier for UI ordering only. No TOTP secret or OTP is stored.';
comment on function public.set_platform_mfa_preferred_factor(uuid) is 'Changes the current Platform Admin preferred Authenticator after AAL2 authorization and records an audit event.';

