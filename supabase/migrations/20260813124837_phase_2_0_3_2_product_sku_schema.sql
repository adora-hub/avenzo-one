-- Phase 2.0.3.2: Product/SKU master schema and permanent identifiers.
-- Production apply is intentionally outside this phase's approval boundary.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  description text,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_organization_id_id_unique unique (organization_id, id),
  constraint products_name_check check (
    name = btrim(name) and char_length(name) between 1 and 160
  ),
  constraint products_description_check check (
    description is null or description = btrim(description)
  ),
  constraint products_status_check check (status in ('draft', 'active', 'archived'))
);

create table public.skus (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null,
  sku_code text not null,
  name text not null,
  barcode text,
  sales_code text,
  base_unit_code text not null,
  quantity_scale smallint not null default 6,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint skus_organization_id_id_unique unique (organization_id, id),
  constraint skus_product_tenant_fk foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete restrict,
  constraint skus_sku_code_check check (
    sku_code = upper(btrim(sku_code))
    and char_length(sku_code) between 1 and 80
  ),
  constraint skus_name_check check (
    name = btrim(name) and char_length(name) between 1 and 160
  ),
  constraint skus_barcode_check check (
    barcode is null
    or (barcode = btrim(barcode) and char_length(barcode) between 1 and 128)
  ),
  constraint skus_sales_code_check check (
    sales_code is null
    or (
      sales_code = upper(btrim(sales_code))
      and char_length(sales_code) between 1 and 80
    )
  ),
  constraint skus_base_unit_code_check check (
    base_unit_code = lower(btrim(base_unit_code))
    and base_unit_code ~ '^[a-z][a-z0-9_]{0,31}$'
  ),
  constraint skus_quantity_scale_check check (quantity_scale = 6),
  constraint skus_status_check check (status in ('draft', 'active', 'archived')),
  constraint skus_organization_sku_code_unique unique (organization_id, sku_code)
);

create unique index skus_organization_barcode_unique
  on public.skus (organization_id, barcode)
  where barcode is not null;

create unique index skus_organization_sales_code_unique
  on public.skus (organization_id, sales_code)
  where sales_code is not null;

create index products_organization_status_updated_idx
  on public.products (organization_id, status, updated_at desc, id);

create index products_created_by_idx
  on public.products (created_by);

create index products_updated_by_idx
  on public.products (updated_by);

create index skus_product_status_updated_idx
  on public.skus (organization_id, product_id, status, updated_at desc, id);

create index skus_organization_status_updated_idx
  on public.skus (organization_id, status, updated_at desc, id);

create index skus_created_by_idx
  on public.skus (created_by);

create index skus_updated_by_idx
  on public.skus (updated_by);

create or replace function private.prepare_product_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.description := nullif(btrim(new.description), '');

  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, new.created_at);
  else
    if new.id is distinct from old.id then
      raise exception 'product_id_is_immutable' using errcode = '22023';
    end if;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'product_organization_is_immutable' using errcode = '22023';
    end if;
    if old.status = 'archived' then
      raise exception 'archived_product_is_immutable' using errcode = '22023';
    end if;
    if old.status = 'active' and new.status = 'draft' then
      raise exception 'invalid_product_status_transition' using errcode = '22023';
    end if;
    if new.status = 'active'
       and old.status is distinct from 'active'
       and not exists (
         select 1
         from public.skus s
         where s.organization_id = new.organization_id
           and s.product_id = new.id
           and s.status = 'active'
       ) then
      raise exception 'product_requires_active_sku' using errcode = '23514';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create or replace function private.prepare_sku_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.sku_code := upper(btrim(new.sku_code));
  new.name := btrim(new.name);
  new.barcode := nullif(btrim(new.barcode), '');
  new.sales_code := nullif(upper(btrim(new.sales_code)), '');
  new.base_unit_code := lower(btrim(new.base_unit_code));

  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, new.created_at);
  else
    if new.id is distinct from old.id then
      raise exception 'sku_id_is_immutable' using errcode = '22023';
    end if;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'sku_organization_is_immutable' using errcode = '22023';
    end if;
    if new.product_id is distinct from old.product_id then
      raise exception 'sku_product_is_immutable' using errcode = '22023';
    end if;
    if new.base_unit_code is distinct from old.base_unit_code
       or new.quantity_scale is distinct from old.quantity_scale then
      raise exception 'sku_base_unit_is_immutable' using errcode = '22023';
    end if;
    if old.sales_code is not null
       and new.sales_code is distinct from old.sales_code then
      raise exception 'sku_sales_code_is_permanent' using errcode = '22023';
    end if;
    if old.status = 'archived' then
      raise exception 'archived_sku_is_immutable' using errcode = '22023';
    end if;
    if old.status = 'active' and new.status = 'draft' then
      raise exception 'invalid_sku_status_transition' using errcode = '22023';
    end if;
    if new.status = 'active'
       and old.status is distinct from 'active'
       and exists (
         select 1
         from public.products p
         where p.organization_id = new.organization_id
           and p.id = new.product_id
           and p.status = 'archived'
       ) then
      raise exception 'archived_product_rejects_active_sku' using errcode = '23514';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create or replace function private.prevent_product_sku_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '%_hard_delete_forbidden', tg_table_name using errcode = '22023';
end;
$$;

revoke all on function private.prepare_product_write() from public, anon, authenticated;
revoke all on function private.prepare_sku_write() from public, anon, authenticated;
revoke all on function private.prevent_product_sku_delete() from public, anon, authenticated;

create trigger prepare_product_write
before insert or update on public.products
for each row execute function private.prepare_product_write();

create trigger prepare_sku_write
before insert or update on public.skus
for each row execute function private.prepare_sku_write();

create trigger prevent_product_delete
before delete on public.products
for each row execute function private.prevent_product_sku_delete();

create trigger prevent_sku_delete
before delete on public.skus
for each row execute function private.prevent_product_sku_delete();

alter table public.products enable row level security;
alter table public.skus enable row level security;

-- Phase 2.0.3.5 will add reviewed read policies and grants. Until then these
-- exposed-schema tables remain closed to Data API roles.
revoke all privileges on table public.products, public.skus from public, anon, authenticated;

comment on table public.products is
  'Phase 2.0 organization-owned product aggregate roots.';
comment on table public.skus is
  'Phase 2.0 stock identities; sku_code, barcode, and sales_code are lookup identifiers only.';
comment on column public.skus.sales_code is
  'Permanent customer-facing lookup code. Resolve to sku.id before any stock command.';
comment on column public.skus.barcode is
  'Optional organization-scoped lookup code. Resolve to sku.id before any stock command.';
