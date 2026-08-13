-- Allow an active AAL2 Platform Admin to update only their own display name.
-- The operation is idempotent and records immutable audit evidence without
-- changing the caller's role or access status.

alter table private.platform_admin_access_events
  drop constraint if exists platform_admin_access_event_action_check;

alter table private.platform_admin_access_events
  add constraint platform_admin_access_event_action_check
  check (action in ('grant', 'update', 'suspend', 'reactivate', 'profile_update'));

create or replace function public.platform_update_own_admin_profile(
  p_command_id uuid,
  p_display_name text,
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
  v_existing public.platform_admins;
  v_result public.platform_admins;
  v_existing_event private.platform_admin_access_events;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if length(btrim(coalesce(p_display_name, ''))) not between 2 and 100 then
    raise exception 'platform_admin_display_name_invalid';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then
    raise exception 'platform_admin_reason_invalid';
  end if;

  select e.* into v_existing_event
  from private.platform_admin_access_events e
  where e.command_id = p_command_id;

  if v_existing_event.id is not null then
    if v_existing_event.actor_user_id <> v_actor_id
       or v_existing_event.target_user_id <> v_actor_id
       or v_existing_event.action <> 'profile_update' then
      raise exception 'command_id_conflict' using errcode = '23505';
    end if;
    select * into v_result
    from public.platform_admins
    where user_id = v_actor_id;
    return v_result;
  end if;

  select * into v_existing
  from public.platform_admins
  where user_id = v_actor_id
    and status = 'active'
  for update;

  if v_existing.user_id is null then
    raise exception 'platform_admin_access_not_found' using errcode = '42501';
  end if;

  update public.platform_admins
  set display_name = btrim(p_display_name),
      note = btrim(p_reason),
      updated_at = now()
  where user_id = v_actor_id
  returning * into v_result;

  insert into private.platform_admin_access_events (
    command_id, action, target_user_id, target_email,
    previous_status, new_status, previous_role_code, new_role_code,
    reason, actor_user_id, actor_email
  ) values (
    p_command_id, 'profile_update', v_actor_id, v_actor_email,
    v_existing.status, v_result.status, v_existing.role_code, v_result.role_code,
    btrim(p_reason), v_actor_id, v_actor_email
  );

  return v_result;
end;
$$;

revoke all on function public.platform_update_own_admin_profile(uuid,text,text)
  from public, anon;
grant execute on function public.platform_update_own_admin_profile(uuid,text,text)
  to authenticated;

comment on function public.platform_update_own_admin_profile(uuid,text,text) is
  'Allows an active AAL2 Platform Admin to update only their own display name with audit evidence.';

