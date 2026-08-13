-- AVENZO ONE Phase 1.2.2.5.4: owner-scoped session security activity.
-- Returns a deliberately small safe projection. Raw session IDs, user IDs,
-- metadata, authentication tokens and IP addresses never leave the database.

create or replace function public.app_list_my_session_security_activity(
  p_limit integer default 20
)
returns table (
  event_id uuid,
  event_action text,
  occurred_at timestamptz,
  device_label text,
  browser_name text,
  operating_system text,
  policy_tier text,
  policy_version bigint,
  is_current_device boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_session_id text := nullif(btrim(coalesce(auth.jwt() ->> 'session_id', '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_current_session_id is null or length(v_current_session_id) > 255 then
    raise exception 'session_id_required' using errcode = '22023';
  end if;

  return query
  select
    e.id,
    e.action,
    e.created_at,
    s.device_label,
    s.browser_name,
    s.operating_system,
    e.policy_tier,
    e.policy_version,
    e.session_id = v_current_session_id
  from private.app_session_security_events e
  join private.app_sessions s
    on s.session_id = e.session_id
   and s.user_id = e.user_id
  where e.user_id = v_user_id
  order by e.created_at desc, e.id desc
  limit v_limit;
end;
$$;

revoke all on function public.app_list_my_session_security_activity(integer) from public, anon;
grant execute on function public.app_list_my_session_security_activity(integer) to authenticated;

comment on function public.app_list_my_session_security_activity(integer) is
  'Lists only the caller session security events using a safe display projection. Raw session IDs, user IDs, event metadata, tokens and IP addresses are not returned.';
