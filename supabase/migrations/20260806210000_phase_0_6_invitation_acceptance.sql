-- Phase 0.6: securely accept an organization invitation.
-- The function is deliberately narrow: the authenticated user's email must
-- match the invitation, and the function creates only the invited scope/role.

drop policy if exists "members can view organization invitations" on public.organization_invitations;
drop policy if exists "invitees can view their own invitations" on public.organization_invitations;

create policy "authorized users can view organization invitations"
on public.organization_invitations for select to authenticated
using (
  private.is_platform_admin()
  or private.has_org_permission(organization_id, 'member.read')
  or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

create or replace function public.accept_organization_invitation(p_invitation_id uuid)
returns table (
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
  membership_id uuid
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_invitation public.organization_invitations;
  v_role_id uuid;
  v_membership_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_user_id;

  if v_email is null then
    raise exception 'authenticated_email_required';
  end if;

  select i.* into v_invitation
  from public.organization_invitations i
  where i.id = p_invitation_id
    and lower(i.email) = v_email
  for update;

  if not found then
    raise exception 'invitation_not_found_or_email_mismatch';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'invitation_not_pending';
  end if;

  if v_invitation.expires_at <= now() then
    update public.organization_invitations
    set status = 'expired'
    where id = v_invitation.id;
    raise exception 'invitation_expired';
  end if;

  if not exists (
    select 1 from public.organizations o
    where o.id = v_invitation.organization_id and o.status = 'active'
  ) then
    raise exception 'organization_not_active';
  end if;

  if v_invitation.branch_id is not null and not exists (
    select 1 from public.branches b
    where b.id = v_invitation.branch_id
      and b.organization_id = v_invitation.organization_id
      and b.status = 'active'
  ) then
    raise exception 'organization_branch_not_found';
  end if;

  select r.id into v_role_id
  from public.organization_roles r
  where r.organization_id = v_invitation.organization_id
    and r.code = v_invitation.role_code;

  if v_role_id is null then
    raise exception 'organization_role_not_found';
  end if;

  insert into public.organization_members
    (organization_id, user_id, membership_status, scope)
  values
    (v_invitation.organization_id, v_user_id, 'active',
     case when v_invitation.branch_id is null then 'organization' else 'branch' end)
  on conflict (organization_id, user_id) do update
    set membership_status = 'active', updated_at = now()
  returning id into v_membership_id;

  insert into public.member_roles (membership_id, role_id, assigned_by)
  values (v_membership_id, v_role_id, v_invitation.invited_by)
  on conflict (membership_id, role_id) do nothing;

  if v_invitation.branch_id is not null then
    insert into public.member_branches (membership_id, branch_id)
    values (v_membership_id, v_invitation.branch_id)
    on conflict (membership_id, branch_id) do nothing;
  end if;

  update public.organization_invitations
  set status = 'accepted', accepted_at = now()
  where id = v_invitation.id;

  return query
  select v_invitation.id, v_invitation.organization_id, o.name, v_membership_id
  from public.organizations o
  where o.id = v_invitation.organization_id;
end;
$$;

revoke all on function public.accept_organization_invitation(uuid) from public;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;
