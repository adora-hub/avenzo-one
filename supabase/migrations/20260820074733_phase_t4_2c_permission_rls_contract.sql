-- AVENZO ONE Phase T4.2C: granular read authority and browser write boundary.
-- Local draft only. Apply only after the Phase 2.1 Product/Inventory baseline
-- is present and PM has approved this migration and its test plan.

begin;

do $preflight$
declare
  v_required_relation text;
  v_required_policy record;
begin
  foreach v_required_relation in array array[
    'public.permissions', 'public.organization_roles', 'public.role_permissions',
    'public.products', 'public.skus', 'public.warehouses', 'public.locations',
    'public.inventory_commands', 'public.stock_movements',
    'public.inventory_balances', 'public.inventory_domain_events',
    'public.foundation_domain_events', 'public.sku_product_profiles',
    'public.sku_sell_units', 'public.sku_bundle_components',
    'public.sku_option_assignments', 'public.sku_variant_images',
    'public.sku_identifier_registry', 'public.sku_identifier_bindings'
  ] loop
    if to_regclass(v_required_relation) is null then
      raise exception 't4_2c_missing_baseline_relation:%', v_required_relation;
    end if;
  end loop;

  if to_regprocedure(
    'private.has_inventory_command_read_permission(uuid,uuid,uuid)'
  ) is null then
    raise exception 't4_2c_missing_inventory_command_read_helper';
  end if;

  for v_required_policy in
    select *
    from (values
      ('skus', 'skus_permission_select'),
      ('locations', 'locations_permission_select'),
      ('stock_movements', 'stock_movements_permission_select'),
      ('inventory_balances', 'inventory_balances_permission_select'),
      ('inventory_commands', 'inventory_commands_permission_select'),
      ('inventory_domain_events', 'inventory_domain_events_permission_select'),
      ('foundation_domain_events', 'foundation_domain_events_permission_select'),
      ('sku_product_profiles', 'sku_product_profiles_read'),
      ('sku_sell_units', 'sku_sell_units_read'),
      ('sku_bundle_components', 'sku_bundle_components_read'),
      ('sku_option_assignments', 'sku_option_assignments_read'),
      ('sku_variant_images', 'sku_variant_images_read'),
      ('sku_identifier_registry', 'sku_identifier_registry_read'),
      ('sku_identifier_bindings', 'sku_identifier_bindings_read')
    ) expected(tablename, policyname)
  loop
    if not exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_required_policy.tablename
        and p.policyname = v_required_policy.policyname
        and p.cmd = 'SELECT'
    ) then
      raise exception 't4_2c_missing_baseline_policy:%.%',
        v_required_policy.tablename, v_required_policy.policyname;
    end if;
  end loop;

  if to_regclass('public.inventory_locations') is not null
     or to_regclass('public.inventory_movements') is not null then
    raise exception 't4_2c_duplicate_inventory_alias_detected';
  end if;
end
$preflight$;

insert into public.permissions (code, resource, action, description)
values
  ('sku.read', 'sku', 'read', 'View SKU master data within an authorized organization'),
  ('location.read', 'location', 'read', 'View inventory locations within authorized branches'),
  ('inventory_batch.read', 'inventory_batch', 'read', 'View receive batches within authorized branches'),
  ('inventory_movement.read', 'inventory_movement', 'read', 'View inventory balances and movement ledger within authorized branches'),
  ('inventory_audit.read', 'inventory_audit', 'read', 'View inventory command and event audit evidence within authorized branches')
on conflict (code) do update set
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description;

-- Preserve the foundation Owner-all invariant for Organizations that existed
-- before this catalog entry. Admin remains denied until T4.3.
insert into public.role_permissions (role_id, permission_code)
select r.id, 'inventory_batch.read'
from public.organization_roles r
where r.code = 'owner'
on conflict (role_id, permission_code) do nothing;

-- Compatibility backfill only: each source permission already granted the
-- effective access being split by this migration.
insert into public.role_permissions (role_id, permission_code)
select rp.role_id, 'sku.read'
from public.role_permissions rp
where rp.permission_code = 'product.read'
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select rp.role_id, 'location.read'
from public.role_permissions rp
where rp.permission_code = 'warehouse.read'
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select rp.role_id, permission.permission_code
from public.role_permissions rp
cross join (values
  ('inventory_movement.read'),
  ('inventory_audit.read')
) permission(permission_code)
where rp.permission_code = 'inventory.read'
on conflict (role_id, permission_code) do nothing;

-- Preserve the same compatibility for future built-in Owner/Admin roles.
-- inventory_batch.read is intentionally not seeded before T4.3.
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
      'product.read', 'product.manage', 'sku.read',
      'warehouse.read', 'warehouse.manage', 'location.read',
      'inventory.read', 'inventory.receive', 'inventory.adjust',
      'inventory.transfer', 'inventory_movement.read',
      'inventory_audit.read'
    )
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.seed_foundation_domain_role_permissions()
  from public, anon, authenticated, service_role;

alter policy skus_permission_select on public.skus
  to authenticated
  using ((select private.has_org_permission(organization_id, 'sku.read', null)));
alter policy sku_product_profiles_read on public.sku_product_profiles
  to authenticated
  using ((select private.has_org_permission(organization_id, 'sku.read', null)));
alter policy sku_sell_units_read on public.sku_sell_units
  to authenticated
  using ((select private.has_org_permission(organization_id, 'sku.read', null)));
alter policy sku_bundle_components_read on public.sku_bundle_components
  to authenticated
  using ((select private.has_org_permission(organization_id, 'sku.read', null)));
alter policy sku_option_assignments_read on public.sku_option_assignments
  to authenticated
  using ((select private.has_org_permission(organization_id, 'sku.read', null)));
alter policy sku_variant_images_read on public.sku_variant_images
  to authenticated
  using ((select private.has_org_permission(organization_id, 'sku.read', null)));
alter policy sku_identifier_registry_read on public.sku_identifier_registry
  to authenticated
  using ((select private.has_org_permission(organization_id, 'sku.read', null)));
alter policy sku_identifier_bindings_read on public.sku_identifier_bindings
  to authenticated
  using ((select private.has_org_permission(organization_id, 'sku.read', null)));

alter policy locations_permission_select on public.locations
  to authenticated
  using ((select private.has_org_permission(
    organization_id, 'location.read', branch_id
  )));
alter policy stock_movements_permission_select on public.stock_movements
  to authenticated
  using ((select private.has_org_permission(
    organization_id, 'inventory_movement.read', branch_id
  )));
alter policy inventory_balances_permission_select on public.inventory_balances
  to authenticated
  using ((select private.has_org_permission(
    organization_id, 'inventory_movement.read', branch_id
  )));
alter policy inventory_domain_events_permission_select
  on public.inventory_domain_events
  to authenticated
  using (
    branch_id is not null
    and (select private.has_org_permission(
      organization_id, 'inventory_audit.read', branch_id
    ))
  );

create or replace function private.has_inventory_command_read_permission(
  p_organization_id uuid,
  p_source_location_id uuid,
  p_destination_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (p_source_location_id is not null or p_destination_location_id is not null)
    and (
      p_source_location_id is null
      or exists (
        select 1 from public.locations source_location
        where source_location.organization_id = p_organization_id
          and source_location.id = p_source_location_id
          and private.has_org_permission(
            p_organization_id, 'inventory_audit.read', source_location.branch_id
          )
      )
    )
    and (
      p_destination_location_id is null
      or exists (
        select 1 from public.locations destination_location
        where destination_location.organization_id = p_organization_id
          and destination_location.id = p_destination_location_id
          and private.has_org_permission(
            p_organization_id, 'inventory_audit.read', destination_location.branch_id
          )
      )
    );
$$;

revoke all on function private.has_inventory_command_read_permission(uuid, uuid, uuid)
  from public, anon;
grant execute on function private.has_inventory_command_read_permission(uuid, uuid, uuid)
  to authenticated;

alter policy foundation_domain_events_permission_select
  on public.foundation_domain_events
  to authenticated
  using (
    (entity_type = 'product' and (select private.has_org_permission(
      organization_id, 'product.read', null
    )))
    or (entity_type = 'sku' and (select private.has_org_permission(
      organization_id, 'sku.read', null
    )))
    or (
      entity_type = 'warehouse' and branch_id is not null
      and (select private.has_org_permission(
        organization_id, 'warehouse.read', branch_id
      ))
    )
    or (
      entity_type = 'location' and branch_id is not null
      and (select private.has_org_permission(
        organization_id, 'location.read', branch_id
      ))
    )
  );

-- Browser roles may read only through authenticated RLS. They cannot mutate
-- the command, ledger, balance, or inventory audit tables directly.
revoke all privileges on table
  public.inventory_commands,
  public.stock_movements,
  public.inventory_balances,
  public.inventory_domain_events
from public, anon;
revoke insert, update, delete, truncate, references, trigger on table
  public.inventory_commands,
  public.stock_movements,
  public.inventory_balances,
  public.inventory_domain_events
from authenticated;
grant select on table
  public.inventory_commands,
  public.stock_movements,
  public.inventory_balances,
  public.inventory_domain_events
to authenticated;

do $postflight$
declare
  v_policy record;
begin
  if (select count(*) from public.permissions where code in (
    'sku.read', 'location.read', 'inventory_batch.read',
    'inventory_movement.read', 'inventory_audit.read'
  )) <> 5 then
    raise exception 't4_2c_permission_catalog_incomplete';
  end if;

  if exists (
    select 1
    from public.organization_roles r
    where r.code = 'owner'
      and not exists (
        select 1
        from public.role_permissions rp
        where rp.role_id = r.id
          and rp.permission_code = 'inventory_batch.read'
      )
  ) then
    raise exception 't4_2c_owner_batch_catalog_inheritance_incomplete';
  end if;

  if exists (
    select 1
    from public.organization_roles r
    join public.role_permissions rp on rp.role_id = r.id
    where r.code = 'admin'
      and rp.permission_code = 'inventory_batch.read'
  ) then
    raise exception 't4_2c_admin_batch_permission_detected_before_t4_3';
  end if;

  if exists (
    select 1 from public.role_permissions legacy
    where legacy.permission_code = 'product.read'
      and not exists (
        select 1 from public.role_permissions replacement
        where replacement.role_id = legacy.role_id
          and replacement.permission_code = 'sku.read'
      )
  ) then
    raise exception 't4_2c_sku_compatibility_backfill_incomplete';
  end if;

  if exists (
    select 1 from public.role_permissions legacy
    where legacy.permission_code = 'warehouse.read'
      and not exists (
        select 1 from public.role_permissions replacement
        where replacement.role_id = legacy.role_id
          and replacement.permission_code = 'location.read'
      )
  ) then
    raise exception 't4_2c_location_compatibility_backfill_incomplete';
  end if;

  if exists (
    select 1 from public.role_permissions legacy
    where legacy.permission_code = 'inventory.read'
      and exists (
        select required.permission_code
        from (values
          ('inventory_movement.read'), ('inventory_audit.read')
        ) required(permission_code)
        where not exists (
          select 1 from public.role_permissions replacement
          where replacement.role_id = legacy.role_id
            and replacement.permission_code = required.permission_code
        )
      )
  ) then
    raise exception 't4_2c_inventory_compatibility_backfill_incomplete';
  end if;

  for v_policy in
    select *
    from (values
      ('skus', 'skus_permission_select', 'sku.read'),
      ('locations', 'locations_permission_select', 'location.read'),
      ('stock_movements', 'stock_movements_permission_select', 'inventory_movement.read'),
      ('inventory_balances', 'inventory_balances_permission_select', 'inventory_movement.read'),
      ('inventory_domain_events', 'inventory_domain_events_permission_select', 'inventory_audit.read'),
      ('sku_product_profiles', 'sku_product_profiles_read', 'sku.read'),
      ('sku_sell_units', 'sku_sell_units_read', 'sku.read'),
      ('sku_bundle_components', 'sku_bundle_components_read', 'sku.read'),
      ('sku_option_assignments', 'sku_option_assignments_read', 'sku.read'),
      ('sku_variant_images', 'sku_variant_images_read', 'sku.read'),
      ('sku_identifier_registry', 'sku_identifier_registry_read', 'sku.read'),
      ('sku_identifier_bindings', 'sku_identifier_bindings_read', 'sku.read')
    ) expected(tablename, policyname, permission_code)
  loop
    if not exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_policy.tablename
        and p.policyname = v_policy.policyname
        and p.cmd = 'SELECT'
        and p.roles = array['authenticated']::name[]
        and position(v_policy.permission_code in coalesce(p.qual, '')) > 0
    ) then
      raise exception 't4_2c_policy_verification_failed:%.%',
        v_policy.tablename, v_policy.policyname;
    end if;
  end loop;

  if exists (
    select 1
    from (values
      ('public.inventory_commands'), ('public.stock_movements'),
      ('public.inventory_balances'), ('public.inventory_domain_events')
    ) protected(relation_name)
    where has_table_privilege('anon', protected.relation_name, 'select')
       or has_table_privilege('anon', protected.relation_name, 'insert')
       or has_table_privilege('anon', protected.relation_name, 'update')
       or has_table_privilege('anon', protected.relation_name, 'delete')
       or has_table_privilege('authenticated', protected.relation_name, 'insert')
       or has_table_privilege('authenticated', protected.relation_name, 'update')
       or has_table_privilege('authenticated', protected.relation_name, 'delete')
       or not has_table_privilege('authenticated', protected.relation_name, 'select')
  ) then
    raise exception 't4_2c_browser_table_grant_verification_failed';
  end if;

  if to_regclass('public.inventory_locations') is not null
     or to_regclass('public.inventory_movements') is not null
     or to_regclass('public.inventory_receive_batches') is not null
     or to_regclass('public.inventory_receive_batch_items') is not null then
    raise exception 't4_2c_out_of_scope_schema_detected';
  end if;
end
$postflight$;

commit;

