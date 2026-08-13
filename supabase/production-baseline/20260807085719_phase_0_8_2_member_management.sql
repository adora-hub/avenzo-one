-- AVENZO ONE Phase 0.8.2: Member Management
-- All writes run through permission-checked RPCs and append an audit event.

alter table public.membership_events
  drop constraint if exists membership_events_event_type_check;

alter table public.membership_events
  add constraint membership_events_event_type_check check (
    event_type in (
      'created',
      'profile_updated',
      'access_updated',
      'role_changed',
      'scope_changed',
      'suspended',
      'reactivated',
      'removed'
    )
  );

create or replace function private.current_user_is_organization_owner(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.organization_members om
    join public.member_roles mr
      on mr.membership_id = om.id
    join public.organization_roles r
      on r.id = mr.role_id
     and r.organization_id = om.organization_id
    where om.organization_id = p_organization_id
      and om.user_id = (select auth.uid())
      and om.membership_status = 'active'
      and r.code = 'owner'
  );
$$;

revoke all on function private.current_user_is_organization_owner(uuid) from public;
revoke all on function private.current_user_is_organization_owner(uuid) from anon;
revoke all on function private.current_user_is_organization_owner(uuid) from authenticated;

create or replace function private.update_organization_member(
  p_membership_id uuid,
  p_display_name text,
  p_job_title text,
  p_role_code text,
  p_branch_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_organization_id uuid;
  v_member public.organization_members%rowtype;
  v_role_id uuid;
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_job_title text := btrim(coalesce(p_job_title, ''));
  v_old_roles text[] := array[]::text[];
  v_old_branches uuid[] := array[]::uuid[];
  v_new_scope text;
  v_profile_changed boolean;
  v_access_changed boolean;
  v_target_is_owner boolean;
  v_caller_is_owner boolean;
  v_active_owner_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if char_length(v_display_name) > 120 then
    raise exception 'display_name_too_long';
  end if;
  if char_length(v_job_title) > 160 then
    raise exception 'job_title_too_long';
  end if;

  select om.organization_id
  into v_organization_id
  from public.organization_members om
  where om.id = p_membership_id;

  if v_organization_id is null then
    raise exception 'organization_member_not_found';
  end if;

  -- Serialize owner-sensitive changes within the organization.
  perform 1
  from public.organizations o
  where o.id = v_organization_id
  for update;

  select om.*
  into v_member
  from public.organization_members om
  where om.id = p_membership_id
    and om.organization_id = v_organization_id
  for update;

  if not found then
    raise exception 'organization_member_not_found';
  end if;
  if v_member.membership_status = 'removed' then
    raise exception 'removed_member_cannot_be_updated';
  end if;
  if not private.has_org_permission(v_organization_id, 'member.update') then
    raise exception 'member_update_permission_required' using errcode = '42501';
  end if;

  select coalesce(array_agg(r.code order by r.code), array[]::text[])
  into v_old_roles
  from public.member_roles mr
  join public.organization_roles r
    on r.id = mr.role_id
   and r.organization_id = v_organization_id
  where mr.membership_id = p_membership_id;

  select coalesce(array_agg(mb.branch_id order by mb.branch_id), array[]::uuid[])
  into v_old_branches
  from public.member_branches mb
  where mb.membership_id = p_membership_id;

  select r.id
  into v_role_id
  from public.organization_roles r
  where r.organization_id = v_organization_id
    and r.code = p_role_code;

  if v_role_id is null then
    raise exception 'organization_role_not_found';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.organization_id = v_organization_id
      and b.status = 'active'
  ) then
    raise exception 'organization_branch_not_found';
  end if;

  if p_role_code = 'owner' and p_branch_id is not null then
    raise exception 'owner_requires_organization_scope';
  end if;

  v_new_scope := case when p_branch_id is null then 'organization' else 'branch' end;
  v_profile_changed :=
    v_member.display_name is distinct from v_display_name
    or v_member.job_title is distinct from v_job_title;
  v_access_changed :=
    v_old_roles is distinct from array[p_role_code]
    or v_member.scope is distinct from v_new_scope
    or v_old_branches is distinct from (
      case when p_branch_id is null then array[]::uuid[] else array[p_branch_id] end
    );

  if v_access_changed
     and not private.has_org_permission(v_organization_id, 'role.manage') then
    raise exception 'member_access_management_permission_required' using errcode = '42501';
  end if;

  v_target_is_owner := 'owner' = any(v_old_roles);
  v_caller_is_owner := private.current_user_is_organization_owner(v_organization_id);

  if v_access_changed
     and (v_target_is_owner or p_role_code = 'owner')
     and not v_caller_is_owner then
    raise exception 'owner_management_requires_owner' using errcode = '42501';
  end if;

  if v_access_changed
     and v_target_is_owner
     and p_role_code <> 'owner'
     and v_member.membership_status = 'active' then
    select count(distinct om.id)
    into v_active_owner_count
    from public.organization_members om
    join public.member_roles mr on mr.membership_id = om.id
    join public.organization_roles r
      on r.id = mr.role_id
     and r.organization_id = om.organization_id
    where om.organization_id = v_organization_id
      and om.membership_status = 'active'
      and r.code = 'owner';

    if v_active_owner_count <= 1 then
      raise exception 'last_active_owner_required';
    end if;
  end if;

  if v_profile_changed then
    update public.organization_members
    set display_name = v_display_name,
        job_title = v_job_title,
        updated_at = now()
    where id = p_membership_id;

    insert into public.membership_events (
      organization_id,
      membership_id,
      event_type,
      previous_data,
      new_data,
      performed_by
    ) values (
      v_organization_id,
      p_membership_id,
      'profile_updated',
      jsonb_build_object(
        'display_name', v_member.display_name,
        'job_title', v_member.job_title
      ),
      jsonb_build_object(
        'display_name', v_display_name,
        'job_title', v_job_title
      ),
      (select auth.uid())
    );
  end if;

  if v_access_changed then
    delete from public.member_roles
    where membership_id = p_membership_id;

    insert into public.member_roles (membership_id, role_id, assigned_by)
    values (p_membership_id, v_role_id, (select auth.uid()));

    delete from public.member_branches
    where membership_id = p_membership_id;

    if p_branch_id is not null then
      insert into public.member_branches (membership_id, branch_id)
      values (p_membership_id, p_branch_id);
    end if;

    update public.organization_members
    set scope = v_new_scope,
        updated_at = now()
    where id = p_membership_id;

    insert into public.membership_events (
      organization_id,
      membership_id,
      event_type,
      previous_data,
      new_data,
      performed_by
    ) values (
      v_organization_id,
      p_membership_id,
      'access_updated',
      jsonb_build_object(
        'roles', to_jsonb(v_old_roles),
        'scope', v_member.scope,
        'branch_ids', to_jsonb(v_old_branches)
      ),
      jsonb_build_object(
        'roles', jsonb_build_array(p_role_code),
        'scope', v_new_scope,
        'branch_ids', case
          when p_branch_id is null then '[]'::jsonb
          else jsonb_build_array(p_branch_id)
        end
      ),
      (select auth.uid())
    );
  end if;
end;
$$;

revoke all on function private.update_organization_member(uuid, text, text, text, uuid) from public;
revoke all on function private.update_organization_member(uuid, text, text, text, uuid) from anon;
grant execute on function private.update_organization_member(uuid, text, text, text, uuid) to authenticated;

create or replace function public.update_organization_member(
  p_membership_id uuid,
  p_display_name text,
  p_job_title text,
  p_role_code text,
  p_branch_id uuid default null
)
returns void
language sql
security invoker
set search_path = pg_catalog
as $$
  select private.update_organization_member(
    p_membership_id,
    p_display_name,
    p_job_title,
    p_role_code,
    p_branch_id
  );
$$;

revoke all on function public.update_organization_member(uuid, text, text, text, uuid) from public;
revoke all on function public.update_organization_member(uuid, text, text, text, uuid) from anon;
grant execute on function public.update_organization_member(uuid, text, text, text, uuid) to authenticated;

create or replace function private.change_organization_member_status(
  p_membership_id uuid,
  p_new_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_organization_id uuid;
  v_member public.organization_members%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_target_is_owner boolean;
  v_caller_is_owner boolean;
  v_active_owner_count integer;
  v_roles text[] := array[]::text[];
  v_branches uuid[] := array[]::uuid[];
  v_event_type text;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_new_status not in ('active', 'suspended', 'removed') then
    raise exception 'invalid_membership_status';
  end if;
  if v_reason = '' then
    raise exception 'membership_status_reason_required';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'membership_status_reason_too_long';
  end if;

  select om.organization_id
  into v_organization_id
  from public.organization_members om
  where om.id = p_membership_id;

  if v_organization_id is null then
    raise exception 'organization_member_not_found';
  end if;

  perform 1
  from public.organizations o
  where o.id = v_organization_id
  for update;

  select om.*
  into v_member
  from public.organization_members om
  where om.id = p_membership_id
    and om.organization_id = v_organization_id
  for update;

  if not found then
    raise exception 'organization_member_not_found';
  end if;
  if not private.has_org_permission(v_organization_id, 'member.update') then
    raise exception 'member_update_permission_required' using errcode = '42501';
  end if;
  if v_member.membership_status = 'removed' then
    raise exception 'removed_membership_is_final';
  end if;
  if v_member.membership_status = p_new_status then
    return;
  end if;
  if v_member.membership_status = 'active'
     and p_new_status not in ('suspended', 'removed') then
    raise exception 'invalid_membership_status_transition';
  end if;
  if v_member.membership_status = 'suspended'
     and p_new_status not in ('active', 'removed') then
    raise exception 'invalid_membership_status_transition';
  end if;
  if v_member.membership_status not in ('active', 'suspended') then
    raise exception 'invalid_membership_status_transition';
  end if;

  select coalesce(array_agg(r.code order by r.code), array[]::text[])
  into v_roles
  from public.member_roles mr
  join public.organization_roles r
    on r.id = mr.role_id
   and r.organization_id = v_organization_id
  where mr.membership_id = p_membership_id;

  select coalesce(array_agg(mb.branch_id order by mb.branch_id), array[]::uuid[])
  into v_branches
  from public.member_branches mb
  where mb.membership_id = p_membership_id;

  v_target_is_owner := 'owner' = any(v_roles);
  v_caller_is_owner := private.current_user_is_organization_owner(v_organization_id);

  if v_target_is_owner and not v_caller_is_owner then
    raise exception 'owner_management_requires_owner' using errcode = '42501';
  end if;

  if v_target_is_owner
     and v_member.membership_status = 'active'
     and p_new_status in ('suspended', 'removed') then
    select count(distinct om.id)
    into v_active_owner_count
    from public.organization_members om
    join public.member_roles mr on mr.membership_id = om.id
    join public.organization_roles r
      on r.id = mr.role_id
     and r.organization_id = om.organization_id
    where om.organization_id = v_organization_id
      and om.membership_status = 'active'
      and r.code = 'owner';

    if v_active_owner_count <= 1 then
      raise exception 'last_active_owner_required';
    end if;
  end if;

  update public.organization_members
  set membership_status = p_new_status,
      updated_at = now()
  where id = p_membership_id;

  if p_new_status = 'removed' then
    delete from public.member_branches where membership_id = p_membership_id;
    delete from public.member_roles where membership_id = p_membership_id;
  end if;

  v_event_type := case p_new_status
    when 'active' then 'reactivated'
    when 'suspended' then 'suspended'
    when 'removed' then 'removed'
  end;

  insert into public.membership_events (
    organization_id,
    membership_id,
    event_type,
    previous_data,
    new_data,
    reason,
    performed_by
  ) values (
    v_organization_id,
    p_membership_id,
    v_event_type,
    jsonb_build_object(
      'membership_status', v_member.membership_status,
      'roles', to_jsonb(v_roles),
      'scope', v_member.scope,
      'branch_ids', to_jsonb(v_branches)
    ),
    jsonb_build_object('membership_status', p_new_status),
    v_reason,
    (select auth.uid())
  );
end;
$$;

revoke all on function private.change_organization_member_status(uuid, text, text) from public;
revoke all on function private.change_organization_member_status(uuid, text, text) from anon;
grant execute on function private.change_organization_member_status(uuid, text, text) to authenticated;

create or replace function public.change_organization_member_status(
  p_membership_id uuid,
  p_new_status text,
  p_reason text
)
returns void
language sql
security invoker
set search_path = pg_catalog
as $$
  select private.change_organization_member_status(
    p_membership_id,
    p_new_status,
    p_reason
  );
$$;

revoke all on function public.change_organization_member_status(uuid, text, text) from public;
revoke all on function public.change_organization_member_status(uuid, text, text) from anon;
grant execute on function public.change_organization_member_status(uuid, text, text) to authenticated;

create or replace function private.audit_membership_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.membership_events (
    organization_id,
    membership_id,
    event_type,
    new_data,
    performed_by
  ) values (
    new.organization_id,
    new.id,
    'created',
    jsonb_build_object(
      'membership_status', new.membership_status,
      'scope', new.scope,
      'display_name', new.display_name,
      'job_title', new.job_title
    ),
    (select auth.uid())
  );
  return new;
end;
$$;

revoke all on function private.audit_membership_created() from public;
revoke all on function private.audit_membership_created() from anon;
revoke all on function private.audit_membership_created() from authenticated;

drop trigger if exists audit_membership_created_after_insert
  on public.organization_members;

create trigger audit_membership_created_after_insert
after insert on public.organization_members
for each row execute function private.audit_membership_created();

comment on function public.update_organization_member(uuid, text, text, text, uuid) is
  'Atomically updates member profile, role, and branch scope with owner protections and audit history.';

comment on function public.change_organization_member_status(uuid, text, text) is
  'Suspends, reactivates, or removes a member with last-owner protection and audit history.';

-- Prevent an Admin with member.invite from assigning the Owner role. Owner
-- assignment is itself an owner-level operation.
create or replace function private.enforce_owner_invitation_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.role_code = 'owner' then
    if new.branch_id is not null then
      raise exception 'owner_requires_organization_scope';
    end if;
    if not private.current_user_is_organization_owner(new.organization_id) then
      raise exception 'owner_management_requires_owner' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_owner_invitation_authority() from public;
revoke all on function private.enforce_owner_invitation_authority() from anon;
revoke all on function private.enforce_owner_invitation_authority() from authenticated;

drop trigger if exists enforce_owner_invitation_authority_before_write
  on public.organization_invitations;

create trigger enforce_owner_invitation_authority_before_write
before insert or update of role_code, branch_id
on public.organization_invitations
for each row execute function private.enforce_owner_invitation_authority();

-- Keep re-invitation consistent with member removal: removed memberships may
-- rejoin, while active or suspended memberships must use member management.
create or replace function private.accept_organization_invitation(
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_invitation public.organization_invitations%rowtype;
  v_role_id uuid;
  v_membership_id uuid;
  v_organization_name text;
  v_existing_status text;
  v_scope text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select lower(u.email)
  into v_email
  from auth.users u
  where u.id = v_user_id;

  if v_email is null then
    raise exception 'authenticated_email_required';
  end if;

  select i.*
  into v_invitation
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

  select o.name
  into v_organization_name
  from public.organizations o
  where o.id = v_invitation.organization_id
    and o.status = 'active';

  if v_organization_name is null then
    raise exception 'organization_not_active';
  end if;

  if v_invitation.branch_id is not null and not exists (
    select 1
    from public.branches b
    where b.id = v_invitation.branch_id
      and b.organization_id = v_invitation.organization_id
      and b.status = 'active'
  ) then
    raise exception 'organization_branch_not_found';
  end if;

  if v_invitation.role_code = 'owner' then
    if v_invitation.branch_id is not null then
      raise exception 'owner_requires_organization_scope';
    end if;
    if not exists (
      select 1
      from public.organization_members inviter_member
      join public.member_roles inviter_member_role
        on inviter_member_role.membership_id = inviter_member.id
      join public.organization_roles inviter_role
        on inviter_role.id = inviter_member_role.role_id
       and inviter_role.organization_id = inviter_member.organization_id
      where inviter_member.organization_id = v_invitation.organization_id
        and inviter_member.user_id = v_invitation.invited_by
        and inviter_member.membership_status = 'active'
        and inviter_role.code = 'owner'
    ) then
      raise exception 'owner_management_requires_owner' using errcode = '42501';
    end if;
  end if;

  select r.id
  into v_role_id
  from public.organization_roles r
  where r.organization_id = v_invitation.organization_id
    and r.code = v_invitation.role_code;

  if v_role_id is null then
    raise exception 'organization_role_not_found';
  end if;

  select om.membership_status
  into v_existing_status
  from public.organization_members om
  where om.organization_id = v_invitation.organization_id
    and om.user_id = v_user_id
  for update;

  if v_existing_status = 'active' then
    raise exception 'user_already_active_member';
  end if;
  if v_existing_status = 'suspended' then
    raise exception 'suspended_member_requires_reactivation';
  end if;

  v_scope := case when v_invitation.branch_id is null then 'organization' else 'branch' end;

  insert into public.organization_members (
    organization_id,
    user_id,
    membership_status,
    scope
  ) values (
    v_invitation.organization_id,
    v_user_id,
    'active',
    v_scope
  )
  on conflict (organization_id, user_id) do update
  set membership_status = 'active',
      scope = excluded.scope,
      updated_at = now()
  returning id into v_membership_id;

  delete from public.member_branches
  where membership_id = v_membership_id;

  delete from public.member_roles
  where membership_id = v_membership_id;

  insert into public.member_roles (membership_id, role_id, assigned_by)
  values (v_membership_id, v_role_id, v_invitation.invited_by);

  if v_invitation.branch_id is not null then
    insert into public.member_branches (membership_id, branch_id)
    values (v_membership_id, v_invitation.branch_id);
  end if;

  if v_existing_status = 'removed' then
    insert into public.membership_events (
      organization_id,
      membership_id,
      event_type,
      previous_data,
      new_data,
      reason,
      performed_by
    ) values (
      v_invitation.organization_id,
      v_membership_id,
      'reactivated',
      jsonb_build_object('membership_status', 'removed'),
      jsonb_build_object(
        'membership_status', 'active',
        'role', v_invitation.role_code,
        'scope', v_scope,
        'branch_id', v_invitation.branch_id
      ),
      'Accepted a new organization invitation',
      v_user_id
    );
  end if;

  update public.organization_invitations
  set status = 'accepted',
      accepted_at = now()
  where id = v_invitation.id;

  return jsonb_build_object(
    'invitation_id', v_invitation.id,
    'organization_id', v_invitation.organization_id,
    'organization_name', v_organization_name,
    'membership_id', v_membership_id
  );
end;
$$;

revoke all on function private.accept_organization_invitation(uuid) from public;
revoke all on function private.accept_organization_invitation(uuid) from anon;
grant execute on function private.accept_organization_invitation(uuid) to authenticated;

create or replace function public.accept_organization_invitation(
  p_invitation_id uuid
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
  select private.accept_organization_invitation(p_invitation_id);
$$;

revoke all on function public.accept_organization_invitation(uuid) from public;
revoke all on function public.accept_organization_invitation(uuid) from anon;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;

