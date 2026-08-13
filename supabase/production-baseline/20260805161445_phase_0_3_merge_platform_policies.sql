-- Merge tenant and platform-admin access into one policy per table/action.
drop policy if exists "platform admins can view all organizations" on public.organizations;
drop policy if exists "platform admins can update organizations" on public.organizations;
drop policy if exists "platform admins can view all branches" on public.branches;
drop policy if exists "platform admins can update branches" on public.branches;

drop policy if exists "authorized users can view their organizations" on public.organizations;
create policy "authorized users can view their organizations"
on public.organizations for select to authenticated
using (
  private.is_platform_admin()
  or created_by = (select auth.uid())
  or exists (
    select 1 from public.organization_members om
    where om.organization_id = organizations.id
      and om.user_id = (select auth.uid())
      and om.membership_status = 'active'
  )
);

drop policy if exists "authorized members can update organizations" on public.organizations;
create policy "authorized members can update organizations"
on public.organizations for update to authenticated
using (
  private.is_platform_admin()
  or private.has_org_permission(id, 'organization.update')
)
with check (
  private.is_platform_admin()
  or private.has_org_permission(id, 'organization.update')
);

drop policy if exists "users can view branches in their scope" on public.branches;
create policy "users can view branches in their scope"
on public.branches for select to authenticated
using (
  private.is_platform_admin()
  or exists (
    select 1
    from public.organization_members om
    where om.organization_id = branches.organization_id
      and om.user_id = (select auth.uid())
      and om.membership_status = 'active'
      and (
        om.scope = 'organization'
        or exists (
          select 1 from public.member_branches mb
          where mb.membership_id = om.id
            and mb.branch_id = branches.id
        )
      )
  )
);

drop policy if exists "authorized members can update branches" on public.branches;
create policy "authorized members can update branches"
on public.branches for update to authenticated
using (
  private.is_platform_admin()
  or private.has_org_permission(organization_id, 'branch.update', id)
)
with check (
  private.is_platform_admin()
  or private.has_org_permission(organization_id, 'branch.update', id)
);

create index if not exists platform_admins_created_by_idx
  on public.platform_admins (created_by);

