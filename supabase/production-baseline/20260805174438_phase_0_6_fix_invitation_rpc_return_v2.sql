drop function if exists public.accept_organization_invitation(uuid);
create or replace function public.accept_organization_invitation(p_invitation_id uuid)
returns jsonb
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
  v_organization_name text;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user_id;
  if v_email is null then raise exception 'authenticated_email_required'; end if;
  select i.* into v_invitation from public.organization_invitations i where i.id = p_invitation_id and lower(i.email) = v_email for update;
  if not found then raise exception 'invitation_not_found_or_email_mismatch'; end if;
  if v_invitation.status <> 'pending' then raise exception 'invitation_not_pending'; end if;
  if v_invitation.expires_at <= now() then update public.organization_invitations set status = 'expired' where id = v_invitation.id; raise exception 'invitation_expired'; end if;
  select o.name into v_organization_name from public.organizations o where o.id = v_invitation.organization_id and o.status = 'active';
  if v_organization_name is null then raise exception 'organization_not_active'; end if;
  if v_invitation.branch_id is not null and not exists (select 1 from public.branches b where b.id = v_invitation.branch_id and b.organization_id = v_invitation.organization_id and b.status = 'active') then raise exception 'organization_branch_not_found'; end if;
  select r.id into v_role_id from public.organization_roles r where r.organization_id = v_invitation.organization_id and r.code = v_invitation.role_code;
  if v_role_id is null then raise exception 'organization_role_not_found'; end if;
  insert into public.organization_members (organization_id, user_id, membership_status, scope)
  values (v_invitation.organization_id, v_user_id, 'active', case when v_invitation.branch_id is null then 'organization' else 'branch' end)
  on conflict (organization_id, user_id) do update set membership_status = 'active', updated_at = now()
  returning id into v_membership_id;
  insert into public.member_roles (membership_id, role_id, assigned_by) values (v_membership_id, v_role_id, v_invitation.invited_by) on conflict (membership_id, role_id) do nothing;
  if v_invitation.branch_id is not null then insert into public.member_branches (membership_id, branch_id) values (v_membership_id, v_invitation.branch_id) on conflict (membership_id, branch_id) do nothing; end if;
  update public.organization_invitations set status = 'accepted', accepted_at = now() where id = v_invitation.id;
  return jsonb_build_object('invitation_id', v_invitation.id, 'organization_id', v_invitation.organization_id, 'organization_name', v_organization_name, 'membership_id', v_membership_id);
end;
$$;
revoke execute on function public.accept_organization_invitation(uuid) from public;
revoke execute on function public.accept_organization_invitation(uuid) from anon;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;
