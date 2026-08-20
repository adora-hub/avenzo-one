drop policy if exists "organization creators can deactivate organizations" on public.organizations;
drop policy if exists "branch creators can deactivate branches" on public.branches;

create policy "organization creators can view their organizations"
on public.organizations
for select
to authenticated
using (created_by = (select auth.uid()));

revoke delete on public.organizations from authenticated;
revoke delete on public.branches from authenticated;
revoke delete on public.organization_members from authenticated;
revoke delete on public.member_branches from authenticated;
