-- AVENZO ONE Phase 0.2: Role and Permission Core
-- Authorization data stays in Postgres and is enforced with RLS.

create table if not exists public.permissions (
  code text primary key,
  resource text not null,
  action text not null,
  description text not null,
  created_at timestamptz not null default now(),
  constraint permissions_code_format check (position('.' in code) > 1)
);

create table if not exists public.organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text not null default '',
  is_system boolean not null default true,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_roles_code_format check (code ~ '^[a-z][a-z0-9_]*$'),
  constraint organization_roles_organization_code_unique unique (organization_id, code)
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.organization_roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_code)
);

create table if not exists public.member_roles (
  membership_id uuid not null references public.organization_members(id) on delete cascade,
  role_id uuid not null references public.organization_roles(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (membership_id, role_id)
);

create unique index if not exists organization_members_organization_user_unique
  on public.organization_members (organization_id, user_id);

create index if not exists organization_roles_organization_id_idx
  on public.organization_roles (organization_id);

create index if not exists role_permissions_permission_code_idx
  on public.role_permissions (permission_code);

create index if not exists member_roles_role_id_idx
  on public.member_roles (role_id);

insert into public.permissions (code, resource, action, description)
values
  ('organization.read', 'organization', 'read', 'View organization settings and identity'),
  ('organization.update', 'organization', 'update', 'Update organization settings'),
  ('branch.read', 'branch', 'read', 'View branches in the permitted scope'),
  ('branch.create', 'branch', 'create', 'Create a branch'),
  ('branch.update', 'branch', 'update', 'Update a branch'),
  ('member.read', 'member', 'read', 'View organization members'),
  ('member.invite', 'member', 'invite', 'Invite a member'),
  ('member.update', 'member', 'update', 'Update membership status and scope'),
  ('role.read', 'role', 'read', 'View roles and permission assignments'),
  ('role.manage', 'role', 'manage', 'Create and manage roles and permissions')
on conflict (code) do update set
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description;

create or replace function public.has_org_permission(
  p_organization_id uuid,
  p_permission_code text,
  p_branch_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.organization_members om
    join public.member_roles mr on mr.membership_id = om.id
    join public.organization_roles r on r.id = mr.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.organizations o on o.id = om.organization_id
    where om.organization_id = p_organization_id
      and om.user_id = (select auth.uid())
      and om.membership_status = 'active'
      and rp.permission_code = p_permission_code
      and o.status = 'active'
      and (
        p_branch_id is null
        or (
          rtrim(om.scope) = 'organization'
          or exists (
            select 1
            from public.member_branches mb
            join public.branches b on b.id = mb.branch_id
            where mb.membership_id = om.id
              and mb.branch_id = p_branch_id
              and b.organization_id = p_organization_id
              and b.status = 'active'
          )
        )
      )
  );
$$;

revoke all on function public.has_org_permission(uuid, text, uuid) from public;
grant execute on function public.has_org_permission(uuid, text, uuid) to authenticated;

create or replace function public.seed_organization_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  owner_role_id uuid;
begin
  insert into public.organization_roles
    (organization_id, code, name, description, is_system, created_by)
  values
    (new.id, 'owner', 'Owner', 'Full access to the organization', true, new.created_by),
    (new.id, 'admin', 'Admin', 'Administrative access to organization settings and members', true, new.created_by),
    (new.id, 'manager', 'Manager', 'Operational access for assigned branches', true, new.created_by),
    (new.id, 'staff', 'Staff', 'Day-to-day operational access', true, new.created_by),
    (new.id, 'viewer', 'Viewer', 'Read-only access', true, new.created_by);

  insert into public.organization_members
    (organization_id, user_id, membership_status, scope)
  values
    (new.id, new.created_by, 'active', 'organization')
  on conflict (organization_id, user_id) do nothing;

  select id into owner_role_id
  from public.organization_roles
  where organization_id = new.id and code = 'owner';

  insert into public.member_roles (membership_id, role_id, assigned_by)
  select om.id, owner_role_id, new.created_by
  from public.organization_members om
  where om.organization_id = new.id and om.user_id = new.created_by
  on conflict (membership_id, role_id) do nothing;

  insert into public.role_permissions (role_id, permission_code)
  select r.id, p.code
  from public.organization_roles r
  cross join public.permissions p
  where r.organization_id = new.id and r.code = 'owner'
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_code)
  select r.id, p.code
  from public.organization_roles r
  cross join public.permissions p
  where r.organization_id = new.id and r.code = 'admin'
    and p.code in (
      'organization.read', 'organization.update',
      'branch.read', 'branch.create', 'branch.update',
      'member.read', 'member.invite', 'member.update',
      'role.read', 'role.manage'
    )
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_code)
  select r.id, p.code
  from public.organization_roles r
  cross join public.permissions p
  where r.organization_id = new.id and r.code = 'manager'
    and p.code in ('organization.read', 'branch.read', 'branch.create', 'branch.update', 'member.read', 'role.read')
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_code)
  select r.id, p.code
  from public.organization_roles r
  cross join public.permissions p
  where r.organization_id = new.id and r.code = 'staff'
    and p.code in ('organization.read', 'branch.read', 'role.read')
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_code)
  select r.id, p.code
  from public.organization_roles r
  cross join public.permissions p
  where r.organization_id = new.id and r.code = 'viewer'
    and p.code in ('organization.read', 'branch.read', 'role.read')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists seed_organization_access_after_insert on public.organizations;
create trigger seed_organization_access_after_insert
after insert on public.organizations
for each row execute function public.seed_organization_access();

alter table public.permissions enable row level security;
alter table public.organization_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.member_roles enable row level security;

revoke all on public.permissions, public.organization_roles, public.role_permissions, public.member_roles from anon;
grant select on public.permissions to authenticated;
grant select, insert, update on public.organization_roles to authenticated;
grant select, insert, delete on public.role_permissions to authenticated;
grant select, insert, delete on public.member_roles to authenticated;

create policy "authenticated users can view permission catalog"
on public.permissions for select to authenticated
using (true);

create policy "members can view organization roles"
on public.organization_roles for select to authenticated
using (public.has_org_permission(organization_id, 'role.read'));

create policy "admins can create organization roles"
on public.organization_roles for insert to authenticated
with check (public.has_org_permission(organization_id, 'role.manage'));

create policy "admins can update organization roles"
on public.organization_roles for update to authenticated
using (public.has_org_permission(organization_id, 'role.manage'))
with check (public.has_org_permission(organization_id, 'role.manage'));

create policy "members can view role permissions"
on public.role_permissions for select to authenticated
using (exists (
  select 1 from public.organization_roles r
  where r.id = role_permissions.role_id
    and public.has_org_permission(r.organization_id, 'role.read')
));

create policy "admins can manage role permissions"
on public.role_permissions for insert to authenticated
with check (exists (
  select 1 from public.organization_roles r
  where r.id = role_permissions.role_id
    and public.has_org_permission(r.organization_id, 'role.manage')
));

create policy "admins can remove role permissions"
on public.role_permissions for delete to authenticated
using (exists (
  select 1 from public.organization_roles r
  where r.id = role_permissions.role_id
    and public.has_org_permission(r.organization_id, 'role.manage')
));

create policy "members can view member roles"
on public.member_roles for select to authenticated
using (exists (
  select 1
  from public.organization_members om
  join public.organization_roles r on r.organization_id = om.organization_id
  where om.id = member_roles.membership_id
    and r.id = member_roles.role_id
    and public.has_org_permission(om.organization_id, 'member.read')
));

create policy "admins can assign member roles"
on public.member_roles for insert to authenticated
with check (exists (
  select 1
  from public.organization_members om
  join public.organization_roles r on r.organization_id = om.organization_id
  where om.id = member_roles.membership_id
    and r.id = member_roles.role_id
    and public.has_org_permission(om.organization_id, 'role.manage')
));

create policy "admins can remove member roles"
on public.member_roles for delete to authenticated
using (exists (
  select 1
  from public.organization_members om
  join public.organization_roles r on r.organization_id = om.organization_id
  where om.id = member_roles.membership_id
    and r.id = member_roles.role_id
    and public.has_org_permission(om.organization_id, 'role.manage')
));

-- Replace Phase 0.1 creator-only writes with explicit permissions.
drop policy if exists "organization creators can update organizations" on public.organizations;
create policy "authorized members can update organizations"
on public.organizations for update to authenticated
using (public.has_org_permission(id, 'organization.update'))
with check (public.has_org_permission(id, 'organization.update'));

drop policy if exists "organization members can create branches" on public.branches;
create policy "authorized members can create branches"
on public.branches for insert to authenticated
with check (public.has_org_permission(organization_id, 'branch.create'));

drop policy if exists "branch creators can update branches" on public.branches;
create policy "authorized members can update branches"
on public.branches for update to authenticated
using (public.has_org_permission(organization_id, 'branch.update', id))
with check (public.has_org_permission(organization_id, 'branch.update', id));

drop policy if exists "organization creators can create memberships" on public.organization_members;
create policy "authorized members can create memberships"
on public.organization_members for insert to authenticated
with check (public.has_org_permission(organization_id, 'member.invite'));

drop policy if exists "users can update their own memberships" on public.organization_members;
create policy "authorized members can update memberships"
on public.organization_members for update to authenticated
using (public.has_org_permission(organization_id, 'member.update'))
with check (public.has_org_permission(organization_id, 'member.update'));

drop policy if exists "users can create their branch assignments" on public.member_branches;
create policy "authorized members can create branch assignments"
on public.member_branches for insert to authenticated
with check (exists (
  select 1
  from public.organization_members om
  join public.branches b on b.organization_id = om.organization_id
  where om.id = member_branches.membership_id
    and b.id = member_branches.branch_id
    and public.has_org_permission(om.organization_id, 'member.update')
));
