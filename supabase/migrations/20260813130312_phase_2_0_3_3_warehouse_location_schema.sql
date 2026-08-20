-- Phase 2.0.3.3: Branch-owned Warehouse/Location topology.
-- Production apply is intentionally outside this phase's approval boundary.

alter table public.branches
  add constraint branches_organization_id_id_unique
  unique (organization_id, id);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  code text not null,
  name text not null,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouses_branch_tenant_fk foreign key (organization_id, branch_id)
    references public.branches (organization_id, id) on delete restrict,
  constraint warehouses_organization_branch_id_unique
    unique (organization_id, branch_id, id),
  constraint warehouses_organization_code_unique unique (organization_id, code),
  constraint warehouses_code_check check (
    code = upper(btrim(code)) and char_length(code) between 1 and 40
  ),
  constraint warehouses_name_check check (
    name = btrim(name) and char_length(name) between 1 and 160
  ),
  constraint warehouses_status_check check (status in ('active', 'inactive', 'archived'))
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  warehouse_id uuid not null,
  code text not null,
  name text not null,
  is_default boolean not null default false,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_branch_tenant_fk foreign key (organization_id, branch_id)
    references public.branches (organization_id, id) on delete restrict,
  constraint locations_warehouse_tenant_fk
    foreign key (organization_id, branch_id, warehouse_id)
    references public.warehouses (organization_id, branch_id, id) on delete restrict,
  constraint locations_warehouse_code_unique unique (warehouse_id, code),
  constraint locations_code_check check (
    code = upper(btrim(code)) and char_length(code) between 1 and 40
  ),
  constraint locations_name_check check (
    name = btrim(name) and char_length(name) between 1 and 160
  ),
  constraint locations_status_check check (status in ('active', 'inactive', 'archived')),
  constraint locations_default_must_be_active_check check (
    not is_default or status = 'active'
  )
);

create unique index locations_one_default_per_warehouse_unique
  on public.locations (warehouse_id)
  where is_default;

create index warehouses_organization_branch_status_updated_idx
  on public.warehouses (organization_id, branch_id, status, updated_at desc, id);

create index warehouses_created_by_idx on public.warehouses (created_by);
create index warehouses_updated_by_idx on public.warehouses (updated_by);

create index locations_tenant_warehouse_status_updated_idx
  on public.locations (
    organization_id, branch_id, warehouse_id, status, updated_at desc, id
  );

create index locations_created_by_idx on public.locations (created_by);
create index locations_updated_by_idx on public.locations (updated_by);

create or replace function private.prepare_warehouse_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.code := upper(btrim(new.code));
  new.name := btrim(new.name);

  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, new.created_at);
  else
    if new.id is distinct from old.id then
      raise exception 'warehouse_id_is_immutable' using errcode = '22023';
    end if;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'warehouse_organization_is_immutable' using errcode = '22023';
    end if;
    if new.branch_id is distinct from old.branch_id then
      raise exception 'warehouse_branch_is_immutable' using errcode = '22023';
    end if;
    if old.status = 'archived' then
      raise exception 'archived_warehouse_is_immutable' using errcode = '22023';
    end if;

    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create or replace function private.prepare_location_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.code := upper(btrim(new.code));
  new.name := btrim(new.name);

  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, new.created_at);
  else
    if new.id is distinct from old.id then
      raise exception 'location_id_is_immutable' using errcode = '22023';
    end if;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'location_organization_is_immutable' using errcode = '22023';
    end if;
    if new.branch_id is distinct from old.branch_id then
      raise exception 'location_branch_is_immutable' using errcode = '22023';
    end if;
    if new.warehouse_id is distinct from old.warehouse_id then
      raise exception 'location_warehouse_is_immutable' using errcode = '22023';
    end if;
    if old.status = 'archived' then
      raise exception 'archived_location_is_immutable' using errcode = '22023';
    end if;

    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create or replace function private.create_default_warehouse_location()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.locations (
    organization_id,
    branch_id,
    warehouse_id,
    code,
    name,
    is_default,
    status,
    created_by,
    updated_by
  ) values (
    new.organization_id,
    new.branch_id,
    new.id,
    'DEFAULT',
    'Default',
    true,
    'active',
    new.created_by,
    new.updated_by
  );

  return new;
end;
$$;

create or replace function private.enforce_warehouse_default_location()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_warehouse_id uuid;
  v_warehouse_status text;
  v_default_count integer;
begin
  if tg_table_name = 'warehouses' then
    v_warehouse_id := new.id;
  else
    v_warehouse_id := coalesce(new.warehouse_id, old.warehouse_id);
  end if;

  select w.status
  into v_warehouse_status
  from public.warehouses w
  where w.id = v_warehouse_id;

  if not found or v_warehouse_status = 'archived' then
    return null;
  end if;

  select count(*)
  into v_default_count
  from public.locations l
  where l.warehouse_id = v_warehouse_id
    and l.is_default
    and l.status = 'active';

  if v_default_count <> 1 then
    raise exception 'warehouse_requires_exactly_one_active_default_location'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create or replace function private.prevent_warehouse_location_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '%_hard_delete_forbidden', tg_table_name using errcode = '22023';
end;
$$;

revoke all on function private.prepare_warehouse_write() from public, anon, authenticated;
revoke all on function private.prepare_location_write() from public, anon, authenticated;
revoke all on function private.create_default_warehouse_location() from public, anon, authenticated;
revoke all on function private.enforce_warehouse_default_location() from public, anon, authenticated;
revoke all on function private.prevent_warehouse_location_delete() from public, anon, authenticated;

create trigger prepare_warehouse_write
before insert or update on public.warehouses
for each row execute function private.prepare_warehouse_write();

create trigger prepare_location_write
before insert or update on public.locations
for each row execute function private.prepare_location_write();

create trigger create_default_warehouse_location
after insert on public.warehouses
for each row execute function private.create_default_warehouse_location();

create constraint trigger enforce_warehouse_default_from_warehouse
after insert or update on public.warehouses
deferrable initially deferred
for each row execute function private.enforce_warehouse_default_location();

create constraint trigger enforce_warehouse_default_from_location
after insert or update or delete on public.locations
deferrable initially deferred
for each row execute function private.enforce_warehouse_default_location();

create trigger prevent_warehouse_delete
before delete on public.warehouses
for each row execute function private.prevent_warehouse_location_delete();

create trigger prevent_location_delete
before delete on public.locations
for each row execute function private.prevent_warehouse_location_delete();

alter table public.warehouses enable row level security;
alter table public.locations enable row level security;

-- Phase 2.0.3.5 will add reviewed policies and grants. Until then these
-- exposed-schema tables remain closed to Data API roles.
revoke all privileges on table public.warehouses, public.locations
  from public, anon, authenticated;

comment on table public.warehouses is
  'Phase 2.0 branch-owned warehouses; every non-archived row has one active default location.';
comment on table public.locations is
  'Phase 2.0 smallest stock-addressable locations within a warehouse.';
comment on column public.locations.is_default is
  'Exactly one active default location is required for every non-archived warehouse.';
