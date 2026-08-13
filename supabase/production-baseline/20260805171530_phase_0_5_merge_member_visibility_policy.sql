-- Keep organization member visibility in one permissive SELECT policy.
-- This preserves self-visibility while allowing member.read users to manage the workspace.
drop policy if exists "users can view their own memberships" on public.organization_members;
drop policy if exists "authorized members can view organization members" on public.organization_members;

create policy "authorized users can view organization members"
on public.organization_members for select to authenticated
using (
  user_id = (select auth.uid())
  or private.has_org_permission(organization_id, 'member.read')
);
