-- Phase 2.1 A3: structured Product Variant data model.
-- Additive only. Product/SKU creation commands are intentionally deferred to Part 5.

alter table public.skus
  add constraint skus_tenant_product_id_unique
  unique (organization_id, product_id, id);

alter table public.product_images
  add constraint product_images_tenant_product_id_unique
  unique (organization_id, product_id, id);

create table public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null,
  name text not null,
  normalized_name text generated always as (
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
  ) stored,
  option_kind text not null default 'custom',
  display_order smallint not null,
  status text not null default 'active',
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_option_groups_tenant_id_unique unique (organization_id, id),
  constraint product_option_groups_tenant_product_id_unique unique (organization_id, product_id, id),
  constraint product_option_groups_product_fk foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint product_option_groups_name_check check (
    name = btrim(name) and char_length(name) between 1 and 40 and name !~ '[[:cntrl:]]'
  ),
  constraint product_option_groups_kind_check check (option_kind in ('color', 'size', 'custom')),
  constraint product_option_groups_order_check check (display_order between 1 and 3),
  constraint product_option_groups_status_check check (status in ('active', 'archived')),
  constraint product_option_groups_version_check check (version >= 1)
);

create unique index product_option_groups_name_unique
  on public.product_option_groups (organization_id, product_id, normalized_name);
create unique index product_option_groups_order_unique
  on public.product_option_groups (organization_id, product_id, display_order);
create index product_option_groups_read_idx
  on public.product_option_groups (organization_id, product_id, status, display_order, id);

create table public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  option_group_id uuid not null,
  name text not null,
  normalized_name text generated always as (
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
  ) stored,
  code text not null,
  color_hex text,
  display_order smallint not null,
  status text not null default 'active',
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_option_values_tenant_id_unique unique (organization_id, id),
  constraint product_option_values_tenant_group_id_unique unique (organization_id, option_group_id, id),
  constraint product_option_values_group_fk foreign key (organization_id, option_group_id)
    references public.product_option_groups (organization_id, id) on delete restrict,
  constraint product_option_values_name_check check (
    name = btrim(name) and char_length(name) between 1 and 40 and name !~ '[[:cntrl:]]'
  ),
  constraint product_option_values_code_check check (
    code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]{0,11}$'
  ),
  constraint product_option_values_color_check check (
    color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'
  ),
  constraint product_option_values_order_check check (display_order between 1 and 12),
  constraint product_option_values_status_check check (status in ('active', 'archived')),
  constraint product_option_values_version_check check (version >= 1)
);

create unique index product_option_values_name_unique
  on public.product_option_values (organization_id, option_group_id, normalized_name);
create unique index product_option_values_code_unique
  on public.product_option_values (organization_id, option_group_id, code);
create unique index product_option_values_order_unique
  on public.product_option_values (organization_id, option_group_id, display_order);
create index product_option_values_read_idx
  on public.product_option_values (organization_id, option_group_id, status, display_order, id);

create table public.product_option_value_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  option_group_id uuid not null,
  option_value_id uuid not null,
  alias text not null,
  normalized_alias text generated always as (
    lower(regexp_replace(btrim(alias), '[[:space:]]+', ' ', 'g'))
  ) stored,
  status text not null default 'active',
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_option_value_aliases_tenant_id_unique unique (organization_id, id),
  constraint product_option_value_aliases_value_fk foreign key (
    organization_id, option_group_id, option_value_id
  ) references public.product_option_values (
    organization_id, option_group_id, id
  ) on delete restrict,
  constraint product_option_value_aliases_alias_check check (
    alias = btrim(alias) and char_length(alias) between 1 and 40 and alias !~ '[[:cntrl:]]'
  ),
  constraint product_option_value_aliases_status_check check (status in ('active', 'archived'))
);

create unique index product_option_value_aliases_group_alias_unique
  on public.product_option_value_aliases (organization_id, option_group_id, normalized_alias);
create index product_option_value_aliases_value_idx
  on public.product_option_value_aliases (organization_id, option_value_id, status, id);

create table public.sku_option_assignments (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null,
  sku_id uuid not null,
  option_group_id uuid not null,
  option_value_id uuid not null,
  status text not null default 'active',
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, sku_id, option_group_id),
  constraint sku_option_assignments_sku_fk foreign key (organization_id, product_id, sku_id)
    references public.skus (organization_id, product_id, id) on delete restrict,
  constraint sku_option_assignments_group_fk foreign key (organization_id, product_id, option_group_id)
    references public.product_option_groups (organization_id, product_id, id) on delete restrict,
  constraint sku_option_assignments_value_fk foreign key (
    organization_id, option_group_id, option_value_id
  ) references public.product_option_values (
    organization_id, option_group_id, id
  ) on delete restrict,
  constraint sku_option_assignments_status_check check (status in ('active', 'archived')),
  constraint sku_option_assignments_version_check check (version >= 1)
);

create index sku_option_assignments_product_idx
  on public.sku_option_assignments (organization_id, product_id, status, sku_id);
create index sku_option_assignments_value_idx
  on public.sku_option_assignments (organization_id, option_value_id, status, sku_id);

create table public.sku_variant_images (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null,
  sku_id uuid not null,
  product_image_id uuid not null,
  sort_order smallint not null default 1,
  is_primary boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (organization_id, sku_id, product_image_id),
  constraint sku_variant_images_sku_fk foreign key (organization_id, product_id, sku_id)
    references public.skus (organization_id, product_id, id) on delete restrict,
  constraint sku_variant_images_product_image_fk foreign key (
    organization_id, product_id, product_image_id
  ) references public.product_images (
    organization_id, product_id, id
  ) on delete restrict,
  constraint sku_variant_images_sort_order_check check (sort_order between 1 and 9)
);

create unique index sku_variant_images_sort_order_unique
  on public.sku_variant_images (organization_id, sku_id, sort_order);
create unique index sku_variant_images_one_primary_unique
  on public.sku_variant_images (organization_id, sku_id)
  where is_primary;
create index sku_variant_images_product_idx
  on public.sku_variant_images (organization_id, product_id, sku_id, sort_order);
create index sku_variant_images_image_idx
  on public.sku_variant_images (organization_id, product_image_id, sku_id);

create or replace function private.enforce_variant_collection_limits()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.status <> 'active' then
    return new;
  end if;

  if tg_table_name = 'product_option_groups' then
    perform pg_advisory_xact_lock(hashtextextended(
      'variant-group:' || new.organization_id::text || ':' || new.product_id::text, 0
    ));
    select count(*) into v_count
    from public.product_option_groups g
    where g.organization_id = new.organization_id
      and g.product_id = new.product_id
      and g.status = 'active'
      and g.id <> new.id;
    if v_count >= 3 then
      raise exception 'variant_option_group_limit_exceeded' using errcode = '23514';
    end if;
  elsif tg_table_name = 'product_option_values' then
    perform pg_advisory_xact_lock(hashtextextended(
      'variant-value:' || new.organization_id::text || ':' || new.option_group_id::text, 0
    ));
    select count(*) into v_count
    from public.product_option_values v
    where v.organization_id = new.organization_id
      and v.option_group_id = new.option_group_id
      and v.status = 'active'
      and v.id <> new.id;
    if v_count >= 12 then
      raise exception 'variant_option_value_limit_exceeded' using errcode = '23514';
    end if;
  elsif tg_table_name = 'product_option_value_aliases' then
    perform pg_advisory_xact_lock(hashtextextended(
      'variant-alias:' || new.organization_id::text || ':' || new.option_value_id::text, 0
    ));
    select count(*) into v_count
    from public.product_option_value_aliases a
    where a.organization_id = new.organization_id
      and a.option_value_id = new.option_value_id
      and a.status = 'active'
      and a.id <> new.id;
    if v_count >= 12 then
      raise exception 'variant_option_alias_limit_exceeded' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.validate_sku_option_assignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'active' and not exists (
    select 1
    from public.products p
    join public.product_option_groups g
      on g.organization_id = p.organization_id
     and g.product_id = p.id
     and g.id = new.option_group_id
     and g.status = 'active'
    join public.product_option_values v
      on v.organization_id = g.organization_id
     and v.option_group_id = g.id
     and v.id = new.option_value_id
     and v.status = 'active'
    where p.organization_id = new.organization_id
      and p.id = new.product_id
      and p.structure_type = 'variant'
  ) then
    raise exception 'invalid_or_inactive_variant_assignment' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_variant_master_archive_in_use()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status = 'archived' then
    if tg_table_name = 'product_option_groups' and exists (
      select 1 from public.sku_option_assignments a
      where a.organization_id = old.organization_id
        and a.option_group_id = old.id
        and a.status = 'active'
    ) then
      raise exception 'variant_option_group_in_use' using errcode = '23514';
    elsif tg_table_name = 'product_option_values' and exists (
      select 1 from public.sku_option_assignments a
      where a.organization_id = old.organization_id
        and a.option_value_id = old.id
        and a.status = 'active'
    ) then
      raise exception 'variant_option_value_in_use' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.validate_variant_combination_uniqueness()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected_count integer;
  v_assigned_count integer;
  v_signature text;
begin
  if new.status <> 'active' then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'variant-combination:' || new.organization_id::text || ':' || new.product_id::text, 0
  ));

  select count(*) into v_expected_count
  from public.product_option_groups g
  where g.organization_id = new.organization_id
    and g.product_id = new.product_id
    and g.status = 'active';

  select count(*), string_agg(
    a.option_group_id::text || '=' || a.option_value_id::text,
    ',' order by a.option_group_id
  ) into v_assigned_count, v_signature
  from public.sku_option_assignments a
  join public.product_option_groups g
    on g.organization_id = a.organization_id
   and g.id = a.option_group_id
   and g.product_id = a.product_id
   and g.status = 'active'
  where a.organization_id = new.organization_id
    and a.product_id = new.product_id
    and a.sku_id = new.sku_id
    and a.status = 'active';

  if v_expected_count = 0 or v_assigned_count <> v_expected_count then
    return null;
  end if;

  if exists (
    select 1
    from public.skus s
    where s.organization_id = new.organization_id
      and s.product_id = new.product_id
      and s.id <> new.sku_id
      and s.status <> 'archived'
      and (
        select case when count(*) = v_expected_count then string_agg(
          a2.option_group_id::text || '=' || a2.option_value_id::text,
          ',' order by a2.option_group_id
        ) end
        from public.sku_option_assignments a2
        join public.product_option_groups g2
          on g2.organization_id = a2.organization_id
         and g2.id = a2.option_group_id
         and g2.product_id = a2.product_id
         and g2.status = 'active'
        where a2.organization_id = s.organization_id
          and a2.product_id = s.product_id
          and a2.sku_id = s.id
          and a2.status = 'active'
      ) = v_signature
  ) then
    raise exception 'duplicate_variant_combination' using errcode = '23505';
  end if;

  return null;
end;
$$;

create or replace function private.enforce_sku_code_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.sku_code is distinct from old.sku_code then
    raise exception 'sku_code_is_immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_variant_collection_limits()
  from public, anon, authenticated, service_role;
revoke all on function private.validate_sku_option_assignment()
  from public, anon, authenticated, service_role;
revoke all on function private.prevent_variant_master_archive_in_use()
  from public, anon, authenticated, service_role;
revoke all on function private.validate_variant_combination_uniqueness()
  from public, anon, authenticated, service_role;
revoke all on function private.enforce_sku_code_immutable()
  from public, anon, authenticated, service_role;

create trigger enforce_product_option_group_limit
before insert or update on public.product_option_groups
for each row execute function private.enforce_variant_collection_limits();
create trigger enforce_product_option_value_limit
before insert or update on public.product_option_values
for each row execute function private.enforce_variant_collection_limits();
create trigger enforce_product_option_alias_limit
before insert or update on public.product_option_value_aliases
for each row execute function private.enforce_variant_collection_limits();

create trigger prevent_product_option_group_archive_in_use
before update on public.product_option_groups
for each row execute function private.prevent_variant_master_archive_in_use();
create trigger prevent_product_option_value_archive_in_use
before update on public.product_option_values
for each row execute function private.prevent_variant_master_archive_in_use();

create trigger validate_sku_option_assignment
before insert or update on public.sku_option_assignments
for each row execute function private.validate_sku_option_assignment();
create constraint trigger validate_variant_combination_uniqueness
after insert or update on public.sku_option_assignments
deferrable initially deferred
for each row execute function private.validate_variant_combination_uniqueness();

create trigger enforce_sku_code_immutable
before update on public.skus
for each row execute function private.enforce_sku_code_immutable();

create trigger prevent_product_option_group_delete
before delete on public.product_option_groups
for each row execute function private.prevent_product_sku_delete();
create trigger prevent_product_option_value_delete
before delete on public.product_option_values
for each row execute function private.prevent_product_sku_delete();
create trigger prevent_product_option_value_alias_delete
before delete on public.product_option_value_aliases
for each row execute function private.prevent_product_sku_delete();
create trigger prevent_sku_option_assignment_delete
before delete on public.sku_option_assignments
for each row execute function private.prevent_product_sku_delete();
create trigger prevent_sku_variant_image_delete
before delete on public.sku_variant_images
for each row execute function private.prevent_product_sku_delete();

alter table public.product_option_groups enable row level security;
alter table public.product_option_values enable row level security;
alter table public.product_option_value_aliases enable row level security;
alter table public.sku_option_assignments enable row level security;
alter table public.sku_variant_images enable row level security;

revoke all privileges on table
  public.product_option_groups, public.product_option_values,
  public.product_option_value_aliases, public.sku_option_assignments,
  public.sku_variant_images
from public, anon, authenticated;

grant select on table
  public.product_option_groups, public.product_option_values,
  public.product_option_value_aliases, public.sku_option_assignments,
  public.sku_variant_images
to authenticated;

create policy product_option_groups_read
on public.product_option_groups for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy product_option_values_read
on public.product_option_values for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy product_option_value_aliases_read
on public.product_option_value_aliases for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy sku_option_assignments_read
on public.sku_option_assignments for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy sku_variant_images_read
on public.sku_variant_images for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));

comment on table public.product_option_groups is
  'A3 structured Product Variant dimensions such as color, size, or custom options; maximum three active groups per Product.';
comment on table public.product_option_values is
  'A3 values within a Product option group; maximum twelve active values per group.';
comment on table public.product_option_value_aliases is
  'A3 normalized user-facing aliases used later by deterministic Live CF resolution.';
comment on table public.sku_option_assignments is
  'A3 mapping from one SKU to one value per option group. Complete active combinations must be unique within Product.';
comment on table public.sku_variant_images is
  'A3 optional mapping from SKU combinations to ready Product image metadata.';
