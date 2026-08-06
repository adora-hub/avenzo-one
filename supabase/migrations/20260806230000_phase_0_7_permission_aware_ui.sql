-- Return only the current authenticated member's effective organization permissions.
-- The UI uses this to hide management controls; RLS remains the authority.
create or replace function public.current_user_org_permissions(p_organization_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_permissions text[];
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select coalesce(
    array_agg(distinct rp.permission_code order by rp.permission_code),
    array[]::text[]
  )
  into v_permissions
  from public.organization_members om
  join public.organizations o
    on o.id = om.organization_id
  join public.member_roles mr
    on mr.membership_id = om.id
  join public.organization_roles r
    on r.id = mr.role_id
   and r.organization_id = om.organization_id
  join public.role_permissions rp
    on rp.role_id = r.id
  where om.organization_id = p_organization_id
    and om.user_id = v_user_id
    and om.membership_status = 'active'
    and o.status = 'active';

  return v_permissions;
end;
$$;

revoke all on function public.current_user_org_permissions(uuid) from public;
revoke all on function public.current_user_org_permissions(uuid) from anon;
grant execute on function public.current_user_org_permissions(uuid) to authenticated;
