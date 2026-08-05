create policy "authorized members can view organization members"
on public.organization_members for select to authenticated
using (
  private.has_org_permission(organization_id, 'member.read')
);
