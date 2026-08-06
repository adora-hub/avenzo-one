-- Return the current user's roles, branch scope, and effective permissions.
-- The private helper performs the privileged lookup while always binding data to auth.uid().

create or replace function private.current_user_organization_access(
  p_organization_id uuid default null
)
returns table (
  organization_id uuid,
  membership_status text,
  scope text,
  roles jsonb,
  branches jsonb,
  permissions jsonb
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    om.organization_id,
    om.membership_status,
    om.scope,
    coalesce(role_data.roles, '[]'::jsonb) as roles,
    coalesce(branch_data.branches, '[]'::jsonb) as branches,
    coalesce(permission_data.permissions, '[]'::jsonb) as permissions
  from public.organization_members om
  join public.organizations o
    on o.id = om.organization_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'code', role_rows.code,
        'name', role_rows.name,
        'description', role_rows.description
      )
      order by role_rows.code
    ) as roles
    from (
      select distinct r.code, r.name, r.description
      from public.member_roles mr
      join public.organization_roles r
        on r.id = mr.role_id
       and r.organization_id = om.organization_id
      where mr.membership_id = om.id
    ) role_rows
  ) role_data on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', branch_rows.id,
        'code', branch_rows.code,
        'name', branch_rows.name
      )
      order by branch_rows.code
    ) as branches
    from (
      select distinct b.id, b.code, b.name
      from public.member_branches mb
      join public.branches b
        on b.id = mb.branch_id
       and b.organization_id = om.organization_id
      where mb.membership_id = om.id
        and b.status = 'active'
    ) branch_rows
  ) branch_data on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'code', permission_rows.code,
        'description', permission_rows.description
      )
      order by permission_rows.code
    ) as permissions
    from (
      select distinct p.code, p.description
      from public.member_roles mr
      join public.organization_roles r
        on r.id = mr.role_id
       and r.organization_id = om.organization_id
      join public.role_permissions rp
        on rp.role_id = r.id
      join public.permissions p
        on p.code = rp.permission_code
      where mr.membership_id = om.id
    ) permission_rows
  ) permission_data on true
  where om.user_id = (select auth.uid())
    and om.membership_status = 'active'
    and o.status = 'active'
    and (
      p_organization_id is null
      or om.organization_id = p_organization_id
    )
  order by om.organization_id;
$$;

revoke all on function private.current_user_organization_access(uuid) from public;
revoke all on function private.current_user_organization_access(uuid) from anon;
grant execute on function private.current_user_organization_access(uuid) to authenticated;

create or replace function public.current_user_organization_access(
  p_organization_id uuid default null
)
returns table (
  organization_id uuid,
  membership_status text,
  scope text,
  roles jsonb,
  branches jsonb,
  permissions jsonb
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select *
  from private.current_user_organization_access(p_organization_id);
$$;

revoke all on function public.current_user_organization_access(uuid) from public;
revoke all on function public.current_user_organization_access(uuid) from anon;
grant execute on function public.current_user_organization_access(uuid) to authenticated;
