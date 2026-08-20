\set ON_ERROR_STOP on

begin;

do $contract_metadata$
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
    raise exception 't4_2c_existing_owner_batch_catalog_inheritance_missing';
  end if;

  if exists (
    select 1
    from public.organization_roles r
    join public.role_permissions rp on rp.role_id = r.id
    where r.code = 'admin'
      and rp.permission_code = 'inventory_batch.read'
  ) then
    raise exception 't4_2c_existing_admin_has_batch_permission_before_t4_3';
  end if;

  if exists (
    select 1
    from public.role_permissions legacy
    where legacy.permission_code = 'product.read'
      and not exists (
        select 1 from public.role_permissions replacement
        where replacement.role_id = legacy.role_id
          and replacement.permission_code = 'sku.read'
      )
  ) then
    raise exception 't4_2c_existing_product_reader_lost_sku_access';
  end if;

  if exists (
    select 1
    from public.role_permissions legacy
    where legacy.permission_code = 'warehouse.read'
      and not exists (
        select 1 from public.role_permissions replacement
        where replacement.role_id = legacy.role_id
          and replacement.permission_code = 'location.read'
      )
  ) then
    raise exception 't4_2c_existing_warehouse_reader_lost_location_access';
  end if;

  if exists (
    select 1
    from public.role_permissions legacy
    where legacy.permission_code = 'inventory.read'
      and exists (
        select required.permission_code
        from (values
          ('inventory_movement.read'),
          ('inventory_audit.read')
        ) required(permission_code)
        where not exists (
          select 1 from public.role_permissions replacement
          where replacement.role_id = legacy.role_id
            and replacement.permission_code = required.permission_code
        )
      )
  ) then
    raise exception 't4_2c_existing_inventory_reader_lost_access';
  end if;

  if to_regclass('public.inventory_locations') is not null
     or to_regclass('public.inventory_movements') is not null
     or (select array_agg(c.relname::text order by c.relname)
         from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relkind in ('r', 'p')
           and c.relname ilike '%batch%'
           and c.relname ~* '(inventory|stock|receive|receipt|movement)')
         is distinct from array[
             'inventory_receive_batch_items',
             'inventory_receive_batches'
           ]::text[] then
    raise exception 't4_2c_duplicate_alias_or_legacy_batch_table_created';
  end if;

  if (select array_agg(c.column_name::text order by c.ordinal_position)
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'inventory_receive_batches') is distinct from array[
          'id', 'organization_id', 'branch_id', 'batch_type',
          'idempotency_key', 'request_hash_version', 'request_hash',
          'reference', 'reason_code', 'reason_note', 'item_count',
          'actor_user_id', 'status', 'result', 'occurred_at',
          'created_at', 'completed_at'
        ]::text[]
     or (select array_agg(c.column_name::text order by c.ordinal_position)
         from information_schema.columns c
         where c.table_schema = 'public'
           and c.table_name = 'inventory_receive_batch_items') is distinct from array[
             'id', 'organization_id', 'branch_id', 'batch_id', 'line_no',
             'sku_id', 'warehouse_id', 'location_id', 'quantity',
             'base_unit_code', 'inventory_command_id', 'created_at'
           ]::text[] then
    raise exception 't4_2c_t4_4b_batch_table_structure_conflict';
  end if;

  if (select array_agg(p.policyname::text order by p.policyname)
      from pg_catalog.pg_policies p
      where p.schemaname = 'public'
        and p.tablename in (
          'inventory_receive_batches', 'inventory_receive_batch_items'
        )) is distinct from array[
          'inventory_receive_batch_items_permission_select',
          'inventory_receive_batches_permission_select'
        ]::text[]
     or (select count(*) from pg_catalog.pg_policies p
         where p.schemaname = 'public'
           and p.tablename in (
             'inventory_receive_batches', 'inventory_receive_batch_items'
           )
           and p.cmd = 'SELECT'
           and p.roles = array['authenticated']::name[]
           and position('inventory_batch.read' in coalesce(p.qual, '')) > 0) <> 2 then
    raise exception 't4_2c_t4_4b_batch_policy_surface_conflict';
  end if;

  if (select array_agg(c.relname || '.' || t.tgname order by c.relname, t.tgname)
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'inventory_receive_batches', 'inventory_receive_batch_items'
        )
        and not t.tgisinternal) is distinct from array[
          'inventory_receive_batch_items.guard_inventory_receive_batch_item_insert',
          'inventory_receive_batch_items.prevent_inventory_receive_batch_item_update_delete',
          'inventory_receive_batches.guard_inventory_receive_batch_update',
          'inventory_receive_batches.prevent_inventory_receive_batch_delete'
        ]::text[] then
    raise exception 't4_2c_t4_4b_batch_trigger_surface_conflict';
  end if;

  if (select count(*)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where (n.nspname, p.proname) in (
        ('private', 'require_inventory_receive_batch_context'),
        ('private', 'guard_inventory_receive_batch_update'),
        ('private', 'guard_inventory_receive_batch_item_insert'),
        ('public', 'server_receive_inventory_batch')
      )) <> 4
     or exists (
       select 1
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private')
         and p.proname ilike '%inventory%receive%batch%'
         and (n.nspname, p.proname) not in (
           ('private', 'require_inventory_receive_batch_context'),
           ('private', 'guard_inventory_receive_batch_update'),
           ('private', 'guard_inventory_receive_batch_item_insert'),
           ('public', 'server_receive_inventory_batch')
         )
     )
     or to_regprocedure(
       'public.server_receive_inventory_batch(jsonb,uuid)'
     ) is null
     or (select count(*)
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname like 'server%receive%batch%') <> 1 then
    raise exception 't4_2c_t4_4b_batch_function_or_rpc_surface_conflict';
  end if;

  if (select count(*)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'skus', 'locations', 'stock_movements', 'inventory_balances',
          'inventory_commands', 'inventory_domain_events',
          'foundation_domain_events'
        )
        and c.relrowsecurity) <> 7 then
    raise exception 't4_2c_rls_not_enabled_on_required_relations';
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
      select 1
      from pg_catalog.pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_policy.tablename
        and p.policyname = v_policy.policyname
        and p.cmd = 'SELECT'
        and p.roles = array['authenticated']::name[]
        and position(v_policy.permission_code in coalesce(p.qual, '')) > 0
    ) then
      raise exception 't4_2c_policy_contract_failed:%.%',
        v_policy.tablename,
        v_policy.policyname;
    end if;
  end loop;

  if position(
    'inventory_audit.read' in pg_get_functiondef(
      'private.has_inventory_command_read_permission(uuid,uuid,uuid)'::regprocedure
    )
  ) = 0 then
    raise exception 't4_2c_inventory_command_audit_authority_missing';
  end if;

  if exists (
    select 1
    from (values
      ('public.inventory_commands'),
      ('public.stock_movements'),
      ('public.inventory_balances'),
      ('public.inventory_domain_events')
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
    raise exception 't4_2c_browser_grant_contract_failed';
  end if;
end
$contract_metadata$;

do $fixtures$
declare
  v_owner_a uuid := '00000000-0000-4000-8000-000000000601';
  v_owner_b uuid := '00000000-0000-4000-8000-000000000602';
  v_product_reader uuid := '00000000-0000-4000-8000-000000000603';
  v_sku_reader uuid := '00000000-0000-4000-8000-000000000604';
  v_inventory_reader uuid := '00000000-0000-4000-8000-000000000605';
  v_org_a uuid := '00000000-0000-4000-8000-000000000610';
  v_org_b uuid := '00000000-0000-4000-8000-000000000611';
  v_branch_a1 uuid := '00000000-0000-4000-8000-000000000620';
  v_branch_a2 uuid := '00000000-0000-4000-8000-000000000621';
  v_branch_b1 uuid := '00000000-0000-4000-8000-000000000622';
  v_product_a uuid := '00000000-0000-4000-8000-000000000630';
  v_product_b uuid := '00000000-0000-4000-8000-000000000631';
  v_sku_a uuid := '00000000-0000-4000-8000-000000000640';
  v_sku_b uuid := '00000000-0000-4000-8000-000000000641';
  v_warehouse_a1 uuid := '00000000-0000-4000-8000-000000000650';
  v_warehouse_a2 uuid := '00000000-0000-4000-8000-000000000651';
  v_warehouse_b1 uuid := '00000000-0000-4000-8000-000000000652';
  v_location_a1 uuid;
  v_location_a2 uuid;
  v_location_b1 uuid;
  v_product_membership uuid;
  v_sku_membership uuid;
  v_inventory_membership uuid;
  v_staff_role uuid;
  v_viewer_role uuid;
  v_manager_role uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  )
  select id, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', email, '', now(), now(), now()
  from (values
    (v_owner_a, 't4-2c-owner-a@example.invalid'),
    (v_owner_b, 't4-2c-owner-b@example.invalid'),
    (v_product_reader, 't4-2c-product@example.invalid'),
    (v_sku_reader, 't4-2c-sku@example.invalid'),
    (v_inventory_reader, 't4-2c-inventory@example.invalid')
  ) users(id, email);

  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_owner_a, 'role', 'authenticated', 'aal', 'aal1'
  )::text, true);

  insert into public.organizations (id, name, slug, created_by) values
    (v_org_a, 'T4.2C Org A', 't4-2c-org-a', v_owner_a),
    (v_org_b, 'T4.2C Org B', 't4-2c-org-b', v_owner_b);

  insert into public.branches (id, organization_id, code, name, created_by) values
    (v_branch_a1, v_org_a, 'A1', 'Org A Branch 1', v_owner_a),
    (v_branch_a2, v_org_a, 'A2', 'Org A Branch 2', v_owner_a),
    (v_branch_b1, v_org_b, 'B1', 'Org B Branch 1', v_owner_b);

  insert into public.organization_members (
    organization_id, user_id, membership_status, scope
  ) values (v_org_a, v_product_reader, 'active', 'organization')
  returning id into v_product_membership;

  insert into public.organization_members (
    organization_id, user_id, membership_status, scope
  ) values (v_org_a, v_sku_reader, 'active', 'organization')
  returning id into v_sku_membership;

  insert into public.organization_members (
    organization_id, user_id, membership_status, scope
  ) values (v_org_a, v_inventory_reader, 'active', 'branch')
  returning id into v_inventory_membership;

  select id into strict v_staff_role from public.organization_roles
  where organization_id = v_org_a and code = 'staff';
  select id into strict v_viewer_role from public.organization_roles
  where organization_id = v_org_a and code = 'viewer';
  select id into strict v_manager_role from public.organization_roles
  where organization_id = v_org_a and code = 'manager';

  insert into public.member_roles (membership_id, role_id, assigned_by) values
    (v_product_membership, v_staff_role, v_owner_a),
    (v_sku_membership, v_viewer_role, v_owner_a),
    (v_inventory_membership, v_manager_role, v_owner_a);

  insert into public.member_branches (membership_id, branch_id)
  values (v_inventory_membership, v_branch_a1);

  delete from public.role_permissions
  where role_id in (v_staff_role, v_viewer_role, v_manager_role)
    and permission_code in (
      'product.read', 'sku.read', 'warehouse.read', 'location.read',
      'inventory.read', 'inventory_batch.read',
      'inventory_movement.read', 'inventory_audit.read'
    );

  insert into public.role_permissions (role_id, permission_code) values
    (v_staff_role, 'product.read'),
    (v_viewer_role, 'sku.read'),
    (v_manager_role, 'location.read'),
    (v_manager_role, 'inventory_movement.read'),
    (v_manager_role, 'inventory_audit.read');

  insert into public.products (id, organization_id, name, created_by) values
    (v_product_a, v_org_a, 'Org A Product', v_owner_a),
    (v_product_b, v_org_b, 'Org B Product', v_owner_b);

  insert into public.skus (
    id, organization_id, product_id, sku_code, name,
    base_unit_code, status, created_by
  ) values
    (v_sku_a, v_org_a, v_product_a, 'T42C-A', 'Org A SKU', 'piece', 'active', v_owner_a),
    (v_sku_b, v_org_b, v_product_b, 'T42C-B', 'Org B SKU', 'piece', 'active', v_owner_b);

  update public.products set status = 'active'
  where id in (v_product_a, v_product_b);

  insert into public.warehouses (
    id, organization_id, branch_id, code, name, created_by
  ) values
    (v_warehouse_a1, v_org_a, v_branch_a1, 'A1-WH', 'A1 Warehouse', v_owner_a),
    (v_warehouse_a2, v_org_a, v_branch_a2, 'A2-WH', 'A2 Warehouse', v_owner_a),
    (v_warehouse_b1, v_org_b, v_branch_b1, 'B1-WH', 'B1 Warehouse', v_owner_b);

  select id into strict v_location_a1 from public.locations
  where warehouse_id = v_warehouse_a1 and is_default;
  select id into strict v_location_a2 from public.locations
  where warehouse_id = v_warehouse_a2 and is_default;
  select id into strict v_location_b1 from public.locations
  where warehouse_id = v_warehouse_b1 and is_default;

  perform private.post_inventory_command(
    '00000000-0000-4000-8000-000000000670', v_org_a, 'receive', v_sku_a,
    null, v_location_a1, 10, 't4_2c_fixture', null,
    repeat('a', 64), v_owner_a, now()
  );
  perform private.post_inventory_command(
    '00000000-0000-4000-8000-000000000671', v_org_a, 'receive', v_sku_a,
    null, v_location_a2, 20, 't4_2c_fixture', null,
    repeat('b', 64), v_owner_a, now()
  );
  perform private.post_inventory_command(
    '00000000-0000-4000-8000-000000000672', v_org_b, 'receive', v_sku_b,
    null, v_location_b1, 30, 't4_2c_fixture', null,
    repeat('c', 64), v_owner_b, now()
  );

  if (select count(*) from public.role_permissions rp
      join public.organization_roles r on r.id = rp.role_id
      where r.organization_id = v_org_a
        and r.code = 'admin'
        and rp.permission_code in (
          'sku.read', 'location.read',
          'inventory_movement.read', 'inventory_audit.read'
        )) <> 4 then
    raise exception 't4_2c_future_admin_seed_compatibility_failed';
  end if;

  if not exists (
    select 1
    from public.role_permissions rp
    join public.organization_roles r on r.id = rp.role_id
    where r.organization_id = v_org_a
      and r.code = 'owner'
      and rp.permission_code = 'inventory_batch.read'
  ) then
    raise exception 't4_2c_owner_batch_catalog_inheritance_missing';
  end if;

  if exists (
    select 1
    from public.role_permissions rp
    join public.organization_roles r on r.id = rp.role_id
    where r.organization_id = v_org_a
      and r.code = 'admin'
      and rp.permission_code = 'inventory_batch.read'
  ) then
    raise exception 't4_2c_admin_received_batch_permission_before_t4_3';
  end if;
end
$fixtures$;

-- A new product.read-only assignment after cutover does not imply sku.read.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000603', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000603","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
do $product_only$
begin
  if (select count(*) from public.products) <> 1
     or exists (select 1 from public.skus) then
    raise exception 't4_2c_product_and_sku_authorities_not_independent';
  end if;
end
$product_only$;
reset role;

-- sku.read is tenant-safe and does not grant Product-root access.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000604', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000604","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
do $sku_only$
begin
  if exists (select 1 from public.products)
     or (select count(*) from public.skus) <> 1
     or exists (
       select 1 from public.skus
       where organization_id <> '00000000-0000-4000-8000-000000000610'
     ) then
    raise exception 't4_2c_sku_tenant_isolation_failed';
  end if;
end
$sku_only$;
reset role;

-- Granular Location/Movement/Audit authorities obey assigned Branch scope.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000605', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000605","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
do $inventory_branch_scope$
begin
  if not exists (select 1 from public.locations)
     or exists (
       select 1 from public.locations
       where branch_id <> '00000000-0000-4000-8000-000000000620'
     )
     or (select count(*) from public.stock_movements) <> 1
     or (select count(*) from public.inventory_balances) <> 1
     or (select count(*) from public.inventory_commands) <> 1
     or (select count(*) from public.inventory_domain_events) <> 1 then
    raise exception 't4_2c_inventory_tenant_or_branch_isolation_failed';
  end if;

  begin
    insert into public.stock_movements default values;
    raise exception 'expected_browser_stock_movement_insert_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.stock_movements set reason_code = reason_code;
    raise exception 'expected_browser_stock_movement_update_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.stock_movements;
    raise exception 'expected_browser_stock_movement_delete_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.inventory_balances default values;
    raise exception 'expected_browser_inventory_balance_insert_denial';
  exception when insufficient_privilege then null;
  end;
end
$inventory_branch_scope$;
reset role;

set local role anon;
do $anon_denial$
begin
  begin
    perform count(*) from public.skus;
    raise exception 'expected_anon_sku_select_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    perform count(*) from public.locations;
    raise exception 'expected_anon_location_select_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    perform count(*) from public.stock_movements;
    raise exception 'expected_anon_movement_select_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    perform count(*) from public.inventory_balances;
    raise exception 'expected_anon_balance_select_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    perform count(*) from public.inventory_domain_events;
    raise exception 'expected_anon_inventory_event_select_denial';
  exception when insufficient_privilege then null;
  end;
end
$anon_denial$;
reset role;

do $final_assertions$
begin
  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename in (
        'inventory_commands', 'stock_movements',
        'inventory_balances', 'inventory_domain_events'
      )
      and p.cmd <> 'SELECT'
      and (
        'authenticated' = any(p.roles)
        or 'anon' = any(p.roles)
        or 'public' = any(p.roles)
      )
  ) then
    raise exception 't4_2c_browser_write_policy_detected';
  end if;

  raise notice 'PHASE_T4_2C_PERMISSION_RLS_CONTRACT_TESTS_PASSED';
end
$final_assertions$;

rollback;
