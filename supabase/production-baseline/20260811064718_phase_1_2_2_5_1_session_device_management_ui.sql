-- AVENZO ONE Phase 1.2.2.5.1: Session & Device Management UI (read-only).
-- Exposes only the authenticated user's safe session metadata through RPC.
-- Raw Supabase session IDs, access tokens, refresh tokens and IP addresses are never returned.

alter table private.app_sessions
  add column if not exists device_label text,
  add column if not exists browser_name text,
  add column if not exists operating_system text;

alter table private.app_sessions
  drop constraint if exists app_sessions_device_label_check,
  add constraint app_sessions_device_label_check
    check (device_label is null or length(device_label) between 1 and 80),
  drop constraint if exists app_sessions_browser_name_check,
  add constraint app_sessions_browser_name_check
    check (browser_name is null or length(browser_name) between 1 and 50),
  drop constraint if exists app_sessions_operating_system_check,
  add constraint app_sessions_operating_system_check
    check (operating_system is null or length(operating_system) between 1 and 50);

create or replace function public.app_update_current_session_device(
  p_device_label text,
  p_browser_name text,
  p_operating_system text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := nullif(btrim(coalesce(auth.jwt() ->> 'session_id', '')), '');
  v_device_label text := nullif(btrim(coalesce(p_device_label, '')), '');
  v_browser_name text := nullif(btrim(coalesce(p_browser_name, '')), '');
  v_operating_system text := nullif(btrim(coalesce(p_operating_system, '')), '');
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_session_id is null or length(v_session_id) > 255 then
    raise exception 'session_id_required' using errcode = '22023';
  end if;
  if v_device_label is null or length(v_device_label) > 80 then
    raise exception 'invalid_device_label' using errcode = '22023';
  end if;
  if v_browser_name is not null and length(v_browser_name) > 50 then
    raise exception 'invalid_browser_name' using errcode = '22023';
  end if;
  if v_operating_system is not null and length(v_operating_system) > 50 then
    raise exception 'invalid_operating_system' using errcode = '22023';
  end if;

  update private.app_sessions s
  set device_label = v_device_label,
      browser_name = v_browser_name,
      operating_system = v_operating_system,
      updated_at = now()
  where s.session_id = v_session_id
    and s.user_id = v_user_id
    and (
      s.device_label is distinct from v_device_label
      or s.browser_name is distinct from v_browser_name
      or s.operating_system is distinct from v_operating_system
    );

  return exists (
    select 1
    from private.app_sessions s
    where s.session_id = v_session_id
      and s.user_id = v_user_id
  );
end;
$$;

create or replace function public.app_list_my_sessions()
returns table (
  app_session_id uuid,
  is_current boolean,
  device_label text,
  browser_name text,
  operating_system text,
  policy_tier text,
  policy_version bigint,
  started_at timestamptz,
  last_seen_at timestamptz,
  idle_expires_at timestamptz,
  absolute_expires_at timestamptz,
  revoked_at timestamptz,
  session_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := nullif(btrim(coalesce(auth.jwt() ->> 'session_id', '')), '');
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_session_id is null or length(v_session_id) > 255 then
    raise exception 'session_id_required' using errcode = '22023';
  end if;

  return query
  select s.id,
    s.session_id = v_session_id,
    s.device_label,
    s.browser_name,
    s.operating_system,
    s.policy_tier,
    s.policy_version,
    s.started_at,
    s.last_seen_at,
    s.idle_expires_at,
    s.absolute_expires_at,
    s.revoked_at,
    case
      when s.revoked_at is not null then 'revoked'
      when now() >= s.absolute_expires_at then 'absolute_expired'
      when now() >= s.idle_expires_at then 'idle_expired'
      else 'active'
    end
  from private.app_sessions s
  where s.user_id = v_user_id
  order by (s.session_id = v_session_id) desc, s.last_seen_at desc, s.id desc
  limit 20;
end;
$$;

revoke all on function public.app_update_current_session_device(text, text, text) from public, anon;
revoke all on function public.app_list_my_sessions() from public, anon;
grant execute on function public.app_update_current_session_device(text, text, text) to authenticated;
grant execute on function public.app_list_my_sessions() to authenticated;

comment on function public.app_update_current_session_device(text, text, text) is
  'Stores only a safe display label, browser name and operating-system name for the caller current session.';
comment on function public.app_list_my_sessions() is
  'Lists only the caller sessions with safe display metadata. Raw session IDs and authentication tokens are not returned.';
