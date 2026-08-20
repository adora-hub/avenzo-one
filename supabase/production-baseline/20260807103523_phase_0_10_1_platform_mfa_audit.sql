-- AVENZO ONE Phase 0.10.1: auditable Platform Admin TOTP enrollment.

create table if not exists private.platform_security_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text,
  action text not null,
  factor_type text not null default 'totp',
  created_at timestamptz not null default now(),
  constraint platform_security_audit_action_check
    check (action in ('mfa_enrollment_started', 'mfa_enrollment_verified')),
  constraint platform_security_audit_factor_check
    check (factor_type = 'totp')
);

create index if not exists platform_security_audit_actor_created_idx
  on private.platform_security_audit_logs (actor_user_id, created_at desc);

alter table private.platform_security_audit_logs enable row level security;
revoke all on private.platform_security_audit_logs from public, anon, authenticated;

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

  if p_action not in ('mfa_enrollment_started', 'mfa_enrollment_verified') then
    raise exception 'invalid_platform_security_action' using errcode = '22023';
  end if;

  if p_factor_type <> 'totp' then
    raise exception 'invalid_mfa_factor_type' using errcode = '22023';
  end if;

  insert into private.platform_security_audit_logs (
    actor_user_id,
    actor_email,
    action,
    factor_type
  )
  values (
    (select auth.uid()),
    (select auth.jwt() ->> 'email'),
    p_action,
    p_factor_type
  );
end;
$$;

revoke all on function private.record_platform_security_event(text,text)
  from public, anon, authenticated;
grant execute on function private.record_platform_security_event(text,text)
  to authenticated;

create or replace function public.record_platform_security_event(
  p_action text,
  p_factor_type text default 'totp'
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.record_platform_security_event(p_action, p_factor_type);
$$;

revoke all on function public.record_platform_security_event(text,text)
  from public, anon;
grant execute on function public.record_platform_security_event(text,text)
  to authenticated;

comment on table private.platform_security_audit_logs is
  'Append-only Platform Admin security events. Never stores TOTP secrets, QR codes, URIs, or verification codes.';
comment on function public.record_platform_security_event(text,text) is
  'Records allowlisted Platform Admin MFA enrollment events after rechecking auth.uid() and active platform access.';
