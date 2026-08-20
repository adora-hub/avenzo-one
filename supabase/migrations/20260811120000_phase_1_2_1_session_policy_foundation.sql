-- AVENZO ONE Phase 1.2.1: Session Policy Foundation.
-- This phase records policy snapshots and current-session activity only.
-- Server-side expiration enforcement begins in Phase 1.2.2.

create table if not exists private.app_session_policies (
  policy_tier text primary key,
  idle_timeout_seconds integer not null,
  absolute_timeout_seconds integer not null,
  warning_seconds integer not null default 300,
  version bigint not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_session_policy_tier_check
    check (policy_tier in ('privileged', 'organization')),
  constraint app_session_policy_idle_check
    check (idle_timeout_seconds between 300 and 2592000),
  constraint app_session_policy_absolute_check
    check (absolute_timeout_seconds between idle_timeout_seconds and 31536000),
  constraint app_session_policy_warning_check
    check (warning_seconds between 60 and idle_timeout_seconds - 1),
  constraint app_session_policy_version_check check (version > 0)
);

insert into private.app_session_policies (
  policy_tier, idle_timeout_seconds, absolute_timeout_seconds, warning_seconds
) values
  ('privileged', 1800, 28800, 300),
  ('organization', 28800, 604800, 300)
on conflict (policy_tier) do nothing;

create table if not exists private.app_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_tier text not null references private.app_session_policies(policy_tier) on delete restrict,
  policy_version bigint not null,
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_session_id_check check (length(session_id) between 1 and 255),
  constraint app_session_policy_version_check check (policy_version > 0),
  constraint app_session_idle_order_check check (idle_expires_at > last_seen_at),
  constraint app_session_absolute_order_check check (absolute_expires_at > started_at),
  constraint app_session_revoke_reason_check check (
    (revoked_at is null and revoke_reason is null)
    or (revoked_at is not null and length(btrim(coalesce(revoke_reason, ''))) between 3 and 2000)
  )
);

create index if not exists app_sessions_user_activity_idx
  on private.app_sessions (user_id, last_seen_at desc);
create index if not exists app_sessions_expiry_idx
  on private.app_sessions (idle_expires_at, absolute_expires_at)
  where revoked_at is null;

create table if not exists private.app_session_security_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references private.app_sessions(session_id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  policy_tier text not null,
  policy_version bigint not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint app_session_security_event_action_check
    check (length(btrim(action)) between 3 and 80),
  constraint app_session_security_event_policy_tier_check
    check (policy_tier in ('privileged', 'organization')),
  constraint app_session_security_event_policy_version_check check (policy_version > 0),
  constraint app_session_security_event_metadata_check
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists app_session_security_events_user_created_idx
  on private.app_session_security_events (user_id, created_at desc, id desc);
create index if not exists app_session_security_events_session_created_idx
  on private.app_session_security_events (session_id, created_at desc, id desc);

alter table private.app_session_policies enable row level security;
alter table private.app_sessions enable row level security;
alter table private.app_session_security_events enable row level security;

revoke all on table private.app_session_policies from public, anon, authenticated;
revoke all on table private.app_sessions from public, anon, authenticated;
revoke all on table private.app_session_security_events from public, anon, authenticated;

create or replace function private.current_app_session_policy_tier()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.platform_admins pa
      where pa.user_id = auth.uid()
        and pa.status = 'active'
    ) then 'privileged'
    else 'organization'
  end;
$$;

create or replace function public.current_app_session_policy()
returns table (
  policy_tier text,
  idle_timeout_seconds integer,
  absolute_timeout_seconds integer,
  warning_seconds integer,
  version bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tier text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  v_tier := private.current_app_session_policy_tier();

  return query
  select p.policy_tier, p.idle_timeout_seconds, p.absolute_timeout_seconds,
    p.warning_seconds, p.version
  from private.app_session_policies p
  where p.policy_tier = v_tier
    and p.is_active = true;

  if not found then
    raise exception 'active_session_policy_not_found';
  end if;
end;
$$;

create or replace function public.app_register_current_session()
returns table (
  policy_tier text,
  policy_version bigint,
  started_at timestamptz,
  last_seen_at timestamptz,
  idle_expires_at timestamptz,
  absolute_expires_at timestamptz,
  revoked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := nullif(btrim(coalesce(auth.jwt() ->> 'session_id', '')), '');
  v_iat text := nullif(btrim(coalesce(auth.jwt() ->> 'iat', '')), '');
  v_started_at timestamptz;
  v_policy private.app_session_policies;
  v_existing private.app_sessions;
  v_result private.app_sessions;
  v_action text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_session_id is null or length(v_session_id) > 255 then
    raise exception 'session_id_required' using errcode = '22023';
  end if;

  v_started_at := case
    when v_iat ~ '^[0-9]+$' then to_timestamp(v_iat::double precision)
    else now()
  end;

  select p.* into v_policy
  from private.app_session_policies p
  where p.policy_tier = private.current_app_session_policy_tier()
    and p.is_active = true;
  if not found then raise exception 'active_session_policy_not_found'; end if;

  select s.* into v_existing
  from private.app_sessions s
  where s.session_id = v_session_id
  for update;

  if v_existing.id is not null and v_existing.user_id <> v_user_id then
    raise exception 'session_owner_mismatch' using errcode = '42501';
  end if;

  v_action := case
    when v_existing.id is null then 'session_registered'
    when v_existing.policy_tier <> v_policy.policy_tier
      or v_existing.policy_version <> v_policy.version then 'session_policy_reassigned'
    else null
  end;

  insert into private.app_sessions (
    session_id, user_id, policy_tier, policy_version, started_at, last_seen_at,
    idle_expires_at, absolute_expires_at
  ) values (
    v_session_id, v_user_id, v_policy.policy_tier, v_policy.version, v_started_at, now(),
    now() + make_interval(secs => v_policy.idle_timeout_seconds),
    v_started_at + make_interval(secs => v_policy.absolute_timeout_seconds)
  )
  on conflict (session_id) do update
  set policy_tier = excluded.policy_tier,
      policy_version = excluded.policy_version,
      last_seen_at = now(),
      idle_expires_at = now() + make_interval(secs => v_policy.idle_timeout_seconds),
      absolute_expires_at = private.app_sessions.started_at
        + make_interval(secs => v_policy.absolute_timeout_seconds),
      updated_at = now()
  returning * into v_result;

  if v_action is not null then
    insert into private.app_session_security_events (
      session_id, user_id, action, policy_tier, policy_version, metadata
    ) values (
      v_result.session_id, v_result.user_id, v_action,
      v_result.policy_tier, v_result.policy_version,
      jsonb_build_object(
        'idle_expires_at', v_result.idle_expires_at,
        'absolute_expires_at', v_result.absolute_expires_at,
        'enforcement_enabled', false
      )
    );
  end if;

  return query
  select v_result.policy_tier, v_result.policy_version, v_result.started_at,
    v_result.last_seen_at, v_result.idle_expires_at, v_result.absolute_expires_at,
    v_result.revoked_at is not null;
end;
$$;

create or replace function public.app_current_session_status()
returns table (
  registered boolean,
  policy_tier text,
  policy_version bigint,
  started_at timestamptz,
  last_seen_at timestamptz,
  idle_expires_at timestamptz,
  absolute_expires_at timestamptz,
  idle_expired boolean,
  absolute_expired boolean,
  revoked boolean
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
  if v_session_id is null then
    raise exception 'session_id_required' using errcode = '22023';
  end if;

  return query
  select true, s.policy_tier, s.policy_version, s.started_at, s.last_seen_at,
    s.idle_expires_at, s.absolute_expires_at,
    now() >= s.idle_expires_at, now() >= s.absolute_expires_at,
    s.revoked_at is not null
  from private.app_sessions s
  where s.session_id = v_session_id
    and s.user_id = v_user_id;

  if not found then
    return query
    select false, p.policy_tier, p.version, null::timestamptz, null::timestamptz,
      null::timestamptz, null::timestamptz, false, false, false
    from private.app_session_policies p
    where p.policy_tier = private.current_app_session_policy_tier()
      and p.is_active = true;
  end if;
end;
$$;

revoke all on function private.current_app_session_policy_tier() from public, anon, authenticated;
revoke all on function public.current_app_session_policy() from public, anon;
revoke all on function public.app_register_current_session() from public, anon;
revoke all on function public.app_current_session_status() from public, anon;

grant execute on function public.current_app_session_policy() to authenticated;
grant execute on function public.app_register_current_session() to authenticated;
grant execute on function public.app_current_session_status() to authenticated;

comment on table private.app_session_policies is
  'Server-owned idle and absolute session lifetime policies. Phase 1.2.1 stores policy only.';
comment on table private.app_sessions is
  'Per-Supabase-session policy snapshots and activity timestamps. Enforcement starts in Phase 1.2.2.';
comment on table private.app_session_security_events is
  'Append-only security evidence for application session lifecycle changes.';
comment on function public.app_register_current_session() is
  'Registers or refreshes only the caller current session and records policy assignment without enforcing expiration.';
