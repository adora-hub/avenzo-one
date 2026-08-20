-- AVENZO ONE Phase T4.3B: granular Product authorities and individual
-- permission Allow/Deny overrides. Forward-only local draft; never edit
-- historical migrations and never apply Remote without a separate PM gate.

begin;

do $preflight$
declare
  v_relation text;
begin
  foreach v_relation in array array[
    'public.permissions', 'public.organizations', 'public.branches',
    'public.organization_members', 'public.member_branches',
    'public.organization_roles', 'public.role_permissions', 'public.member_roles',
    'public.foundation_commands', 'public.product_domain_commands',
    'public.product_image_commands', 'public.sales_code_allocator_commands',
    'private.organization_audit_logs'
  ] loop
    if to_regclass(v_relation) is null then
      raise exception 't4_3b_missing_baseline_relation:%', v_relation;
    end if;
  end loop;

  if to_regprocedure('private.has_org_permission(uuid,text,uuid)') is null
     or to_regprocedure(
       'private.server_actor_has_org_permission(uuid,uuid,text,uuid)'
     ) is null
     or to_regprocedure(
       'private.append_organization_audit_log(uuid,text,text,uuid,text,uuid,text,text,jsonb,text,uuid,text,timestamp with time zone)'
     ) is null then
    raise exception 't4_3b_missing_permission_or_audit_helper';
  end if;

  if to_regclass('private.member_permission_overrides') is not null
     or to_regclass('private.member_permission_override_events') is not null then
    raise exception 't4_3b_override_schema_already_exists';
  end if;

  if to_regclass('public.inventory_receive_batches') is not null
     or to_regclass('public.inventory_receive_batch_items') is not null then
    raise exception 't4_3b_batch_surface_detected_preflight';
  end if;
end
$preflight$;

alter table public.permissions
  add column if not exists scope_kind text;

insert into public.permissions (code, resource, action, description, scope_kind)
values
  ('product.create', 'product', 'create', 'Create Product roots and approved creation envelopes', 'organization'),
  ('product.update', 'product', 'update', 'Update Product and SKU metadata and maintenance surfaces', 'organization'),
  ('product.archive', 'product', 'archive', 'Archive Product and SKU lifecycle objects', 'organization'),
  ('permission_override.manage', 'permission_override', 'manage', 'Manage individual permission overrides through the trusted server boundary', 'organization')
on conflict (code) do update set
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  scope_kind = excluded.scope_kind;

update public.permissions
set scope_kind = case
  when code in (
    'audit.read', 'billing.manage', 'billing.read', 'branch.create',
    'member.invite', 'member.read', 'member.update',
    'organization.read', 'organization.update',
    'product.cost.read', 'product.manage', 'product.read',
    'product.create', 'product.update', 'product.archive',
    'role.manage', 'role.read', 'sku.read', 'permission_override.manage'
  ) then 'organization'
  when code in (
    'branch.read', 'branch.update',
    'inventory_audit.read', 'inventory_batch.read',
    'inventory_movement.read', 'inventory.adjust', 'inventory.read',
    'inventory.receive', 'inventory.transfer', 'location.read',
    'warehouse.manage', 'warehouse.read'
  ) then 'branch'
  else scope_kind
end;

do $permission_scope_contract$
begin
  if exists (select 1 from public.permissions where scope_kind is null) then
    raise exception 't4_3b_unclassified_permission_code';
  end if;
  if exists (
    select 1 from public.permissions
    where scope_kind not in ('organization', 'branch')
  ) then
    raise exception 't4_3b_invalid_permission_scope_kind';
  end if;
  if (select count(*) from public.permissions where code in (
    'audit.read', 'billing.manage', 'billing.read',
    'branch.create', 'branch.read', 'branch.update',
    'inventory_audit.read', 'inventory_batch.read',
    'inventory_movement.read', 'inventory.adjust', 'inventory.read',
    'inventory.receive', 'inventory.transfer', 'location.read',
    'member.invite', 'member.read', 'member.update',
    'organization.read', 'organization.update',
    'product.cost.read', 'product.manage', 'product.read',
    'role.manage', 'role.read', 'sku.read',
    'warehouse.manage', 'warehouse.read',
    'product.create', 'product.update', 'product.archive',
    'permission_override.manage'
  )) <> 31 then
    raise exception 't4_3b_permission_catalog_incomplete';
  end if;
end
$permission_scope_contract$;

alter table public.permissions alter column scope_kind set not null;

do $permission_scope_constraint$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.permissions'::regclass
      and conname = 'permissions_scope_kind_check'
  ) then
    alter table public.permissions
      add constraint permissions_scope_kind_check
      check (scope_kind in ('organization', 'branch'));
  end if;
end
$permission_scope_constraint$;

comment on column public.permissions.scope_kind is
  'Approved T4.3 authority: organization or branch. Unknown values fail closed.';

-- One-time compatibility cutover only. product.manage is not a runtime alias.
insert into public.role_permissions (role_id, permission_code)
select legacy.role_id, granular.permission_code
from public.role_permissions legacy
cross join (values
  ('product.create'), ('product.update'), ('product.archive')
) granular(permission_code)
where legacy.permission_code = 'product.manage'
on conflict (role_id, permission_code) do nothing;

-- Owner-only v1 authority. Admin and every non-Owner role remain denied.
insert into public.role_permissions (role_id, permission_code)
select r.id, 'permission_override.manage'
from public.organization_roles r
where r.code = 'owner'
on conflict (role_id, permission_code) do nothing;

create or replace function private.seed_foundation_domain_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.code in ('owner', 'admin') then
    insert into public.role_permissions (role_id, permission_code)
    select new.id, p.code
    from public.permissions p
    where p.code in (
      'product.read', 'product.manage',
      'product.create', 'product.update', 'product.archive',
      'sku.read', 'warehouse.read', 'warehouse.manage', 'location.read',
      'inventory.read', 'inventory.receive', 'inventory.adjust',
      'inventory.transfer', 'inventory_movement.read', 'inventory_audit.read'
    )
    on conflict (role_id, permission_code) do nothing;
  end if;

  if new.code = 'owner' then
    insert into public.role_permissions (role_id, permission_code)
    values (new.id, 'permission_override.manage')
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.seed_foundation_domain_role_permissions()
  from public, anon, authenticated, service_role;

create or replace function private.enforce_owner_only_permission_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
  v_permission_code text;
  v_role_code text;
  v_permission_resource text;
begin
  if tg_op = 'DELETE' then
    v_role_id := old.role_id;
    v_permission_code := old.permission_code;
  else
    v_role_id := new.role_id;
    v_permission_code := new.permission_code;
  end if;

  select p.resource into v_permission_resource
  from public.permissions p where p.code = v_permission_code;

  if v_permission_code <> 'permission_override.manage'
     and v_permission_resource is distinct from 'inventory_batch' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select r.code into v_role_code
  from public.organization_roles r where r.id = v_role_id;
  if v_role_code is distinct from 'owner' then
    raise exception 'owner_only_permission_assignment_required'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'owner_only_permission_assignment_required'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_owner_only_permission_assignment()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_owner_only_permission_assignment
  on public.role_permissions;
create trigger enforce_owner_only_permission_assignment
before insert or update or delete on public.role_permissions
for each row execute function private.enforce_owner_only_permission_assignment();

do $membership_tenant_key$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.organization_members'::regclass
      and conname = 'organization_members_organization_id_id_unique'
  ) then
    alter table public.organization_members
      add constraint organization_members_organization_id_id_unique
      unique (organization_id, id);
  end if;
end
$membership_tenant_key$;

create table private.member_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  membership_id uuid not null,
  permission_code text not null references public.permissions(code) on delete restrict,
  branch_id uuid,
  effect text not null,
  effective_from timestamptz not null,
  expires_at timestamptz,
  reason text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default statement_timestamp(),
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  revision bigint not null default 1,
  last_command_id uuid not null,
  constraint member_permission_overrides_tenant_id_unique
    unique (organization_id, id),
  constraint member_permission_overrides_logical_unique
    unique nulls not distinct (
      organization_id, membership_id, permission_code, branch_id
    ),
  constraint member_permission_overrides_membership_fk
    foreign key (organization_id, membership_id)
    references public.organization_members (organization_id, id)
    on delete restrict,
  constraint member_permission_overrides_branch_fk
    foreign key (organization_id, branch_id)
    references public.branches (organization_id, id)
    on delete restrict,
  constraint member_permission_overrides_effect_check
    check (effect in ('allow', 'deny')),
  constraint member_permission_overrides_reason_check
    check (length(btrim(reason)) between 1 and 1000),
  constraint member_permission_overrides_window_check
    check (expires_at is null or expires_at > effective_from),
  constraint member_permission_overrides_revision_check
    check (revision > 0),
  constraint member_permission_overrides_revocation_check
    check ((revoked_at is null) = (revoked_by is null)),
  constraint member_permission_overrides_time_check
    check (updated_at >= created_at)
);

create table private.member_permission_override_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  override_id uuid not null,
  membership_id uuid not null,
  permission_code text not null references public.permissions(code) on delete restrict,
  branch_id uuid,
  event_type text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  occurred_at timestamptz not null default statement_timestamp(),
  before_data jsonb,
  after_data jsonb,
  command_id uuid not null unique,
  request_hash text not null,
  result_data jsonb not null,
  retention_until timestamptz not null
    default (statement_timestamp() + interval '5 years'),
  legal_hold boolean not null default false,
  legal_hold_reference text,
  created_at timestamptz not null default statement_timestamp(),
  constraint member_permission_override_events_override_fk
    foreign key (organization_id, override_id)
    references private.member_permission_overrides (organization_id, id)
    on delete restrict,
  constraint member_permission_override_events_membership_fk
    foreign key (organization_id, membership_id)
    references public.organization_members (organization_id, id)
    on delete restrict,
  constraint member_permission_override_events_branch_fk
    foreign key (organization_id, branch_id)
    references public.branches (organization_id, id)
    on delete restrict,
  constraint member_permission_override_events_type_check
    check (event_type in ('created', 'changed', 'revoked')),
  constraint member_permission_override_events_reason_check
    check (length(btrim(reason)) between 1 and 1000),
  constraint member_permission_override_events_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint member_permission_override_events_before_check
    check (before_data is null or jsonb_typeof(before_data) = 'object'),
  constraint member_permission_override_events_after_check
    check (jsonb_typeof(after_data) = 'object'),
  constraint member_permission_override_events_result_check
    check (jsonb_typeof(result_data) = 'object'),
  constraint member_permission_override_events_retention_check
    check (retention_until >= occurred_at + interval '5 years'),
  constraint member_permission_override_events_legal_hold_check
    check (
      (not legal_hold and legal_hold_reference is null)
      or (legal_hold and length(btrim(legal_hold_reference)) > 0)
    )
);

create index member_permission_overrides_effective_lookup_idx
  on private.member_permission_overrides (
    organization_id, membership_id, permission_code, branch_id,
    effective_from, expires_at
  ) where revoked_at is null;
create index member_permission_overrides_branch_lookup_idx
  on private.member_permission_overrides (
    organization_id, branch_id, membership_id, permission_code
  ) where revoked_at is null and branch_id is not null;
create index member_permission_overrides_permission_fk_idx
  on private.member_permission_overrides (permission_code);
create index member_permission_overrides_created_by_idx
  on private.member_permission_overrides (created_by);
create index member_permission_overrides_updated_by_idx
  on private.member_permission_overrides (updated_by);
create index member_permission_overrides_revoked_by_idx
  on private.member_permission_overrides (revoked_by)
  where revoked_by is not null;
create index member_permission_override_events_org_time_idx
  on private.member_permission_override_events (
    organization_id, occurred_at desc, id desc
  );
create index member_permission_override_events_override_idx
  on private.member_permission_override_events (organization_id, override_id);
create index member_permission_override_events_membership_idx
  on private.member_permission_override_events (
    organization_id, membership_id, occurred_at desc
  );
create index member_permission_override_events_permission_fk_idx
  on private.member_permission_override_events (permission_code);
create index member_permission_override_events_actor_idx
  on private.member_permission_override_events (actor_user_id);
create index member_permission_override_events_branch_idx
  on private.member_permission_override_events (organization_id, branch_id)
  where branch_id is not null;

alter table private.member_permission_overrides enable row level security;
alter table private.member_permission_overrides force row level security;
alter table private.member_permission_override_events enable row level security;
alter table private.member_permission_override_events force row level security;

revoke all on table private.member_permission_overrides
  from public, anon, authenticated, service_role;
revoke all on table private.member_permission_override_events
  from public, anon, authenticated, service_role;

comment on table private.member_permission_overrides is
  'T4.3 current individual permission state. Browser has no direct access.';
comment on table private.member_permission_override_events is
  'Immutable T4.3 authorization evidence retained at least five years; active Legal Hold blocks disposal.';

create or replace function private.effective_org_permission_for_actor(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_permission_code text,
  p_branch_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membership_id uuid;
  v_membership_scope text;
  v_scope_kind text;
  v_branch_eligible boolean := false;
  v_baseline boolean := false;
  v_allow boolean := false;
  v_deny boolean := false;
  v_now timestamptz := statement_timestamp();
begin
  if p_actor_user_id is null or p_organization_id is null
     or nullif(btrim(p_permission_code), '') is null
     or p_permission_code = 'product.manage' then
    return false;
  end if;

  select om.id, om.scope
  into v_membership_id, v_membership_scope
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  where om.organization_id = p_organization_id
    and om.user_id = p_actor_user_id
    and om.membership_status = 'active'
    and o.status = 'active';

  if not found then return false; end if;

  select p.scope_kind into v_scope_kind
  from public.permissions p
  where p.code = p_permission_code;

  if v_scope_kind is null then return false; end if;
  if v_scope_kind = 'organization' and p_branch_id is not null then
    return false;
  end if;
  if v_scope_kind = 'branch' and p_branch_id is null then
    return false;
  end if;

  if v_scope_kind = 'organization' then
    v_branch_eligible := true;
  else
    select exists (
      select 1
      from public.branches b
      where b.organization_id = p_organization_id
        and b.id = p_branch_id
        and b.status = 'active'
        and (
          v_membership_scope = 'organization'
          or exists (
            select 1 from public.member_branches mb
            where mb.membership_id = v_membership_id
              and mb.branch_id = b.id
          )
        )
    ) into v_branch_eligible;
  end if;

  if not v_branch_eligible then return false; end if;

  select exists (
    select 1
    from public.member_roles mr
    join public.organization_roles r
      on r.id = mr.role_id
     and r.organization_id = p_organization_id
    join public.role_permissions rp on rp.role_id = r.id
    where mr.membership_id = v_membership_id
      and rp.permission_code = p_permission_code
  ) into v_baseline;

  select
    coalesce(bool_or(o.effect = 'allow'), false),
    coalesce(bool_or(o.effect = 'deny'), false)
  into v_allow, v_deny
  from private.member_permission_overrides o
  where o.organization_id = p_organization_id
    and o.membership_id = v_membership_id
    and o.permission_code = p_permission_code
    and o.revoked_at is null
    and o.effective_from <= v_now
    and (o.expires_at is null or o.expires_at > v_now)
    and (
      (v_scope_kind = 'organization' and o.branch_id is null)
      or (
        v_scope_kind = 'branch'
        and (o.branch_id is null or o.branch_id = p_branch_id)
      )
    );

  return not v_deny and (v_baseline or v_allow);
end;
$$;

revoke all on function private.effective_org_permission_for_actor(
  uuid, uuid, text, uuid
) from public, anon, authenticated, service_role;

create or replace function private.has_org_permission(
  p_organization_id uuid,
  p_permission_code text,
  p_branch_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.effective_org_permission_for_actor(
    (select auth.uid()), p_organization_id, p_permission_code, p_branch_id
  );
$$;

revoke all on function private.has_org_permission(uuid, text, uuid)
  from public, anon, service_role;
grant execute on function private.has_org_permission(uuid, text, uuid)
  to authenticated;

-- Historical Product command functions still call product.manage. This
-- compatibility precheck accepts any granular Product authority; exact command
-- authority is enforced by the command-table triggers below.
create or replace function private.server_actor_has_org_permission(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_permission_code text,
  p_branch_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_permission_code = 'product.manage' then
      private.effective_org_permission_for_actor(
        p_actor_user_id, p_organization_id, 'product.create', null
      )
      or private.effective_org_permission_for_actor(
        p_actor_user_id, p_organization_id, 'product.update', null
      )
      or private.effective_org_permission_for_actor(
        p_actor_user_id, p_organization_id, 'product.archive', null
      )
    else private.effective_org_permission_for_actor(
      p_actor_user_id, p_organization_id, p_permission_code, p_branch_id
    )
  end;
$$;

revoke all on function private.server_actor_has_org_permission(
  uuid, uuid, text, uuid
) from public, anon, authenticated, service_role;

create or replace function private.current_user_org_permissions(
  p_organization_id uuid
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_permissions text[];
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select coalesce(array_agg(p.code order by p.code), array[]::text[])
  into v_permissions
  from public.permissions p
  where p.code <> 'product.manage'
    and (
      (
        p.scope_kind = 'organization'
        and private.effective_org_permission_for_actor(
          v_user_id, p_organization_id, p.code, null
        )
      )
      or (
        p.scope_kind = 'branch'
        and exists (
          select 1 from public.branches b
          where b.organization_id = p_organization_id
            and b.status = 'active'
            and private.effective_org_permission_for_actor(
              v_user_id, p_organization_id, p.code, b.id
            )
        )
      )
    );
  return v_permissions;
end;
$$;

revoke all on function private.current_user_org_permissions(uuid)
  from public, anon, service_role;
grant execute on function private.current_user_org_permissions(uuid)
  to authenticated;

create or replace function private.current_user_organization_access(
  p_organization_id uuid default null
)
returns table (
  organization_id uuid,
  membership_status text,
  scope text,
  roles jsonb,
  branches jsonb,
  permissions jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    om.organization_id,
    om.membership_status,
    om.scope,
    coalesce(role_data.roles, '[]'::jsonb),
    coalesce(branch_data.branches, '[]'::jsonb),
    coalesce(permission_data.permissions, '[]'::jsonb)
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'code', roles.code, 'name', roles.name,
        'description', roles.description
      ) order by roles.code
    ) as roles
    from (
      select distinct r.code, r.name, r.description
      from public.member_roles mr
      join public.organization_roles r
        on r.id = mr.role_id and r.organization_id = om.organization_id
      where mr.membership_id = om.id
    ) roles
  ) role_data on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object('id', branches.id, 'code', branches.code, 'name', branches.name)
      order by branches.code
    ) as branches
    from (
      select distinct b.id, b.code, b.name
      from public.member_branches mb
      join public.branches b
        on b.id = mb.branch_id and b.organization_id = om.organization_id
      where mb.membership_id = om.id and b.status = 'active'
    ) branches
  ) branch_data on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object('code', p.code, 'description', p.description)
      order by p.code
    ) as permissions
    from unnest(private.current_user_org_permissions(om.organization_id))
      as effective(permission_code)
    join public.permissions p on p.code = effective.permission_code
  ) permission_data on true
  where om.user_id = (select auth.uid())
    and om.membership_status = 'active'
    and o.status = 'active'
    and (p_organization_id is null or om.organization_id = p_organization_id)
  order by om.organization_id;
$$;

revoke all on function private.current_user_organization_access(uuid)
  from public, anon, service_role;
grant execute on function private.current_user_organization_access(uuid)
  to authenticated;

create or replace function private.required_product_command_permission(
  p_command_type text
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_command_type in (
      'product.create', 'product.create_with_initial_sku',
      'product.create_with_variants'
    ) then 'product.create'
    when p_command_type in (
      'product.update', 'product.activate',
      'sku.create', 'sku.update', 'sku.activate',
      'product.variant_images.assign'
    ) then 'product.update'
    when p_command_type in ('product.archive', 'sku.archive')
      then 'product.archive'
    else null
  end;
$$;

revoke all on function private.required_product_command_permission(text)
  from public, anon, authenticated, service_role;

create or replace function private.enforce_granular_product_command_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permission_code text;
begin
  if tg_table_schema <> 'public' then
    raise exception 'product_command_guard_schema_invalid' using errcode = '42501';
  end if;

  if tg_table_name = 'foundation_commands' then
    v_permission_code := private.required_product_command_permission(new.command_type);
  elsif tg_table_name in (
    'product_domain_commands', 'product_image_commands',
    'sales_code_allocator_commands'
  ) then
    v_permission_code := 'product.update';
  else
    raise exception 'product_command_guard_table_invalid' using errcode = '42501';
  end if;

  if v_permission_code is not null
     and not private.effective_org_permission_for_actor(
       new.actor_user_id, new.organization_id, v_permission_code, null
     ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_granular_product_command_permission()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_granular_product_command_permission
  on public.foundation_commands;
create trigger enforce_granular_product_command_permission
before insert on public.foundation_commands
for each row execute function private.enforce_granular_product_command_permission();

drop trigger if exists enforce_granular_product_domain_command_permission
  on public.product_domain_commands;
create trigger enforce_granular_product_domain_command_permission
before insert on public.product_domain_commands
for each row execute function private.enforce_granular_product_command_permission();

drop trigger if exists enforce_granular_product_image_command_permission
  on public.product_image_commands;
create trigger enforce_granular_product_image_command_permission
before insert on public.product_image_commands
for each row execute function private.enforce_granular_product_command_permission();

drop trigger if exists enforce_granular_sales_code_command_permission
  on public.sales_code_allocator_commands;
create trigger enforce_granular_sales_code_command_permission
before insert on public.sales_code_allocator_commands
for each row execute function private.enforce_granular_product_command_permission();

-- Browser Storage upload remains RLS-controlled but now uses the granular
-- Product maintenance authority.
drop policy if exists "product managers can upload prepared product images"
  on storage.objects;
create policy "product managers can upload prepared product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.product_images i
    where i.storage_bucket = bucket_id
      and i.storage_path = name
      and i.created_by = (select auth.uid())
      and i.status = 'uploading'
      and (select private.has_org_permission(
        i.organization_id, 'product.update', null
      ))
  )
);

create or replace function public.server_preview_sales_code_sequence(
  p_organization_id uuid,
  p_sequence_id uuid,
  p_actor_user_id uuid,
  p_count integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sequence public.sales_code_sequences%rowtype;
  v_codes jsonb;
begin
  if p_organization_id is null or p_sequence_id is null
     or p_actor_user_id is null or p_count not between 1 and 20 then
    raise exception 'sales_code_preview_input_invalid' using errcode = '22023';
  end if;
  if not private.server_actor_has_org_permission(
    p_actor_user_id, p_organization_id, 'product.update', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select s.* into strict v_sequence
  from public.sales_code_sequences s
  where s.organization_id = p_organization_id and s.id = p_sequence_id;

  select jsonb_agg(private.format_sales_code(
    v_sequence.prefix, v_sequence.next_number + n, v_sequence.digit_count
  ) order by n) into v_codes
  from generate_series(0, p_count - 1) n;

  return jsonb_build_object(
    'sequence_id', v_sequence.id,
    'codes', v_codes,
    'preview_only', true,
    'next_number', v_sequence.next_number
  );
exception when no_data_found then
  raise exception 'sales_code_sequence_not_found' using errcode = 'P0002';
end;
$$;

revoke all on function public.server_preview_sales_code_sequence(
  uuid, uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function public.server_preview_sales_code_sequence(
  uuid, uuid, uuid, integer
) to service_role;

create or replace function private.guard_member_permission_override_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_command_id uuid := nullif(
    current_setting('avenzo.permission_override_command_id', true), ''
  )::uuid;
  v_organization_id uuid := nullif(
    current_setting('avenzo.permission_override_organization_id', true), ''
  )::uuid;
begin
  if tg_op = 'DELETE' then
    raise exception 'member_permission_override_delete_forbidden'
      using errcode = '42501';
  end if;
  if v_command_id is null
     or new.last_command_id is distinct from v_command_id
     or new.organization_id is distinct from v_organization_id then
    raise exception 'member_permission_override_direct_write_forbidden'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.membership_id is distinct from old.membership_id
       or new.permission_code is distinct from old.permission_code
       or new.branch_id is distinct from old.branch_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.revision <> old.revision + 1 then
      raise exception 'member_permission_override_identity_or_revision_invalid'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.guard_member_permission_override_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_command_id uuid := nullif(
    current_setting('avenzo.permission_override_command_id', true), ''
  )::uuid;
  v_organization_id uuid := nullif(
    current_setting('avenzo.permission_override_organization_id', true), ''
  )::uuid;
begin
  if tg_op <> 'INSERT' then
    raise exception 'member_permission_override_event_is_immutable'
      using errcode = '42501';
  end if;
  if new.command_id is distinct from v_command_id
     or new.organization_id is distinct from v_organization_id then
    raise exception 'member_permission_override_event_direct_write_forbidden'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_member_permission_override_write()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_member_permission_override_event()
  from public, anon, authenticated, service_role;

create trigger guard_member_permission_override_write
before insert or update or delete on private.member_permission_overrides
for each row execute function private.guard_member_permission_override_write();
create trigger guard_member_permission_override_event
before insert or update or delete on private.member_permission_override_events
for each row execute function private.guard_member_permission_override_event();

create or replace function public.server_set_member_permission_override(
  p_command_id uuid,
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_membership_id uuid,
  p_permission_code text,
  p_branch_id uuid,
  p_effect text,
  p_effective_from timestamptz,
  p_expires_at timestamptz,
  p_reason text,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.organization_members%rowtype;
  v_override private.member_permission_overrides%rowtype;
  v_existing_event private.member_permission_override_events%rowtype;
  v_scope_kind text;
  v_permission_resource text;
  v_request_hash text;
  v_effective_from timestamptz;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_event_type text;
  v_now timestamptz := statement_timestamp();
begin
  if p_command_id is null or p_actor_user_id is null
     or p_organization_id is null or p_membership_id is null
     or nullif(btrim(p_permission_code), '') is null
     or p_effect not in ('allow', 'deny', 'revoke')
     or nullif(btrim(p_reason), '') is null
     or length(btrim(p_reason)) > 1000
     or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'permission_override_input_invalid' using errcode = '22023';
  end if;
  if p_effect = 'revoke'
     and (p_effective_from is not null or p_expires_at is not null) then
    raise exception 'permission_override_revoke_input_invalid' using errcode = '22023';
  end if;

  v_request_hash := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'actor_user_id', p_actor_user_id,
      'organization_id', p_organization_id,
      'membership_id', p_membership_id,
      'permission_code', p_permission_code,
      'branch_id', p_branch_id,
      'effect', p_effect,
      'effective_from', p_effective_from,
      'expires_at', p_expires_at,
      'reason', btrim(p_reason),
      'expected_revision', p_expected_revision
    )::text, 'UTF8'
  ), 'sha256'), 'hex');

  select e.* into v_existing_event
  from private.member_permission_override_events e
  where e.command_id = p_command_id;
  if found then
    if v_existing_event.organization_id is distinct from p_organization_id
       or v_existing_event.actor_user_id is distinct from p_actor_user_id
       or v_existing_event.request_hash is distinct from v_request_hash then
      raise exception 'permission_override_command_conflict' using errcode = '23505';
    end if;
    return v_existing_event.result_data;
  end if;

  perform 1 from public.organizations o
  where o.id = p_organization_id and o.status = 'active'
  for update;
  if not found then
    raise exception 'member_not_found_or_not_accessible' using errcode = 'P0002';
  end if;

  -- Recheck after the Organization lock so concurrent retries observe the
  -- first committed event and return the same result instead of conflicting.
  select e.* into v_existing_event
  from private.member_permission_override_events e
  where e.command_id = p_command_id;
  if found then
    if v_existing_event.organization_id is distinct from p_organization_id
       or v_existing_event.actor_user_id is distinct from p_actor_user_id
       or v_existing_event.request_hash is distinct from v_request_hash then
      raise exception 'permission_override_command_conflict' using errcode = '23505';
    end if;
    return v_existing_event.result_data;
  end if;

  select om.* into v_target
  from public.organization_members om
  where om.organization_id = p_organization_id
    and om.id = p_membership_id
    and om.membership_status = 'active'
  for update;
  if not found then
    raise exception 'member_not_found_or_not_accessible' using errcode = 'P0002';
  end if;

  if v_target.user_id = p_actor_user_id then
    raise exception 'self_permission_override_forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_members actor_member
    join public.member_roles mr on mr.membership_id = actor_member.id
    join public.organization_roles r
      on r.id = mr.role_id and r.organization_id = actor_member.organization_id
    where actor_member.organization_id = p_organization_id
      and actor_member.user_id = p_actor_user_id
      and actor_member.membership_status = 'active'
      and r.code = 'owner'
  ) or not private.effective_org_permission_for_actor(
    p_actor_user_id, p_organization_id, 'permission_override.manage', null
  ) then
    raise exception 'permission_override_forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.member_roles mr
    join public.organization_roles r
      on r.id = mr.role_id and r.organization_id = p_organization_id
    where mr.membership_id = p_membership_id and r.code = 'owner'
  ) then
    raise exception 'owner_permission_override_forbidden' using errcode = '42501';
  end if;

  select p.scope_kind, p.resource into v_scope_kind, v_permission_resource
  from public.permissions p where p.code = p_permission_code;
  if not found then
    raise exception 'permission_not_supported' using errcode = '22023';
  end if;
  if p_permission_code in (
    'product.manage', 'permission_override.manage',
    'role.manage', 'member.update'
  ) or v_permission_resource = 'inventory_batch' then
    raise exception 'permission_override_protected' using errcode = '42501';
  end if;
  if v_scope_kind = 'organization' and p_branch_id is not null then
    raise exception 'permission_scope_invalid' using errcode = '22023';
  end if;

  if p_branch_id is not null then
    if not exists (
      select 1 from public.branches b
      where b.organization_id = p_organization_id
        and b.id = p_branch_id and b.status = 'active'
        and (
          v_target.scope = 'organization'
          or exists (
            select 1 from public.member_branches mb
            where mb.membership_id = v_target.id and mb.branch_id = b.id
          )
        )
    ) then
      raise exception 'branch_not_found_or_not_accessible' using errcode = 'P0002';
    end if;
  end if;

  v_effective_from := coalesce(p_effective_from, v_now);
  if p_effect <> 'revoke'
     and p_expires_at is not null
     and p_expires_at <= v_effective_from then
    raise exception 'permission_override_window_invalid' using errcode = '22023';
  end if;

  select o.* into v_override
  from private.member_permission_overrides o
  where o.organization_id = p_organization_id
    and o.membership_id = p_membership_id
    and o.permission_code = p_permission_code
    and o.branch_id is not distinct from p_branch_id
  for update;

  if not found then
    if p_effect = 'revoke' then
      raise exception 'permission_override_not_found' using errcode = 'P0002';
    end if;
    if p_expected_revision <> 0 then
      raise exception 'permission_override_conflict' using errcode = '40001';
    end if;
    perform set_config('avenzo.permission_override_command_id', p_command_id::text, true);
    perform set_config('avenzo.permission_override_organization_id', p_organization_id::text, true);
    insert into private.member_permission_overrides (
      organization_id, membership_id, permission_code, branch_id,
      effect, effective_from, expires_at, reason,
      created_by, updated_by, last_command_id
    ) values (
      p_organization_id, p_membership_id, p_permission_code, p_branch_id,
      p_effect, v_effective_from, p_expires_at, btrim(p_reason),
      p_actor_user_id, p_actor_user_id, p_command_id
    ) returning * into v_override;
    v_before := null;
    v_event_type := 'created';
  else
    if p_expected_revision <> v_override.revision then
      raise exception 'permission_override_conflict' using errcode = '40001';
    end if;
    v_before := jsonb_build_object(
      'effect', v_override.effect,
      'effective_from', v_override.effective_from,
      'expires_at', v_override.expires_at,
      'reason', v_override.reason,
      'revoked_at', v_override.revoked_at,
      'revision', v_override.revision
    );
    perform set_config('avenzo.permission_override_command_id', p_command_id::text, true);
    perform set_config('avenzo.permission_override_organization_id', p_organization_id::text, true);
    if p_effect = 'revoke' then
      update private.member_permission_overrides o set
        reason = btrim(p_reason), updated_by = p_actor_user_id,
        updated_at = v_now, revoked_by = p_actor_user_id,
        revoked_at = v_now, revision = o.revision + 1,
        last_command_id = p_command_id
      where o.id = v_override.id
      returning * into v_override;
      v_event_type := 'revoked';
    else
      update private.member_permission_overrides o set
        effect = p_effect, effective_from = v_effective_from,
        expires_at = p_expires_at, reason = btrim(p_reason),
        updated_by = p_actor_user_id, updated_at = v_now,
        revoked_by = null, revoked_at = null,
        revision = o.revision + 1, last_command_id = p_command_id
      where o.id = v_override.id
      returning * into v_override;
      v_event_type := 'changed';
    end if;
  end if;

  v_after := jsonb_build_object(
    'effect', v_override.effect,
    'effective_from', v_override.effective_from,
    'expires_at', v_override.expires_at,
    'reason', v_override.reason,
    'revoked_at', v_override.revoked_at,
    'revision', v_override.revision
  );
  v_result := jsonb_build_object(
    'override_id', v_override.id,
    'organization_id', v_override.organization_id,
    'membership_id', v_override.membership_id,
    'permission_code', v_override.permission_code,
    'branch_id', v_override.branch_id,
    'effect', v_override.effect,
    'revision', v_override.revision,
    'revoked', v_override.revoked_at is not null
  );

  insert into private.member_permission_override_events (
    organization_id, override_id, membership_id, permission_code,
    branch_id, event_type, actor_user_id, reason,
    before_data, after_data, command_id, request_hash, result_data
  ) values (
    p_organization_id, v_override.id, p_membership_id, p_permission_code,
    p_branch_id, v_event_type, p_actor_user_id, btrim(p_reason),
    v_before, v_after, p_command_id, v_request_hash, v_result
  );

  perform private.append_organization_audit_log(
    p_organization_id,
    'security',
    'permission_override.' || v_event_type,
    p_actor_user_id,
    'membership',
    p_membership_id,
    null,
    'Individual permission override ' || v_event_type,
    jsonb_build_object(
      'permission_code', p_permission_code,
      'branch_id', p_branch_id,
      'reason', btrim(p_reason),
      'before', v_before,
      'after', v_after
    ),
    'member_permission_override_event',
    p_command_id,
    v_event_type,
    v_now
  );
  return v_result;
end;
$$;

revoke all on function public.server_set_member_permission_override(
  uuid, uuid, uuid, uuid, text, uuid, text,
  timestamptz, timestamptz, text, bigint
) from public, anon, authenticated;
grant execute on function public.server_set_member_permission_override(
  uuid, uuid, uuid, uuid, text, uuid, text,
  timestamptz, timestamptz, text, bigint
) to service_role;

do $postflight$
declare
  v_trigger record;
begin
  if exists (
    select 1 from public.role_permissions legacy
    where legacy.permission_code = 'product.manage'
      and exists (
        select required.code
        from (values
          ('product.create'), ('product.update'), ('product.archive')
        ) required(code)
        where not exists (
          select 1 from public.role_permissions granular
          where granular.role_id = legacy.role_id
            and granular.permission_code = required.code
        )
      )
  ) then
    raise exception 't4_3b_product_compatibility_backfill_failed';
  end if;

  if exists (
    select 1 from public.organization_roles r
    where r.code = 'owner'
      and not exists (
        select 1 from public.role_permissions rp
        where rp.role_id = r.id
          and rp.permission_code = 'permission_override.manage'
      )
  ) or exists (
    select 1 from public.organization_roles r
    join public.role_permissions rp on rp.role_id = r.id
    where r.code <> 'owner'
      and rp.permission_code = 'permission_override.manage'
  ) then
    raise exception 't4_3b_owner_only_override_authority_failed';
  end if;

  if exists (
    select 1 from public.organization_roles r
    join public.role_permissions rp on rp.role_id = r.id
    where r.code <> 'owner'
      and rp.permission_code = 'inventory_batch.read'
  ) then
    raise exception 't4_3b_admin_or_non_owner_batch_authority_detected';
  end if;

  if not (
    select c.relrowsecurity and c.relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'private.member_permission_overrides'::regclass
  ) or not (
    select c.relrowsecurity and c.relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'private.member_permission_override_events'::regclass
  ) then
    raise exception 't4_3b_private_rls_not_forced';
  end if;

  if has_table_privilege('anon', 'private.member_permission_overrides', 'select')
     or has_table_privilege('authenticated', 'private.member_permission_overrides', 'select')
     or has_table_privilege('service_role', 'private.member_permission_overrides', 'insert')
     or has_table_privilege('anon', 'private.member_permission_override_events', 'select')
     or has_table_privilege('authenticated', 'private.member_permission_override_events', 'select')
     or has_table_privilege('service_role', 'private.member_permission_override_events', 'insert') then
    raise exception 't4_3b_private_grant_boundary_failed';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.server_set_member_permission_override(uuid,uuid,uuid,uuid,text,uuid,text,timestamp with time zone,timestamp with time zone,text,bigint)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.server_set_member_permission_override(uuid,uuid,uuid,uuid,text,uuid,text,timestamp with time zone,timestamp with time zone,text,bigint)',
    'execute'
  ) then
    raise exception 't4_3b_server_function_grant_failed';
  end if;

  for v_trigger in
    select * from (values
      ('foundation_commands', 'enforce_granular_product_command_permission'),
      ('product_domain_commands', 'enforce_granular_product_domain_command_permission'),
      ('product_image_commands', 'enforce_granular_product_image_command_permission'),
      ('sales_code_allocator_commands', 'enforce_granular_sales_code_command_permission'),
      ('role_permissions', 'enforce_owner_only_permission_assignment')
    ) expected(table_name, trigger_name)
  loop
    if not exists (
      select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = format('public.%I', v_trigger.table_name)::regclass
        and t.tgname = v_trigger.trigger_name and not t.tgisinternal
    ) then
      raise exception 't4_3b_product_command_guard_missing:%.%',
        v_trigger.table_name, v_trigger.trigger_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'storage' and p.tablename = 'objects'
      and p.policyname = 'product managers can upload prepared product images'
      and position('product.update' in coalesce(p.with_check, '')) > 0
  ) then
    raise exception 't4_3b_product_image_policy_cutover_failed';
  end if;

  if to_regclass('public.inventory_receive_batches') is not null
     or to_regclass('public.inventory_receive_batch_items') is not null
     or exists (
       select 1 from pg_catalog.pg_policies p
       where position('inventory_batch.read' in coalesce(p.qual, '')) > 0
          or position('inventory_batch.read' in coalesce(p.with_check, '')) > 0
     )
     or exists (
       select 1 from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private')
         and position('inventory_batch.read' in coalesce(p.prosrc, '')) > 0
     ) then
    raise exception 't4_3b_no_batch_gate_failed';
  end if;
end
$postflight$;

commit;
