create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  timezone text not null default 'Asia/Bangkok',
  currency text not null default 'THB' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null check (char_length(trim(code)) between 1 and 40),
  name text not null check (char_length(trim(name)) between 1 and 160),
  address jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_status text not null default 'active'
    check (membership_status in ('invited', 'active', 'suspended', 'removed')),
  scope text not null default 'organization'
    check (scope in ('organization', 'branch')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.member_branches (
  membership_id uuid not null references public.organization_members(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (membership_id, branch_id)
);

create index branches_organization_id_idx on public.branches (organization_id);
create index organization_members_user_id_idx on public.organization_members (user_id);
create index organization_members_organization_id_idx on public.organization_members (organization_id);
create index member_branches_branch_id_idx on public.member_branches (branch_id);

grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.branches to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.member_branches to authenticated;

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.organization_members enable row level security;
alter table public.member_branches enable row level security;

create policy "members can view their organizations"
on public.organizations
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = organizations.id
      and om.user_id = (select auth.uid())
      and om.membership_status = 'active'
  )
);

create policy "authenticated users can create organizations"
on public.organizations
for insert
to authenticated
with check (created_by = (select auth.uid()));

create policy "organization creators can update organizations"
on public.organizations
for update
to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

create policy "organization creators can deactivate organizations"
on public.organizations
for delete
to authenticated
using (created_by = (select auth.uid()));

create policy "users can view their own memberships"
on public.organization_members
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "organization creators can create memberships"
on public.organization_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.organizations o
    where o.id = organization_members.organization_id
      and o.created_by = (select auth.uid())
  )
);

create policy "users can update their own memberships"
on public.organization_members
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "users can view branches in their scope"
on public.branches
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = branches.organization_id
      and om.user_id = (select auth.uid())
      and om.membership_status = 'active'
      and (
        om.scope = 'organization'
        or exists (
          select 1
          from public.member_branches mb
          where mb.membership_id = om.id
            and mb.branch_id = branches.id
        )
      )
  )
);

create policy "organization members can create branches"
on public.branches
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.organization_members om
    where om.organization_id = branches.organization_id
      and om.user_id = (select auth.uid())
      and om.membership_status = 'active'
  )
);

create policy "branch creators can update branches"
on public.branches
for update
to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

create policy "branch creators can deactivate branches"
on public.branches
for delete
to authenticated
using (created_by = (select auth.uid()));

create policy "users can view their branch assignments"
on public.member_branches
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.id = member_branches.membership_id
      and om.user_id = (select auth.uid())
      and om.membership_status = 'active'
  )
);

create policy "users can create their branch assignments"
on public.member_branches
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organization_members om
    where om.id = member_branches.membership_id
      and om.user_id = (select auth.uid())
      and om.membership_status = 'active'
  )
);

comment on table public.organizations is 'Tenant boundary for AVENZO ONE.';
comment on table public.branches is 'Operational branch within an organization.';
comment on table public.organization_members is 'User membership and organization/branch scope.';
comment on table public.member_branches is 'Branch assignments for branch-scoped memberships.';
