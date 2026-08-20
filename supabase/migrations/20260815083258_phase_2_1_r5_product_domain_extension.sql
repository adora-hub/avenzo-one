-- Phase 2.1.R5: Product domain extension gate.
-- Additive only: existing Product/SKU identifiers and inventory authority remain unchanged.

insert into public.permissions (code, resource, action, description)
values ('product.cost.read', 'product', 'cost_read', 'View organization-scoped SKU cost data')
on conflict (code) do update set
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_code)
select r.id, 'product.cost.read'
from public.organization_roles r
where r.code in ('owner', 'admin')
on conflict (role_id, permission_code) do nothing;

create or replace function private.seed_product_domain_cost_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.code in ('owner', 'admin') then
    insert into public.role_permissions (role_id, permission_code)
    values (new.id, 'product.cost.read')
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.seed_product_domain_cost_permission()
  from public, anon, authenticated, service_role;

create trigger seed_product_domain_cost_permission_after_role_insert
after insert on public.organization_roles
for each row execute function private.seed_product_domain_cost_permission();

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  status text not null default 'active',
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_categories_tenant_id_unique unique (organization_id, id),
  constraint product_categories_name_check check (
    name = btrim(name) and char_length(name) between 1 and 120
  ),
  constraint product_categories_status_check check (status in ('active', 'archived')),
  constraint product_categories_version_check check (version >= 1)
);

create table public.product_brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  status text not null default 'active',
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_brands_tenant_id_unique unique (organization_id, id),
  constraint product_brands_name_check check (
    name = btrim(name) and char_length(name) between 1 and 120
  ),
  constraint product_brands_status_check check (status in ('active', 'archived')),
  constraint product_brands_version_check check (version >= 1)
);

create table public.product_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  status text not null default 'active',
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_tags_tenant_id_unique unique (organization_id, id),
  constraint product_tags_name_check check (
    name = btrim(name) and char_length(name) between 1 and 80
  ),
  constraint product_tags_status_check check (status in ('active', 'archived')),
  constraint product_tags_version_check check (version >= 1)
);

create unique index product_categories_org_name_unique
  on public.product_categories (organization_id, lower(name));
create unique index product_brands_org_name_unique
  on public.product_brands (organization_id, lower(name));
create unique index product_tags_org_name_unique
  on public.product_tags (organization_id, lower(name));

alter table public.products
  add column category_id uuid,
  add column brand_id uuid,
  add column structure_type text not null default 'standard',
  add column internal_note text,
  add constraint products_category_tenant_fk foreign key (organization_id, category_id)
    references public.product_categories (organization_id, id) on delete restrict,
  add constraint products_brand_tenant_fk foreign key (organization_id, brand_id)
    references public.product_brands (organization_id, id) on delete restrict,
  add constraint products_structure_type_check check (
    structure_type in ('standard', 'variant', 'bundle')
  ),
  add constraint products_internal_note_check check (
    internal_note is null
    or (internal_note = btrim(internal_note) and char_length(internal_note) <= 4000)
  );

create index products_category_idx on public.products (organization_id, category_id)
  where category_id is not null;
create index products_brand_idx on public.products (organization_id, brand_id)
  where brand_id is not null;

create table public.product_tag_assignments (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null,
  tag_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (organization_id, product_id, tag_id),
  constraint product_tag_assignments_product_fk foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint product_tag_assignments_tag_fk foreign key (organization_id, tag_id)
    references public.product_tags (organization_id, id) on delete restrict
);

create index product_tag_assignments_tag_idx
  on public.product_tag_assignments (organization_id, tag_id, product_id);

create table public.sku_product_profiles (
  sku_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  quantity_behavior text not null default 'discrete',
  sale_price numeric(14,2),
  currency_code text not null default 'THB',
  tax_category text not null default 'standard',
  tax_rate numeric(7,4) not null default 7,
  product_weight_kg numeric(14,6),
  product_length_cm numeric(14,3),
  product_width_cm numeric(14,3),
  product_height_cm numeric(14,3),
  package_weight_kg numeric(14,6),
  package_length_cm numeric(14,3),
  package_width_cm numeric(14,3),
  package_height_cm numeric(14,3),
  safety_stock numeric(20,6),
  reorder_min numeric(20,6),
  reorder_max numeric(20,6),
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sku_product_profiles_tenant_id_unique unique (organization_id, sku_id),
  constraint sku_product_profiles_sku_fk foreign key (organization_id, sku_id)
    references public.skus (organization_id, id) on delete restrict,
  constraint sku_product_profiles_quantity_behavior_check check (
    quantity_behavior in ('discrete', 'weight', 'volume')
  ),
  constraint sku_product_profiles_sale_price_check check (sale_price is null or sale_price >= 0),
  constraint sku_product_profiles_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint sku_product_profiles_tax_category_check check (
    tax_category in ('standard', 'zero', 'exempt', 'out_of_scope')
  ),
  constraint sku_product_profiles_tax_rate_check check (
    tax_rate between 0 and 100
    and (tax_category = 'standard' or tax_rate = 0)
  ),
  constraint sku_product_profiles_measurements_check check (
    (product_weight_kg is null or product_weight_kg >= 0)
    and (product_length_cm is null or product_length_cm >= 0)
    and (product_width_cm is null or product_width_cm >= 0)
    and (product_height_cm is null or product_height_cm >= 0)
    and (package_weight_kg is null or package_weight_kg >= 0)
    and (package_length_cm is null or package_length_cm >= 0)
    and (package_width_cm is null or package_width_cm >= 0)
    and (package_height_cm is null or package_height_cm >= 0)
  ),
  constraint sku_product_profiles_reorder_check check (
    (safety_stock is null or safety_stock >= 0)
    and (reorder_min is null or reorder_min >= 0)
    and (reorder_max is null or reorder_max >= 0)
    and (reorder_min is null or reorder_max is null or reorder_max >= reorder_min)
  ),
  constraint sku_product_profiles_version_check check (version >= 1)
);

create table public.sku_cost_profiles (
  sku_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  cost_price numeric(14,2),
  currency_code text not null default 'THB',
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sku_cost_profiles_tenant_id_unique unique (organization_id, sku_id),
  constraint sku_cost_profiles_sku_fk foreign key (organization_id, sku_id)
    references public.skus (organization_id, id) on delete restrict,
  constraint sku_cost_profiles_cost_check check (cost_price is null or cost_price >= 0),
  constraint sku_cost_profiles_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint sku_cost_profiles_version_check check (version >= 1)
);

create table public.sku_sell_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sku_id uuid not null,
  unit_code text not null,
  name text not null,
  base_quantity numeric(20,6) not null,
  barcode text,
  status text not null default 'active',
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sku_sell_units_tenant_id_unique unique (organization_id, id),
  constraint sku_sell_units_sku_fk foreign key (organization_id, sku_id)
    references public.skus (organization_id, id) on delete restrict,
  constraint sku_sell_units_code_check check (
    unit_code = lower(btrim(unit_code)) and unit_code ~ '^[a-z][a-z0-9_]{0,31}$'
  ),
  constraint sku_sell_units_name_check check (
    name = btrim(name) and char_length(name) between 1 and 80
  ),
  constraint sku_sell_units_base_quantity_check check (base_quantity > 0),
  constraint sku_sell_units_barcode_check check (
    barcode is null or (barcode = btrim(barcode) and char_length(barcode) between 1 and 128)
  ),
  constraint sku_sell_units_status_check check (status in ('active', 'archived')),
  constraint sku_sell_units_org_sku_code_unique unique (organization_id, sku_id, unit_code)
);

create unique index sku_sell_units_org_barcode_unique
  on public.sku_sell_units (organization_id, barcode) where barcode is not null;
create index sku_sell_units_sku_idx
  on public.sku_sell_units (organization_id, sku_id, status, unit_code);

create table public.sku_bundle_components (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  bundle_sku_id uuid not null,
  component_sku_id uuid not null,
  component_quantity numeric(20,6) not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (organization_id, bundle_sku_id, component_sku_id),
  constraint sku_bundle_components_bundle_fk foreign key (organization_id, bundle_sku_id)
    references public.skus (organization_id, id) on delete restrict,
  constraint sku_bundle_components_component_fk foreign key (organization_id, component_sku_id)
    references public.skus (organization_id, id) on delete restrict,
  constraint sku_bundle_components_not_self_check check (bundle_sku_id <> component_sku_id),
  constraint sku_bundle_components_quantity_check check (component_quantity > 0)
);

create index sku_bundle_components_component_idx
  on public.sku_bundle_components (organization_id, component_sku_id, bundle_sku_id);

create table public.product_domain_commands (
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
  constraint product_domain_commands_tenant_id_unique unique (organization_id, id),
  constraint product_domain_commands_type_check check (command_type in (
    'product.master.upsert', 'product.metadata.update', 'sku.profile.upsert',
    'sku.cost.upsert', 'sku.sell_units.replace', 'sku.bundle.replace'
  )),
  constraint product_domain_commands_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint product_domain_commands_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint product_domain_commands_status_check check (status in ('processing', 'completed')),
  constraint product_domain_commands_completion_check check (
    (status = 'processing' and result is null and completed_at is null)
    or (status = 'completed' and result is not null and completed_at is not null)
  )
);

create table public.product_domain_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  command_id uuid not null,
  event_name text not null,
  entity_type text not null,
  entity_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint product_domain_events_command_unique unique (organization_id, command_id),
  constraint product_domain_events_command_fk foreign key (organization_id, command_id)
    references public.product_domain_commands (organization_id, id) on delete restrict,
  constraint product_domain_events_name_check check (event_name in (
    'product.master.upserted', 'product.metadata.updated', 'sku.profile.upserted',
    'sku.cost.upserted', 'sku.sell_units.replaced', 'sku.bundle.replaced'
  )),
  constraint product_domain_events_entity_type_check check (
    entity_type in ('category', 'brand', 'tag', 'product', 'sku')
  ),
  constraint product_domain_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index product_domain_commands_org_time_idx
  on public.product_domain_commands (organization_id, created_at desc, id desc);
create index product_domain_commands_actor_idx on public.product_domain_commands (actor_user_id);
create index product_domain_events_org_time_idx
  on public.product_domain_events (organization_id, occurred_at desc, id desc);
create index product_domain_events_entity_idx
  on public.product_domain_events (organization_id, entity_type, entity_id);
create index product_domain_events_actor_idx on public.product_domain_events (actor_user_id);

create or replace function private.require_product_domain_command_context(
  p_organization_id uuid,
  p_command_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(current_setting('avenzo.product_domain_command_id', true), '')::uuid
       is distinct from p_command_id
     or nullif(current_setting('avenzo.product_domain_organization_id', true), '')::uuid
       is distinct from p_organization_id then
    raise exception 'product_domain_direct_write_forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.guard_product_domain_command_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_product_domain_command_context(old.organization_id, old.id);
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.command_type is distinct from old.command_type
     or new.payload is distinct from old.payload
     or new.request_hash is distinct from old.request_hash
     or new.actor_user_id is distinct from old.actor_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'product_domain_command_is_immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.guard_product_domain_event_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_product_domain_command_context(new.organization_id, new.command_id);
  return new;
end;
$$;

create or replace function private.prevent_product_domain_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '%_is_immutable', tg_table_name using errcode = '22023';
end;
$$;

revoke all on function private.require_product_domain_command_context(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.guard_product_domain_command_update()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_product_domain_event_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.prevent_product_domain_history_mutation()
  from public, anon, authenticated, service_role;

create trigger guard_product_domain_command_update
before update on public.product_domain_commands
for each row execute function private.guard_product_domain_command_update();
create trigger prevent_product_domain_command_delete
before delete on public.product_domain_commands
for each row execute function private.prevent_product_domain_history_mutation();
create trigger guard_product_domain_event_insert
before insert on public.product_domain_events
for each row execute function private.guard_product_domain_event_insert();
create trigger prevent_product_domain_event_update_delete
before update or delete on public.product_domain_events
for each row execute function private.prevent_product_domain_history_mutation();

create or replace function private.prepare_product_master_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id then
      raise exception 'product_master_identity_is_immutable' using errcode = '22023';
    end if;
    if old.status = 'archived' then
      raise exception 'archived_product_master_is_immutable' using errcode = '22023';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function private.prepare_product_domain_profile_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.currency_code := upper(btrim(new.currency_code));
  if tg_op = 'UPDATE' then
    if new.sku_id is distinct from old.sku_id or new.organization_id is distinct from old.organization_id then
      raise exception 'sku_profile_identity_is_immutable' using errcode = '22023';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function private.prepare_sku_sell_unit_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.unit_code := lower(btrim(new.unit_code));
  new.name := btrim(new.name);
  new.barcode := nullif(btrim(new.barcode), '');
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
       or new.sku_id is distinct from old.sku_id then
      raise exception 'sku_sell_unit_identity_is_immutable' using errcode = '22023';
    end if;
    if old.status = 'archived' then
      raise exception 'archived_sku_sell_unit_is_immutable' using errcode = '22023';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function private.prevent_product_domain_hard_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '%_hard_delete_forbidden', tg_table_name using errcode = '22023';
end;
$$;

create or replace function private.validate_bundle_component()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_structure_type text;
begin
  select p.structure_type into v_structure_type
  from public.skus s
  join public.products p
    on p.organization_id = s.organization_id and p.id = s.product_id
  where s.organization_id = new.organization_id and s.id = new.bundle_sku_id;

  if v_structure_type is distinct from 'bundle' then
    raise exception 'bundle_sku_requires_bundle_product' using errcode = '23514';
  end if;

  if exists (
    with recursive descendants(component_sku_id) as (
      select new.component_sku_id
      union all
      select c.component_sku_id
      from public.sku_bundle_components c
      join descendants d on d.component_sku_id = c.bundle_sku_id
      where c.organization_id = new.organization_id
    )
    select 1 from descendants where component_sku_id = new.bundle_sku_id
  ) then
    raise exception 'bundle_cycle_forbidden' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_product_master_write() from public, anon, authenticated, service_role;
revoke all on function private.prepare_product_domain_profile_write() from public, anon, authenticated, service_role;
revoke all on function private.prepare_sku_sell_unit_write() from public, anon, authenticated, service_role;
revoke all on function private.prevent_product_domain_hard_delete() from public, anon, authenticated, service_role;
revoke all on function private.validate_bundle_component() from public, anon, authenticated, service_role;

create trigger prepare_product_category_write before insert or update on public.product_categories
for each row execute function private.prepare_product_master_write();
create trigger prepare_product_brand_write before insert or update on public.product_brands
for each row execute function private.prepare_product_master_write();
create trigger prepare_product_tag_write before insert or update on public.product_tags
for each row execute function private.prepare_product_master_write();
create trigger prepare_sku_product_profile_write before insert or update on public.sku_product_profiles
for each row execute function private.prepare_product_domain_profile_write();
create trigger prepare_sku_cost_profile_write before insert or update on public.sku_cost_profiles
for each row execute function private.prepare_product_domain_profile_write();
create trigger prepare_sku_sell_unit_write before insert or update on public.sku_sell_units
for each row execute function private.prepare_sku_sell_unit_write();
create trigger validate_bundle_component before insert or update on public.sku_bundle_components
for each row execute function private.validate_bundle_component();

create trigger prevent_product_category_delete before delete on public.product_categories
for each row execute function private.prevent_product_domain_hard_delete();
create trigger prevent_product_brand_delete before delete on public.product_brands
for each row execute function private.prevent_product_domain_hard_delete();
create trigger prevent_product_tag_delete before delete on public.product_tags
for each row execute function private.prevent_product_domain_hard_delete();
create trigger prevent_sku_product_profile_delete before delete on public.sku_product_profiles
for each row execute function private.prevent_product_domain_hard_delete();
create trigger prevent_sku_cost_profile_delete before delete on public.sku_cost_profiles
for each row execute function private.prevent_product_domain_hard_delete();

create or replace function public.server_execute_product_domain_command(
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
  v_command public.product_domain_commands%rowtype;
  v_entity_id uuid;
  v_entity_type text;
  v_event_name text;
  v_result jsonb;
  v_master_kind text;
  v_expected_version bigint;
  v_current_version bigint;
  v_product_id uuid;
  v_sku_id uuid;
  v_item jsonb;
  v_count integer;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_command_id is null or p_organization_id is null or p_actor_user_id is null then
    raise exception 'product_domain_command_identity_required' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'product_domain_command_payload_invalid' using errcode = '22023';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'product_domain_request_hash_invalid' using errcode = '22023';
  end if;
  if p_command_type not in (
    'product.master.upsert', 'product.metadata.update', 'sku.profile.upsert',
    'sku.cost.upsert', 'sku.sell_units.replace', 'sku.bundle.replace'
  ) then
    raise exception 'product_domain_command_type_invalid' using errcode = '22023';
  end if;
  if not private.server_actor_has_org_permission(
    p_actor_user_id, p_organization_id, 'product.manage', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  insert into public.product_domain_commands (
    id, organization_id, command_type, payload, request_hash, actor_user_id
  ) values (
    p_command_id, p_organization_id, p_command_type, p_payload, p_request_hash, p_actor_user_id
  ) on conflict (id) do nothing;

  select c.* into strict v_command
  from public.product_domain_commands c
  where c.id = p_command_id
  for update;

  if v_command.organization_id <> p_organization_id
     or v_command.command_type <> p_command_type
     or v_command.payload <> p_payload
     or v_command.request_hash <> p_request_hash
     or v_command.actor_user_id <> p_actor_user_id then
    raise exception 'command_payload_conflict' using errcode = '23505';
  end if;
  if v_command.status = 'completed' then return v_command.result; end if;

  perform set_config('avenzo.product_domain_command_id', p_command_id::text, true);
  perform set_config('avenzo.product_domain_organization_id', p_organization_id::text, true);

  if p_command_type = 'product.master.upsert' then
    v_master_kind := p_payload ->> 'master_kind';
    v_entity_id := nullif(p_payload ->> 'master_id', '')::uuid;
    v_expected_version := nullif(p_payload ->> 'expected_version', '')::bigint;
    if v_master_kind not in ('category', 'brand', 'tag') then
      raise exception 'product_master_kind_invalid' using errcode = '22023';
    end if;
    if nullif(btrim(p_payload ->> 'name'), '') is null then
      raise exception 'product_master_name_required' using errcode = '22023';
    end if;

    if v_master_kind = 'category' then
      if v_entity_id is null then
        insert into public.product_categories (
          organization_id, name, created_by, updated_by
        ) values (p_organization_id, p_payload ->> 'name', p_actor_user_id, p_actor_user_id)
        returning id, version into v_entity_id, v_current_version;
      else
        update public.product_categories set
          name = p_payload ->> 'name',
          status = coalesce(nullif(p_payload ->> 'status', ''), status),
          updated_by = p_actor_user_id
        where organization_id = p_organization_id and id = v_entity_id
          and version = v_expected_version
        returning version into v_current_version;
      end if;
    elsif v_master_kind = 'brand' then
      if v_entity_id is null then
        insert into public.product_brands (
          organization_id, name, created_by, updated_by
        ) values (p_organization_id, p_payload ->> 'name', p_actor_user_id, p_actor_user_id)
        returning id, version into v_entity_id, v_current_version;
      else
        update public.product_brands set
          name = p_payload ->> 'name',
          status = coalesce(nullif(p_payload ->> 'status', ''), status),
          updated_by = p_actor_user_id
        where organization_id = p_organization_id and id = v_entity_id
          and version = v_expected_version
        returning version into v_current_version;
      end if;
    else
      if v_entity_id is null then
        insert into public.product_tags (
          organization_id, name, created_by, updated_by
        ) values (p_organization_id, p_payload ->> 'name', p_actor_user_id, p_actor_user_id)
        returning id, version into v_entity_id, v_current_version;
      else
        update public.product_tags set
          name = p_payload ->> 'name',
          status = coalesce(nullif(p_payload ->> 'status', ''), status),
          updated_by = p_actor_user_id
        where organization_id = p_organization_id and id = v_entity_id
          and version = v_expected_version
        returning version into v_current_version;
      end if;
    end if;
    if v_current_version is null then
      raise exception 'version_conflict' using errcode = '40001';
    end if;
    v_entity_type := v_master_kind;
    v_event_name := 'product.master.upserted';
    v_result := jsonb_build_object(
      'entity_id', v_entity_id, 'entity_type', v_entity_type, 'version', v_current_version
    );

  elsif p_command_type = 'product.metadata.update' then
    v_product_id := (p_payload ->> 'product_id')::uuid;
    v_expected_version := (p_payload ->> 'expected_version')::bigint;
    if p_payload ? 'tag_ids' and jsonb_typeof(p_payload -> 'tag_ids') <> 'array' then
      raise exception 'product_tag_ids_invalid' using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(p_payload -> 'tag_ids', '[]'::jsonb)) > 40 then
      raise exception 'product_tag_limit_exceeded' using errcode = '22023';
    end if;
    update public.products set
      category_id = case when p_payload ? 'category_id'
        then nullif(p_payload ->> 'category_id', '')::uuid else category_id end,
      brand_id = case when p_payload ? 'brand_id'
        then nullif(p_payload ->> 'brand_id', '')::uuid else brand_id end,
      structure_type = coalesce(nullif(p_payload ->> 'structure_type', ''), structure_type),
      internal_note = case when p_payload ? 'internal_note'
        then nullif(btrim(p_payload ->> 'internal_note'), '') else internal_note end,
      updated_by = p_actor_user_id
    where organization_id = p_organization_id and id = v_product_id
      and version = v_expected_version
    returning version into v_current_version;
    if not found then raise exception 'version_conflict' using errcode = '40001'; end if;

    if p_payload ? 'tag_ids' then
      delete from public.product_tag_assignments
      where organization_id = p_organization_id and product_id = v_product_id;
      insert into public.product_tag_assignments (
        organization_id, product_id, tag_id, created_by
      )
      select p_organization_id, v_product_id, value::uuid, p_actor_user_id
      from jsonb_array_elements_text(p_payload -> 'tag_ids')
      on conflict do nothing;
    end if;
    v_entity_id := v_product_id;
    v_entity_type := 'product';
    v_event_name := 'product.metadata.updated';
    v_result := jsonb_build_object(
      'entity_id', v_entity_id, 'entity_type', v_entity_type, 'version', v_current_version
    );

  elsif p_command_type in ('sku.profile.upsert', 'sku.cost.upsert') then
    v_sku_id := (p_payload ->> 'sku_id')::uuid;
    v_expected_version := coalesce(nullif(p_payload ->> 'expected_version', '')::bigint, 0);
    if not exists (
      select 1 from public.skus where organization_id = p_organization_id and id = v_sku_id
    ) then raise exception 'entity_not_found' using errcode = 'P0002'; end if;

    if p_command_type = 'sku.profile.upsert' then
      insert into public.sku_product_profiles (
        sku_id, organization_id, quantity_behavior, sale_price, currency_code,
        tax_category, tax_rate, product_weight_kg, product_length_cm,
        product_width_cm, product_height_cm, package_weight_kg, package_length_cm,
        package_width_cm, package_height_cm, safety_stock, reorder_min, reorder_max,
        created_by, updated_by
      ) values (
        v_sku_id, p_organization_id,
        coalesce(nullif(p_payload ->> 'quantity_behavior', ''), 'discrete'),
        nullif(p_payload ->> 'sale_price', '')::numeric,
        coalesce(nullif(p_payload ->> 'currency_code', ''), 'THB'),
        coalesce(nullif(p_payload ->> 'tax_category', ''), 'standard'),
        coalesce(
          nullif(p_payload ->> 'tax_rate', '')::numeric,
          case when coalesce(nullif(p_payload ->> 'tax_category', ''), 'standard') = 'standard'
            then 7 else 0 end
        ),
        nullif(p_payload ->> 'product_weight_kg', '')::numeric,
        nullif(p_payload ->> 'product_length_cm', '')::numeric,
        nullif(p_payload ->> 'product_width_cm', '')::numeric,
        nullif(p_payload ->> 'product_height_cm', '')::numeric,
        nullif(p_payload ->> 'package_weight_kg', '')::numeric,
        nullif(p_payload ->> 'package_length_cm', '')::numeric,
        nullif(p_payload ->> 'package_width_cm', '')::numeric,
        nullif(p_payload ->> 'package_height_cm', '')::numeric,
        nullif(p_payload ->> 'safety_stock', '')::numeric,
        nullif(p_payload ->> 'reorder_min', '')::numeric,
        nullif(p_payload ->> 'reorder_max', '')::numeric,
        p_actor_user_id, p_actor_user_id
      ) on conflict (sku_id) do update set
        quantity_behavior = excluded.quantity_behavior,
        sale_price = excluded.sale_price,
        currency_code = excluded.currency_code,
        tax_category = excluded.tax_category,
        tax_rate = excluded.tax_rate,
        product_weight_kg = excluded.product_weight_kg,
        product_length_cm = excluded.product_length_cm,
        product_width_cm = excluded.product_width_cm,
        product_height_cm = excluded.product_height_cm,
        package_weight_kg = excluded.package_weight_kg,
        package_length_cm = excluded.package_length_cm,
        package_width_cm = excluded.package_width_cm,
        package_height_cm = excluded.package_height_cm,
        safety_stock = excluded.safety_stock,
        reorder_min = excluded.reorder_min,
        reorder_max = excluded.reorder_max,
        updated_by = excluded.updated_by
      where sku_product_profiles.version = v_expected_version
      returning version into v_current_version;
      if not found then raise exception 'version_conflict' using errcode = '40001'; end if;
      v_event_name := 'sku.profile.upserted';
    else
      insert into public.sku_cost_profiles (
        sku_id, organization_id, cost_price, currency_code, created_by, updated_by
      ) values (
        v_sku_id, p_organization_id, nullif(p_payload ->> 'cost_price', '')::numeric,
        coalesce(nullif(p_payload ->> 'currency_code', ''), 'THB'),
        p_actor_user_id, p_actor_user_id
      ) on conflict (sku_id) do update set
        cost_price = excluded.cost_price,
        currency_code = excluded.currency_code,
        updated_by = excluded.updated_by
      where sku_cost_profiles.version = v_expected_version
      returning version into v_current_version;
      if not found then raise exception 'version_conflict' using errcode = '40001'; end if;
      v_event_name := 'sku.cost.upserted';
    end if;
    v_entity_id := v_sku_id;
    v_entity_type := 'sku';
    v_result := jsonb_build_object(
      'entity_id', v_entity_id, 'entity_type', v_entity_type, 'version', v_current_version
    );

  elsif p_command_type = 'sku.sell_units.replace' then
    v_sku_id := (p_payload ->> 'sku_id')::uuid;
    if jsonb_typeof(p_payload -> 'units') <> 'array'
       or jsonb_array_length(p_payload -> 'units') > 50 then
      raise exception 'sku_sell_units_invalid' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.skus where organization_id = p_organization_id and id = v_sku_id
    ) then raise exception 'entity_not_found' using errcode = 'P0002'; end if;
    delete from public.sku_sell_units
    where organization_id = p_organization_id and sku_id = v_sku_id;
    for v_item in select value from jsonb_array_elements(p_payload -> 'units') loop
      insert into public.sku_sell_units (
        organization_id, sku_id, unit_code, name, base_quantity, barcode,
        created_by, updated_by
      ) values (
        p_organization_id, v_sku_id, v_item ->> 'unit_code', v_item ->> 'name',
        (v_item ->> 'base_quantity')::numeric, nullif(v_item ->> 'barcode', ''),
        p_actor_user_id, p_actor_user_id
      );
    end loop;
    select count(*) into v_count from public.sku_sell_units
    where organization_id = p_organization_id and sku_id = v_sku_id;
    v_entity_id := v_sku_id;
    v_entity_type := 'sku';
    v_event_name := 'sku.sell_units.replaced';
    v_result := jsonb_build_object(
      'entity_id', v_entity_id, 'entity_type', v_entity_type, 'unit_count', v_count
    );

  else
    v_sku_id := (p_payload ->> 'sku_id')::uuid;
    if jsonb_typeof(p_payload -> 'components') <> 'array'
       or jsonb_array_length(p_payload -> 'components') > 100 then
      raise exception 'sku_bundle_components_invalid' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.skus where organization_id = p_organization_id and id = v_sku_id
    ) then raise exception 'entity_not_found' using errcode = 'P0002'; end if;
    delete from public.sku_bundle_components
    where organization_id = p_organization_id and bundle_sku_id = v_sku_id;
    for v_item in select value from jsonb_array_elements(p_payload -> 'components') loop
      insert into public.sku_bundle_components (
        organization_id, bundle_sku_id, component_sku_id, component_quantity, created_by
      ) values (
        p_organization_id, v_sku_id, (v_item ->> 'sku_id')::uuid,
        (v_item ->> 'quantity')::numeric, p_actor_user_id
      );
    end loop;
    select count(*) into v_count from public.sku_bundle_components
    where organization_id = p_organization_id and bundle_sku_id = v_sku_id;
    v_entity_id := v_sku_id;
    v_entity_type := 'sku';
    v_event_name := 'sku.bundle.replaced';
    v_result := jsonb_build_object(
      'entity_id', v_entity_id, 'entity_type', v_entity_type, 'component_count', v_count
    );
  end if;

  insert into public.product_domain_events (
    organization_id, command_id, event_name, entity_type, entity_id,
    actor_user_id, metadata, occurred_at
  ) values (
    p_organization_id, p_command_id, v_event_name, v_entity_type, v_entity_id,
    p_actor_user_id, v_result - 'entity_id' - 'entity_type', v_occurred_at
  );

  perform private.append_organization_audit_log(
    p_organization_id, 'product', v_event_name, p_actor_user_id,
    v_entity_type, v_entity_id, v_entity_type,
    replace(v_event_name, '.', ' '), v_result - 'entity_id' - 'entity_type',
    'product_domain_command', p_command_id, v_event_name, v_occurred_at
  );

  update public.product_domain_commands
  set status = 'completed', result = v_result, completed_at = now()
  where organization_id = p_organization_id and id = p_command_id;
  perform set_config('avenzo.product_domain_command_id', '', true);
  perform set_config('avenzo.product_domain_organization_id', '', true);
  return v_result;
exception
  when no_data_found then raise exception 'entity_not_found' using errcode = 'P0002';
end;
$$;

revoke all on function public.server_execute_product_domain_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.server_execute_product_domain_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) to service_role;

alter table public.product_categories enable row level security;
alter table public.product_brands enable row level security;
alter table public.product_tags enable row level security;
alter table public.product_tag_assignments enable row level security;
alter table public.sku_product_profiles enable row level security;
alter table public.sku_cost_profiles enable row level security;
alter table public.sku_sell_units enable row level security;
alter table public.sku_bundle_components enable row level security;
alter table public.product_domain_commands enable row level security;
alter table public.product_domain_events enable row level security;

revoke all privileges on table
  public.product_categories, public.product_brands, public.product_tags,
  public.product_tag_assignments, public.sku_product_profiles, public.sku_cost_profiles,
  public.sku_sell_units, public.sku_bundle_components,
  public.product_domain_commands, public.product_domain_events
from public, anon, authenticated;

grant select on table
  public.product_categories, public.product_brands, public.product_tags,
  public.product_tag_assignments, public.sku_product_profiles,
  public.sku_sell_units, public.sku_bundle_components, public.product_domain_events
to authenticated;
grant select on table public.sku_cost_profiles to authenticated;

create policy product_categories_read on public.product_categories for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy product_brands_read on public.product_brands for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy product_tags_read on public.product_tags for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy product_tag_assignments_read on public.product_tag_assignments for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy sku_product_profiles_read on public.sku_product_profiles for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy sku_cost_profiles_read on public.sku_cost_profiles for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.cost.read', null)));
create policy sku_sell_units_read on public.sku_sell_units for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy sku_bundle_components_read on public.sku_bundle_components for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy product_domain_events_read on public.product_domain_events for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));

comment on table public.sku_product_profiles is
  'R5 SKU sale, tax, physical, packaging, and replenishment metadata; never a stock balance.';
comment on table public.sku_cost_profiles is
  'R5 cost data isolated behind product.cost.read.';
comment on table public.sku_sell_units is
  'R5 alternative sell units converted to the immutable SKU base unit by base_quantity.';
comment on table public.sku_bundle_components is
  'R5 bundle recipe. Stock commands must resolve and post component sku_id quantities.';
comment on function public.server_execute_product_domain_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) is 'Trusted idempotent R5 command boundary; service role only.';
