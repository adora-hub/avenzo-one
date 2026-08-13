-- Phase 2.0.4: durable server command boundary for Product/SKU and
-- Warehouse/Location application services. Production apply is not authorized.

alter table public.products add column version bigint not null default 1;
alter table public.skus add column version bigint not null default 1;
alter table public.warehouses add column version bigint not null default 1;
alter table public.locations add column version bigint not null default 1;

alter table public.products
  add constraint products_version_check check (version >= 1);
alter table public.skus
  add constraint skus_version_check check (version >= 1);
alter table public.warehouses
  add constraint warehouses_version_check check (version >= 1);
alter table public.locations
  add constraint locations_version_check check (version >= 1);

create or replace function private.increment_foundation_entity_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

revoke all on function private.increment_foundation_entity_version()
  from public, anon, authenticated, service_role;

create trigger zz_increment_product_version
before update on public.products
for each row execute function private.increment_foundation_entity_version();
create trigger zz_increment_sku_version
before update on public.skus
for each row execute function private.increment_foundation_entity_version();
create trigger zz_increment_warehouse_version
before update on public.warehouses
for each row execute function private.increment_foundation_entity_version();
create trigger zz_increment_location_version
before update on public.locations
for each row execute function private.increment_foundation_entity_version();

create table public.foundation_commands (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  command_type text not null,
  payload jsonb not null,
  request_hash text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'processing',
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint foundation_commands_organization_id_id_unique
    unique (organization_id, id),
  constraint foundation_commands_type_check check (command_type in (
    'product.create', 'product.update', 'product.activate', 'product.archive',
    'sku.create', 'sku.update', 'sku.activate', 'sku.archive',
    'warehouse.create', 'warehouse.update', 'warehouse.inactivate', 'warehouse.archive',
    'location.create', 'location.update', 'location.inactivate', 'location.archive'
  )),
  constraint foundation_commands_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint foundation_commands_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint foundation_commands_status_check
    check (status in ('processing', 'completed')),
  constraint foundation_commands_completion_check check (
    (status = 'processing' and result is null and completed_at is null)
    or (status = 'completed' and result is not null and completed_at is not null)
  )
);

create table public.foundation_domain_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid,
  event_name text not null,
  command_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint foundation_domain_events_command_unique
    unique (organization_id, command_id),
  constraint foundation_domain_events_branch_tenant_fk
    foreign key (organization_id, branch_id)
    references public.branches (organization_id, id) on delete restrict,
  constraint foundation_domain_events_command_tenant_fk
    foreign key (organization_id, command_id)
    references public.foundation_commands (organization_id, id) on delete restrict,
  constraint foundation_domain_events_name_check check (event_name in (
    'product.created', 'product.updated', 'product.activated', 'product.archived',
    'sku.created', 'sku.updated', 'sku.activated', 'sku.archived',
    'warehouse.created', 'warehouse.updated', 'warehouse.inactivated', 'warehouse.archived',
    'location.created', 'location.updated', 'location.inactivated', 'location.archived'
  )),
  constraint foundation_domain_events_entity_type_check check (
    entity_type in ('product', 'sku', 'warehouse', 'location')
  ),
  constraint foundation_domain_events_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index foundation_commands_org_created_idx
  on public.foundation_commands (organization_id, created_at desc, id desc);
create index foundation_commands_actor_idx
  on public.foundation_commands (actor_user_id);
create index foundation_domain_events_org_time_idx
  on public.foundation_domain_events (organization_id, occurred_at desc, id desc);
create index foundation_domain_events_branch_time_idx
  on public.foundation_domain_events (
    organization_id, branch_id, occurred_at desc, id desc
  ) where branch_id is not null;
create index foundation_domain_events_entity_idx
  on public.foundation_domain_events (organization_id, entity_type, entity_id);
create index foundation_domain_events_actor_idx
  on public.foundation_domain_events (actor_user_id);

create or replace function private.require_foundation_command_context(
  p_organization_id uuid,
  p_command_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(current_setting('avenzo.foundation_command_id', true), '')::uuid
       is distinct from p_command_id
     or nullif(current_setting('avenzo.foundation_organization_id', true), '')::uuid
       is distinct from p_organization_id then
    raise exception 'foundation_direct_write_forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.guard_foundation_command_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_foundation_command_context(old.organization_id, old.id);
  if old.status <> 'processing'
     or new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.command_type is distinct from old.command_type
     or new.payload is distinct from old.payload
     or new.request_hash is distinct from old.request_hash
     or new.actor_user_id is distinct from old.actor_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'foundation_command_is_immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.guard_foundation_event_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_foundation_command_context(new.organization_id, new.command_id);
  return new;
end;
$$;

create or replace function private.prevent_foundation_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '%_is_immutable', tg_table_name using errcode = '22023';
end;
$$;

revoke all on function private.require_foundation_command_context(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.guard_foundation_command_update()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_foundation_event_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.prevent_foundation_history_mutation()
  from public, anon, authenticated, service_role;

create trigger guard_foundation_command_update
before update on public.foundation_commands
for each row execute function private.guard_foundation_command_update();
create trigger prevent_foundation_command_delete
before delete on public.foundation_commands
for each row execute function private.prevent_foundation_history_mutation();
create trigger guard_foundation_event_insert
before insert on public.foundation_domain_events
for each row execute function private.guard_foundation_event_insert();
create trigger prevent_foundation_event_update_delete
before update or delete on public.foundation_domain_events
for each row execute function private.prevent_foundation_history_mutation();

alter table private.organization_audit_logs
  drop constraint organization_audit_logs_category_check;
alter table private.organization_audit_logs
  add constraint organization_audit_logs_category_check check (
    category in (
      'organization', 'branch', 'member', 'invitation', 'subscription',
      'moderation', 'security', 'product', 'warehouse', 'inventory'
    )
  );

create or replace function private.raise_foundation_entity_write_failure(
  p_table_name text,
  p_organization_id uuid,
  p_entity_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  if p_table_name = 'products' then
    select exists (
      select 1 from public.products p
      where p.organization_id = p_organization_id and p.id = p_entity_id
    ) into v_exists;
  elsif p_table_name = 'skus' then
    select exists (
      select 1 from public.skus s
      where s.organization_id = p_organization_id and s.id = p_entity_id
    ) into v_exists;
  elsif p_table_name = 'warehouses' then
    select exists (
      select 1 from public.warehouses w
      where w.organization_id = p_organization_id and w.id = p_entity_id
    ) into v_exists;
  elsif p_table_name = 'locations' then
    select exists (
      select 1 from public.locations l
      where l.organization_id = p_organization_id and l.id = p_entity_id
    ) into v_exists;
  else
    raise exception 'foundation_entity_type_invalid' using errcode = '22023';
  end if;

  if v_exists then
    raise exception 'version_conflict' using errcode = '40001';
  end if;
  raise exception 'entity_not_found' using errcode = 'P0002';
end;
$$;

revoke all on function private.raise_foundation_entity_write_failure(text, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.server_execute_foundation_command(
  p_command_id uuid,
  p_organization_id uuid,
  p_command_type text,
  p_payload jsonb,
  p_request_hash text,
  p_actor_user_id uuid,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command public.foundation_commands%rowtype;
  v_product public.products%rowtype;
  v_sku public.skus%rowtype;
  v_warehouse public.warehouses%rowtype;
  v_location public.locations%rowtype;
  v_entity_id uuid;
  v_expected_version bigint;
  v_branch_id uuid;
  v_event_name text;
  v_entity_type text;
  v_target_label text;
  v_result jsonb;
  v_permission_code text;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_command_id is null or p_organization_id is null or p_actor_user_id is null then
    raise exception 'foundation_command_identity_required' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'foundation_command_payload_invalid' using errcode = '22023';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'foundation_request_hash_invalid' using errcode = '22023';
  end if;
  if p_command_type not in (
    'product.create', 'product.update', 'product.activate', 'product.archive',
    'sku.create', 'sku.update', 'sku.activate', 'sku.archive',
    'warehouse.create', 'warehouse.update', 'warehouse.inactivate', 'warehouse.archive',
    'location.create', 'location.update', 'location.inactivate', 'location.archive'
  ) then
    raise exception 'foundation_command_type_invalid' using errcode = '22023';
  end if;

  insert into public.foundation_commands (
    id, organization_id, command_type, payload, request_hash, actor_user_id
  ) values (
    p_command_id, p_organization_id, p_command_type,
    p_payload, p_request_hash, p_actor_user_id
  ) on conflict (id) do nothing;

  select c.* into strict v_command
  from public.foundation_commands c
  where c.id = p_command_id
  for update;

  if v_command.organization_id <> p_organization_id
     or v_command.command_type <> p_command_type
     or v_command.payload <> p_payload
     or v_command.request_hash <> p_request_hash
     or v_command.actor_user_id <> p_actor_user_id then
    raise exception 'command_payload_conflict' using errcode = '23505';
  end if;
  if v_command.status = 'completed' then
    return v_command.result;
  end if;

  perform set_config('avenzo.foundation_command_id', p_command_id::text, true);
  perform set_config('avenzo.foundation_organization_id', p_organization_id::text, true);

  if p_command_type like 'product.%' or p_command_type like 'sku.%' then
    v_permission_code := 'product.manage';
    if not private.server_actor_has_org_permission(
      p_actor_user_id, p_organization_id, v_permission_code, null
    ) then
      raise exception 'permission_denied' using errcode = '42501';
    end if;
  end if;

  if p_command_type = 'product.create' then
    insert into public.products (
      organization_id, name, description, created_by, updated_by
    ) values (
      p_organization_id,
      p_payload ->> 'name',
      p_payload ->> 'description',
      p_actor_user_id,
      p_actor_user_id
    ) returning * into v_product;
    v_entity_id := v_product.id;
    v_entity_type := 'product';
    v_event_name := 'product.created';
    v_target_label := v_product.name;
    v_result := jsonb_build_object(
      'entity_id', v_product.id, 'entity_type', 'product',
      'status', v_product.status, 'version', v_product.version
    );
  elsif p_command_type in ('product.update', 'product.activate', 'product.archive') then
    v_entity_id := (p_payload ->> 'product_id')::uuid;
    v_expected_version := (p_payload ->> 'expected_version')::bigint;
    update public.products p set
      name = case when p_command_type = 'product.update'
        then coalesce(nullif(p_payload ->> 'name', ''), p.name) else p.name end,
      description = case when p_command_type = 'product.update' and p_payload ? 'description'
        then nullif(p_payload ->> 'description', '') else p.description end,
      status = case p_command_type
        when 'product.activate' then 'active'
        when 'product.archive' then 'archived'
        else p.status end,
      updated_by = p_actor_user_id
    where p.organization_id = p_organization_id
      and p.id = v_entity_id
      and p.version = v_expected_version
    returning * into v_product;
    if not found then
      perform private.raise_foundation_entity_write_failure(
        'products', p_organization_id, v_entity_id
      );
    end if;
    v_entity_type := 'product';
    v_event_name := case p_command_type
      when 'product.update' then 'product.updated'
      when 'product.activate' then 'product.activated'
      else 'product.archived' end;
    v_target_label := v_product.name;
    v_result := jsonb_build_object(
      'entity_id', v_product.id, 'entity_type', 'product',
      'status', v_product.status, 'version', v_product.version
    );
  elsif p_command_type = 'sku.create' then
    v_entity_id := (p_payload ->> 'product_id')::uuid;
    select p.* into strict v_product from public.products p
    where p.organization_id = p_organization_id and p.id = v_entity_id;
    if v_product.status = 'archived' then
      raise exception 'entity_inactive' using errcode = '23514';
    end if;
    insert into public.skus (
      organization_id, product_id, sku_code, name, barcode, sales_code,
      base_unit_code, status, created_by, updated_by
    ) values (
      p_organization_id, v_product.id, p_payload ->> 'sku_code',
      p_payload ->> 'name', nullif(p_payload ->> 'barcode', ''),
      nullif(p_payload ->> 'sales_code', ''), p_payload ->> 'base_unit_code',
      coalesce(nullif(p_payload ->> 'status', ''), 'draft'),
      p_actor_user_id, p_actor_user_id
    ) returning * into v_sku;
    v_entity_id := v_sku.id;
    v_entity_type := 'sku';
    v_event_name := 'sku.created';
    v_target_label := v_sku.sku_code || ' · ' || v_sku.name;
    v_result := jsonb_build_object(
      'entity_id', v_sku.id, 'entity_type', 'sku',
      'product_id', v_sku.product_id, 'status', v_sku.status,
      'version', v_sku.version
    );
  elsif p_command_type in ('sku.update', 'sku.activate', 'sku.archive') then
    v_entity_id := (p_payload ->> 'sku_id')::uuid;
    v_expected_version := (p_payload ->> 'expected_version')::bigint;
    update public.skus s set
      name = case when p_command_type = 'sku.update'
        then coalesce(nullif(p_payload ->> 'name', ''), s.name) else s.name end,
      barcode = case when p_command_type = 'sku.update' and p_payload ? 'barcode'
        then nullif(p_payload ->> 'barcode', '') else s.barcode end,
      sales_code = case when p_command_type = 'sku.update' and p_payload ? 'sales_code'
        then nullif(p_payload ->> 'sales_code', '') else s.sales_code end,
      status = case p_command_type
        when 'sku.activate' then 'active'
        when 'sku.archive' then 'archived'
        else s.status end,
      updated_by = p_actor_user_id
    where s.organization_id = p_organization_id
      and s.id = v_entity_id
      and s.version = v_expected_version
    returning * into v_sku;
    if not found then
      perform private.raise_foundation_entity_write_failure(
        'skus', p_organization_id, v_entity_id
      );
    end if;
    v_entity_type := 'sku';
    v_event_name := case p_command_type
      when 'sku.update' then 'sku.updated'
      when 'sku.activate' then 'sku.activated'
      else 'sku.archived' end;
    v_target_label := v_sku.sku_code || ' · ' || v_sku.name;
    v_result := jsonb_build_object(
      'entity_id', v_sku.id, 'entity_type', 'sku',
      'product_id', v_sku.product_id, 'status', v_sku.status,
      'version', v_sku.version
    );
  elsif p_command_type = 'warehouse.create' then
    v_branch_id := (p_payload ->> 'branch_id')::uuid;
    if not exists (
      select 1 from public.branches b
      where b.organization_id = p_organization_id
        and b.id = v_branch_id and b.status = 'active'
    ) then
      raise exception 'entity_not_found' using errcode = 'P0002';
    end if;
    if not private.server_actor_has_org_permission(
      p_actor_user_id, p_organization_id, 'warehouse.manage', v_branch_id
    ) then
      raise exception 'branch_scope_denied' using errcode = '42501';
    end if;
    insert into public.warehouses (
      organization_id, branch_id, code, name, created_by, updated_by
    ) values (
      p_organization_id, v_branch_id, p_payload ->> 'code',
      p_payload ->> 'name', p_actor_user_id, p_actor_user_id
    ) returning * into v_warehouse;
    v_entity_id := v_warehouse.id;
    v_entity_type := 'warehouse';
    v_event_name := 'warehouse.created';
    v_target_label := v_warehouse.code || ' · ' || v_warehouse.name;
    v_result := jsonb_build_object(
      'entity_id', v_warehouse.id, 'entity_type', 'warehouse',
      'branch_id', v_warehouse.branch_id, 'status', v_warehouse.status,
      'version', v_warehouse.version
    );
  elsif p_command_type in (
    'warehouse.update', 'warehouse.inactivate', 'warehouse.archive'
  ) then
    v_entity_id := (p_payload ->> 'warehouse_id')::uuid;
    v_expected_version := (p_payload ->> 'expected_version')::bigint;
    select w.branch_id into v_branch_id from public.warehouses w
    where w.organization_id = p_organization_id and w.id = v_entity_id;
    if not found then raise exception 'entity_not_found' using errcode = 'P0002'; end if;
    if not private.server_actor_has_org_permission(
      p_actor_user_id, p_organization_id, 'warehouse.manage', v_branch_id
    ) then
      raise exception 'branch_scope_denied' using errcode = '42501';
    end if;
    update public.warehouses w set
      name = case when p_command_type = 'warehouse.update'
        then coalesce(nullif(p_payload ->> 'name', ''), w.name) else w.name end,
      status = case p_command_type
        when 'warehouse.inactivate' then 'inactive'
        when 'warehouse.archive' then 'archived'
        else w.status end,
      updated_by = p_actor_user_id
    where w.organization_id = p_organization_id
      and w.id = v_entity_id and w.version = v_expected_version
    returning * into v_warehouse;
    if not found then
      perform private.raise_foundation_entity_write_failure(
        'warehouses', p_organization_id, v_entity_id
      );
    end if;
    v_entity_type := 'warehouse';
    v_event_name := case p_command_type
      when 'warehouse.update' then 'warehouse.updated'
      when 'warehouse.inactivate' then 'warehouse.inactivated'
      else 'warehouse.archived' end;
    v_target_label := v_warehouse.code || ' · ' || v_warehouse.name;
    v_result := jsonb_build_object(
      'entity_id', v_warehouse.id, 'entity_type', 'warehouse',
      'branch_id', v_warehouse.branch_id, 'status', v_warehouse.status,
      'version', v_warehouse.version
    );
  elsif p_command_type = 'location.create' then
    v_entity_id := (p_payload ->> 'warehouse_id')::uuid;
    select w.* into strict v_warehouse from public.warehouses w
    where w.organization_id = p_organization_id and w.id = v_entity_id;
    if v_warehouse.status <> 'active' then
      raise exception 'entity_inactive' using errcode = '23514';
    end if;
    v_branch_id := v_warehouse.branch_id;
    if not private.server_actor_has_org_permission(
      p_actor_user_id, p_organization_id, 'warehouse.manage', v_branch_id
    ) then
      raise exception 'branch_scope_denied' using errcode = '42501';
    end if;
    insert into public.locations (
      organization_id, branch_id, warehouse_id, code, name,
      status, created_by, updated_by
    ) values (
      p_organization_id, v_branch_id, v_warehouse.id,
      p_payload ->> 'code', p_payload ->> 'name', 'active',
      p_actor_user_id, p_actor_user_id
    ) returning * into v_location;
    v_entity_id := v_location.id;
    v_entity_type := 'location';
    v_event_name := 'location.created';
    v_target_label := v_location.code || ' · ' || v_location.name;
    v_result := jsonb_build_object(
      'entity_id', v_location.id, 'entity_type', 'location',
      'branch_id', v_location.branch_id,
      'warehouse_id', v_location.warehouse_id,
      'status', v_location.status, 'version', v_location.version
    );
  else
    v_entity_id := (p_payload ->> 'location_id')::uuid;
    v_expected_version := (p_payload ->> 'expected_version')::bigint;
    select l.branch_id into v_branch_id from public.locations l
    where l.organization_id = p_organization_id and l.id = v_entity_id;
    if not found then raise exception 'entity_not_found' using errcode = 'P0002'; end if;
    if not private.server_actor_has_org_permission(
      p_actor_user_id, p_organization_id, 'warehouse.manage', v_branch_id
    ) then
      raise exception 'branch_scope_denied' using errcode = '42501';
    end if;
    update public.locations l set
      name = case when p_command_type = 'location.update'
        then coalesce(nullif(p_payload ->> 'name', ''), l.name) else l.name end,
      status = case p_command_type
        when 'location.inactivate' then 'inactive'
        when 'location.archive' then 'archived'
        else l.status end,
      updated_by = p_actor_user_id
    where l.organization_id = p_organization_id
      and l.id = v_entity_id and l.version = v_expected_version
    returning * into v_location;
    if not found then
      perform private.raise_foundation_entity_write_failure(
        'locations', p_organization_id, v_entity_id
      );
    end if;
    v_entity_type := 'location';
    v_event_name := case p_command_type
      when 'location.update' then 'location.updated'
      when 'location.inactivate' then 'location.inactivated'
      else 'location.archived' end;
    v_target_label := v_location.code || ' · ' || v_location.name;
    v_result := jsonb_build_object(
      'entity_id', v_location.id, 'entity_type', 'location',
      'branch_id', v_location.branch_id,
      'warehouse_id', v_location.warehouse_id,
      'status', v_location.status, 'version', v_location.version
    );
  end if;

  insert into public.foundation_domain_events (
    organization_id, branch_id, event_name, command_id,
    entity_type, entity_id, actor_user_id, metadata, occurred_at
  ) values (
    p_organization_id, v_branch_id, v_event_name, p_command_id,
    v_entity_type, v_entity_id, p_actor_user_id,
    v_result - 'entity_id' - 'entity_type', v_occurred_at
  );

  perform private.append_organization_audit_log(
    p_organization_id,
    case when v_entity_type in ('product', 'sku') then 'product' else 'warehouse' end,
    v_event_name,
    p_actor_user_id,
    v_entity_type,
    v_entity_id,
    v_target_label,
    replace(v_event_name, '.', ' '),
    v_result - 'entity_id' - 'entity_type',
    'foundation_command',
    p_command_id,
    v_event_name,
    v_occurred_at
  );

  update public.foundation_commands
  set status = 'completed', result = v_result, completed_at = now()
  where organization_id = p_organization_id and id = p_command_id;

  perform set_config('avenzo.foundation_command_id', '', true);
  perform set_config('avenzo.foundation_organization_id', '', true);
  return v_result;
exception
  when no_data_found then
    raise exception 'entity_not_found' using errcode = 'P0002';
end;
$$;

revoke all on function public.server_execute_foundation_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.server_execute_foundation_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) to service_role;

alter table public.foundation_commands enable row level security;
alter table public.foundation_domain_events enable row level security;

revoke all privileges on table
  public.foundation_commands, public.foundation_domain_events
from public, anon, authenticated;
grant select on table public.foundation_domain_events to authenticated;

create policy foundation_domain_events_permission_select
on public.foundation_domain_events for select to authenticated
using (
  (
    entity_type in ('product', 'sku')
    and (select private.has_org_permission(
      organization_id, 'product.read', null
    ))
  )
  or (
    entity_type in ('warehouse', 'location')
    and branch_id is not null
    and (select private.has_org_permission(
      organization_id, 'warehouse.read', branch_id
    ))
  )
);

comment on table public.foundation_commands is
  'Durable idempotency envelope for Product/SKU and Warehouse/Location server commands.';
comment on table public.foundation_domain_events is
  'Immutable machine-readable events emitted atomically by Foundation commands.';
comment on function public.server_execute_foundation_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) is 'Service-role-only Foundation command RPC with explicit actor, tenant, scope, permission, idempotency and optimistic concurrency checks.';
