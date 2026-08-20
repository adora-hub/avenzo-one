-- Phase 1.1.3.7.4.1 hardening: serialize Platform Admin access changes.
-- This prevents two concurrent commands from both demoting or suspending
-- the last active Super Admin after reading the same pre-change count.

create or replace function public.platform_manage_admin_access(
  p_command_id uuid,
  p_email text,
  p_display_name text,
  p_role_code text,
  p_action text,
  p_reason text
)
returns public.platform_admins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_target_id uuid;
  v_target_email text := lower(btrim(coalesce(p_email, '')));
  v_existing public.platform_admins;
  v_result public.platform_admins;
  v_new_status text;
  v_event_action text;
  v_super_admin_count integer;
begin
  if not private.is_platform_super_admin() then
    raise exception 'platform_super_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if position('@' in v_target_email) <= 1 then raise exception 'platform_admin_email_invalid'; end if;
  if p_role_code not in ('super_admin', 'platform_admin') then raise exception 'platform_admin_role_invalid'; end if;
  if p_action not in ('grant', 'update', 'suspend', 'reactivate') then raise exception 'platform_admin_action_invalid'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then
    raise exception 'platform_admin_reason_invalid';
  end if;

  select e.target_user_id into v_target_id
  from private.platform_admin_access_events e
  where e.command_id = p_command_id;
  if v_target_id is not null then
    select * into v_result from public.platform_admins where user_id = v_target_id;
    return v_result;
  end if;

  select u.id into v_target_id
  from auth.users u
  where lower(u.email) = v_target_email
    and u.email_confirmed_at is not null;
  if v_target_id is null then
    raise exception 'platform_admin_confirmed_user_not_found';
  end if;

  -- Serialize every access mutation before counting active Super Admins.
  lock table public.platform_admins in share row exclusive mode;

  select * into v_existing
  from public.platform_admins
  where user_id = v_target_id
  for update;

  if v_target_id = v_actor_id and p_action in ('suspend', 'update') then
    raise exception 'platform_admin_cannot_change_own_access' using errcode = '42501';
  end if;

  if p_action = 'grant' and v_existing.user_id is not null and v_existing.status = 'active' then
    raise exception 'platform_admin_already_active';
  end if;
  if p_action in ('update', 'suspend') and v_existing.user_id is null then
    raise exception 'platform_admin_access_not_found';
  end if;
  if p_action = 'reactivate' and (v_existing.user_id is null or v_existing.status <> 'suspended') then
    raise exception 'platform_admin_not_suspended';
  end if;

  select count(*)::integer into v_super_admin_count
  from public.platform_admins
  where status = 'active' and role_code = 'super_admin';

  if v_existing.user_id is not null
     and v_existing.status = 'active'
     and v_existing.role_code = 'super_admin'
     and (p_action = 'suspend' or p_role_code <> 'super_admin')
     and v_super_admin_count <= 1 then
    raise exception 'platform_admin_last_super_admin_protected' using errcode = '42501';
  end if;

  v_new_status := case when p_action = 'suspend' then 'suspended' else 'active' end;
  v_event_action := case
    when v_existing.user_id is null then 'grant'
    when p_action = 'suspend' then 'suspend'
    when p_action = 'reactivate' or v_existing.status = 'suspended' then 'reactivate'
    else 'update'
  end;

  insert into public.platform_admins (
    user_id, status, note, display_name, role_code, created_by, created_at, updated_at
  ) values (
    v_target_id, v_new_status, btrim(p_reason), nullif(btrim(coalesce(p_display_name, '')), ''),
    p_role_code, v_actor_id, now(), now()
  )
  on conflict (user_id) do update
  set status = excluded.status,
      note = excluded.note,
      display_name = excluded.display_name,
      role_code = excluded.role_code,
      updated_at = now()
  returning * into v_result;

  insert into private.platform_admin_access_events (
    command_id, action, target_user_id, target_email,
    previous_status, new_status, previous_role_code, new_role_code,
    reason, actor_user_id, actor_email
  ) values (
    p_command_id, v_event_action, v_target_id, v_target_email,
    v_existing.status, v_result.status, v_existing.role_code, v_result.role_code,
    btrim(p_reason), v_actor_id, v_actor_email
  );

  return v_result;
end;
$$;

revoke all on function public.platform_manage_admin_access(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.platform_manage_admin_access(uuid,text,text,text,text,text) to authenticated;

