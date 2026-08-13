-- AVENZO ONE Phase 0.8.3: paginated invitation history.
-- The public RPC is SECURITY INVOKER; privileged reads stay in private schema
-- and always verify the caller's organization permission.

create or replace function private.organization_invitation_history(
  p_organization_id uuid,
  p_search text default '',
  p_status text default 'all',
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_status text := lower(btrim(coalesce(p_status, 'all')));
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
  v_offset integer;
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.has_org_permission(p_organization_id, 'member.read') then
    raise exception 'member_read_permission_required' using errcode = '42501';
  end if;
  if v_status not in ('all', 'pending', 'accepted', 'revoked', 'expired') then
    raise exception 'invalid_invitation_status';
  end if;
  if char_length(v_search) > 160 then
    raise exception 'invitation_search_too_long';
  end if;

  v_offset := (v_page - 1) * v_page_size;

  with effective_invitations as (
    select
      i.id,
      i.email,
      i.role_code,
      i.branch_id,
      b.code as branch_code,
      b.name as branch_name,
      i.status as stored_status,
      case
        when i.status = 'pending' and i.expires_at <= now() then 'expired'
        else i.status
      end as effective_status,
      i.expires_at,
      i.created_at,
      i.accepted_at
    from public.organization_invitations i
    left join public.branches b
      on b.id = i.branch_id
     and b.organization_id = i.organization_id
    where i.organization_id = p_organization_id
  ),
  filtered as (
    select *
    from effective_invitations e
    where (v_search = '' or e.email ilike '%' || v_search || '%')
      and (v_status = 'all' or e.effective_status = v_status)
  ),
  page_rows as (
    select *
    from filtered
    order by created_at desc, id desc
    offset v_offset
    limit v_page_size
  )
  select jsonb_build_object(
    'total_count', (select count(*) from filtered),
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'email', p.email,
            'role_code', p.role_code,
            'branch_id', p.branch_id,
            'branch_code', p.branch_code,
            'branch_name', p.branch_name,
            'stored_status', p.stored_status,
            'status', p.effective_status,
            'expires_at', p.expires_at,
            'created_at', p.created_at,
            'accepted_at', p.accepted_at
          )
          order by p.created_at desc, p.id desc
        )
        from page_rows p
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function private.organization_invitation_history(uuid, text, text, integer, integer) from public;
revoke all on function private.organization_invitation_history(uuid, text, text, integer, integer) from anon;
grant execute on function private.organization_invitation_history(uuid, text, text, integer, integer) to authenticated;

create or replace function public.organization_invitation_history(
  p_organization_id uuid,
  p_search text default '',
  p_status text default 'all',
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select private.organization_invitation_history(
    p_organization_id,
    p_search,
    p_status,
    p_page,
    p_page_size
  );
$$;

revoke all on function public.organization_invitation_history(uuid, text, text, integer, integer) from public;
revoke all on function public.organization_invitation_history(uuid, text, text, integer, integer) from anon;
grant execute on function public.organization_invitation_history(uuid, text, text, integer, integer) to authenticated;

comment on function public.organization_invitation_history(uuid, text, text, integer, integer) is
  'Returns permission-checked invitation history with effective status, search, filters, and server-side pagination.';

-- Expire an old pending invitation for the same email before creating a new
-- one. This keeps the partial unique index useful without blocking re-invites.
create or replace function private.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_role_code text,
  p_branch_id uuid default null,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns public.organization_invitations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_invitation public.organization_invitations%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_existing_member_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.has_org_permission(p_organization_id, 'member.invite') then
    raise exception 'member_invite_permission_required' using errcode = '42501';
  end if;
  if position('@' in v_email) <= 1 or position('.' in split_part(v_email, '@', 2)) <= 1 then
    raise exception 'invalid_invitation_email';
  end if;
  if char_length(v_email) > 320 then
    raise exception 'invitation_email_too_long';
  end if;
  if p_expires_at <= now() then
    raise exception 'invitation_expiry_must_be_future';
  end if;
  if not exists (
    select 1
    from public.organization_roles r
    where r.organization_id = p_organization_id
      and r.code = p_role_code
  ) then
    raise exception 'organization_role_not_found';
  end if;
  if p_branch_id is not null and not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
      and b.status = 'active'
  ) then
    raise exception 'organization_branch_not_found';
  end if;

  select om.membership_status
  into v_existing_member_status
  from auth.users u
  join public.organization_members om
    on om.user_id = u.id
   and om.organization_id = p_organization_id
  where lower(u.email) = v_email
  limit 1;

  if v_existing_member_status = 'active' then
    raise exception 'user_already_active_member';
  end if;
  if v_existing_member_status = 'suspended' then
    raise exception 'suspended_member_requires_reactivation';
  end if;

  update public.organization_invitations
  set status = 'expired'
  where organization_id = p_organization_id
    and email = v_email
    and status = 'pending'
    and expires_at <= now();

  insert into public.organization_invitations (
    organization_id,
    email,
    role_code,
    branch_id,
    invited_by,
    expires_at
  ) values (
    p_organization_id,
    v_email,
    p_role_code,
    p_branch_id,
    (select auth.uid()),
    p_expires_at
  )
  returning * into v_invitation;

  return v_invitation;
end;
$$;

revoke all on function private.create_organization_invitation(uuid, text, text, uuid, timestamptz) from public;
revoke all on function private.create_organization_invitation(uuid, text, text, uuid, timestamptz) from anon;
grant execute on function private.create_organization_invitation(uuid, text, text, uuid, timestamptz) to authenticated;

create or replace function public.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_role_code text,
  p_branch_id uuid default null,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns public.organization_invitations
language sql
security invoker
set search_path = pg_catalog
as $$
  select (private.create_organization_invitation(
    p_organization_id,
    p_email,
    p_role_code,
    p_branch_id,
    p_expires_at
  )).*;
$$;

revoke all on function public.create_organization_invitation(uuid, text, text, uuid, timestamptz) from public;
revoke all on function public.create_organization_invitation(uuid, text, text, uuid, timestamptz) from anon;
grant execute on function public.create_organization_invitation(uuid, text, text, uuid, timestamptz) to authenticated;

create or replace function private.revoke_organization_invitation(
  p_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_invitation public.organization_invitations%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select i.*
  into v_invitation
  from public.organization_invitations i
  where i.id = p_invitation_id
    and i.status = 'pending'
  for update;

  if not found then
    raise exception 'pending_invitation_not_found';
  end if;
  if not private.has_org_permission(v_invitation.organization_id, 'member.invite') then
    raise exception 'member_invite_permission_required' using errcode = '42501';
  end if;

  update public.organization_invitations
  set status = case when expires_at <= now() then 'expired' else 'revoked' end
  where id = p_invitation_id;

  return true;
end;
$$;

revoke all on function private.revoke_organization_invitation(uuid) from public;
revoke all on function private.revoke_organization_invitation(uuid) from anon;
grant execute on function private.revoke_organization_invitation(uuid) to authenticated;

create or replace function public.revoke_organization_invitation(
  p_invitation_id uuid
)
returns boolean
language sql
security invoker
set search_path = pg_catalog
as $$
  select private.revoke_organization_invitation(p_invitation_id);
$$;

revoke all on function public.revoke_organization_invitation(uuid) from public;
revoke all on function public.revoke_organization_invitation(uuid) from anon;
grant execute on function public.revoke_organization_invitation(uuid) to authenticated;

comment on function public.create_organization_invitation(uuid, text, text, uuid, timestamptz) is
  'Creates an invitation after permission checks and expires a stale pending invitation for the same email.';

comment on function public.revoke_organization_invitation(uuid) is
  'Revokes a pending invitation after checking member.invite permission.';

