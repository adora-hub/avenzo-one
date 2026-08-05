-- Revoke a pending invitation without deleting its audit history.
create or replace function public.revoke_organization_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_invitation public.organization_invitations;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;
  select i.* into v_invitation
  from public.organization_invitations i
  where i.id = p_invitation_id
    and i.status = 'pending'
  for update;
  if not found then raise exception 'pending_invitation_not_found'; end if;
  if not private.has_org_permission(v_invitation.organization_id, 'member.invite') then
    raise exception 'member_invite_permission_required';
  end if;

  update public.organization_invitations
  set status = 'revoked'
  where id = p_invitation_id and status = 'pending';
  return true;
end;
$$;

revoke execute on function public.revoke_organization_invitation(uuid) from public;
revoke execute on function public.revoke_organization_invitation(uuid) from anon;
grant execute on function public.revoke_organization_invitation(uuid) to authenticated;
