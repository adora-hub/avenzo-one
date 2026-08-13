drop policy if exists "authorized users can view organization invitations" on public.organization_invitations;
create policy "authorized users can view organization invitations"
on public.organization_invitations for select to authenticated
using (
  private.is_platform_admin()
  or private.has_org_permission(organization_id, 'member.read')
  or lower(email) = lower(coalesce((select (auth.jwt() ->> 'email')), ''))
);
revoke execute on function public.accept_organization_invitation(uuid) from public;
revoke execute on function public.accept_organization_invitation(uuid) from anon;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;
