-- Restrict Organization creation to first-time users, existing Owners, and Platform Admins.
-- The helper is used by both the INSERT policy and the permission-aware UI.

create or replace function private.can_current_user_create_organization()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    (select auth.uid()) is not null
    and (
      private.is_platform_admin()
      or not exists (
        select 1
        from public.organization_members om
        where om.user_id = (select auth.uid())
          and om.membership_status = 'active'
      )
      or exists (
        select 1
        from public.organization_members om
        join public.member_roles mr
          on mr.membership_id = om.id
        join public.organization_roles r
          on r.id = mr.role_id
         and r.organization_id = om.organization_id
        join public.organizations o
          on o.id = om.organization_id
        where om.user_id = (select auth.uid())
          and om.membership_status = 'active'
          and r.code = 'owner'
          and o.status = 'active'
      )
    ),
    false
  );
$$;

revoke all on function private.can_current_user_create_organization() from public;
revoke all on function private.can_current_user_create_organization() from anon;
grant execute on function private.can_current_user_create_organization() to authenticated;

create or replace function public.current_user_can_create_organization()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select private.can_current_user_create_organization();
$$;

revoke all on function public.current_user_can_create_organization() from public;
revoke all on function public.current_user_can_create_organization() from anon;
grant execute on function public.current_user_can_create_organization() to authenticated;

drop policy if exists "authenticated users can create organizations" on public.organizations;
create policy "eligible users can create organizations"
on public.organizations
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.can_current_user_create_organization())
);
