create index branches_created_by_idx on public.branches (created_by);
create index organizations_created_by_idx on public.organizations (created_by);

drop policy if exists "members can view their organizations" on public.organizations;
drop policy if exists "organization creators can view their organizations" on public.organizations;

create policy "authorized users can view their organizations"
on public.organizations
for select
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1
    from public.organization_members om
    where om.organization_id = organizations.id
      and om.user_id = (select auth.uid())
      and om.membership_status = 'active'
  )
);
