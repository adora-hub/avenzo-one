-- AVENZO ONE Phase 0.8.1: Member Directory Data
-- Adds organization-specific member profile fields, an immutable audit trail,
-- and a permission-checked directory RPC that can safely include Auth email.

alter table public.organization_members
  add column if not exists display_name text not null default '',
  add column if not exists job_title text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_members_display_name_check'
      and conrelid = 'public.organization_members'::regclass
  ) then
    alter table public.organization_members
      add constraint organization_members_display_name_check
      check (
        display_name = btrim(display_name)
        and char_length(display_name) <= 120
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_members_job_title_check'
      and conrelid = 'public.organization_members'::regclass
  ) then
    alter table public.organization_members
      add constraint organization_members_job_title_check
      check (
        job_title = btrim(job_title)
        and char_length(job_title) <= 160
      );
  end if;
end
$$;

create index if not exists organization_members_directory_idx
  on public.organization_members (organization_id, created_at, id);

comment on column public.organization_members.display_name is
  'Organization-specific display name or nickname for the member.';

comment on column public.organization_members.job_title is
  'Organization-specific business job title; this is separate from an authorization role.';

create table if not exists public.membership_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  membership_id uuid not null references public.organization_members(id) on delete restrict,
  event_type text not null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  reason text not null default '',
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint membership_events_event_type_check check (
    event_type in (
      'created',
      'profile_updated',
      'role_changed',
      'scope_changed',
      'suspended',
      'reactivated',
      'removed'
    )
  ),
  constraint membership_events_reason_check check (
    reason = btrim(reason)
    and char_length(reason) <= 1000
  )
);

create index if not exists membership_events_organization_created_idx
  on public.membership_events (organization_id, created_at desc, id desc);

create index if not exists membership_events_membership_created_idx
  on public.membership_events (membership_id, created_at desc, id desc);

create index if not exists membership_events_performed_by_idx
  on public.membership_events (performed_by)
  where performed_by is not null;

comment on table public.membership_events is
  'Append-only audit history for member profile, role, scope, and lifecycle changes.';

alter table public.membership_events enable row level security;

revoke all on public.membership_events from public;
revoke all on public.membership_events from anon;
revoke all on public.membership_events from authenticated;
grant select on public.membership_events to authenticated;

drop policy if exists "authorized users can view membership events" on public.membership_events;
create policy "authorized users can view membership events"
on public.membership_events for select to authenticated
using (
  private.is_platform_admin()
  or private.has_org_permission(organization_id, 'member.read')
);

-- Remove table-level capabilities that the application never needs. RLS does
-- not protect TRUNCATE, so it must never be granted to the authenticated role.
revoke truncate, references, trigger
  on public.organization_members
  from authenticated;

revoke truncate, references, trigger, update
  on public.member_roles
  from authenticated;

revoke truncate, references, trigger, update
  on public.member_branches
  from authenticated;

create or replace function private.organization_member_directory(
  p_organization_id uuid
)
returns table (
  membership_id uuid,
  user_id uuid,
  display_name text,
  email text,
  job_title text,
  membership_status text,
  scope text,
  roles jsonb,
  branches jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not (
    private.is_platform_admin()
    or private.has_org_permission(p_organization_id, 'member.read')
  ) then
    raise exception 'member_read_permission_required' using errcode = '42501';
  end if;

  return query
  select
    om.id as membership_id,
    om.user_id,
    om.display_name,
    coalesce(au.email, '')::text as email,
    om.job_title,
    om.membership_status,
    om.scope,
    coalesce(role_data.roles, '[]'::jsonb) as roles,
    coalesce(branch_data.branches, '[]'::jsonb) as branches,
    om.created_at,
    om.updated_at
  from public.organization_members om
  join auth.users au
    on au.id = om.user_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'code', role_rows.code,
        'name', role_rows.name,
        'description', role_rows.description
      )
      order by role_rows.code
    ) as roles
    from (
      select distinct r.code, r.name, r.description
      from public.member_roles mr
      join public.organization_roles r
        on r.id = mr.role_id
       and r.organization_id = om.organization_id
      where mr.membership_id = om.id
    ) role_rows
  ) role_data on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', branch_rows.id,
        'code', branch_rows.code,
        'name', branch_rows.name
      )
      order by branch_rows.code
    ) as branches
    from (
      select distinct b.id, b.code, b.name
      from public.member_branches mb
      join public.branches b
        on b.id = mb.branch_id
       and b.organization_id = om.organization_id
      where mb.membership_id = om.id
    ) branch_rows
  ) branch_data on true
  where om.organization_id = p_organization_id
  order by om.created_at, om.id;
end;
$$;

revoke all on function private.organization_member_directory(uuid) from public;
revoke all on function private.organization_member_directory(uuid) from anon;
grant execute on function private.organization_member_directory(uuid) to authenticated;

create or replace function public.organization_member_directory(
  p_organization_id uuid
)
returns table (
  membership_id uuid,
  user_id uuid,
  display_name text,
  email text,
  job_title text,
  membership_status text,
  scope text,
  roles jsonb,
  branches jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select *
  from private.organization_member_directory(p_organization_id);
$$;

revoke all on function public.organization_member_directory(uuid) from public;
revoke all on function public.organization_member_directory(uuid) from anon;
grant execute on function public.organization_member_directory(uuid) to authenticated;

comment on function public.organization_member_directory(uuid) is
  'Returns a permission-checked organization member directory including registered email, roles, and branch scope.';

