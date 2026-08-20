-- Phase 0.10.4.1 hardening: keep elevated preference logic outside the exposed API schema.

create or replace function private.set_platform_mfa_preferred_factor(p_factor_id uuid)
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

revoke all on function private.set_platform_mfa_preferred_factor(uuid) from public, anon, authenticated;
grant execute on function private.set_platform_mfa_preferred_factor(uuid) to authenticated;

create or replace function public.set_platform_mfa_preferred_factor(p_factor_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_platform_mfa_preferred_factor(p_factor_id);
$$;

revoke all on function public.set_platform_mfa_preferred_factor(uuid) from public, anon;
grant execute on function public.set_platform_mfa_preferred_factor(uuid) to authenticated;

comment on function public.set_platform_mfa_preferred_factor(uuid) is
  'Invoker wrapper for the private AAL2-validated preferred Authenticator command.';

