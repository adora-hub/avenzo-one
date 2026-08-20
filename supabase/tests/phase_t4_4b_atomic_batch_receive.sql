\set ON_ERROR_STOP on

-- T4.4B Local Draft. This file is not authorized to run until PM approves G12.
-- True two-session concurrency is an isolated-harness gate; this SQL verifies
-- deterministic locking/canonicalization plus all single-session contracts.

begin;

do $contract_metadata$
declare
  v_function_definition text;
begin
  if to_regclass('public.inventory_receive_batches') is null
     or to_regclass('public.inventory_receive_batch_items') is null
     or to_regprocedure('public.server_receive_inventory_batch(jsonb,uuid)') is null then
    raise exception 't4_4b_contract_surface_missing';
  end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public'
        and table_name = 'inventory_receive_batches'
        and column_name in (
          'id', 'organization_id', 'branch_id', 'batch_type',
          'idempotency_key', 'request_hash_version', 'request_hash',
          'reference', 'reason_code', 'reason_note', 'item_count',
          'actor_user_id', 'status', 'result', 'occurred_at',
          'created_at', 'completed_at'
        )) <> 17 then
    raise exception 't4_4b_batch_header_contract_incomplete';
  end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public'
        and table_name = 'inventory_receive_batch_items'
        and column_name in (
          'id', 'organization_id', 'branch_id', 'batch_id', 'line_no',
          'sku_id', 'warehouse_id', 'location_id', 'quantity',
          'base_unit_code', 'inventory_command_id', 'created_at'
        )) <> 12 then
    raise exception 't4_4b_batch_item_contract_incomplete';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.inventory_receive_batches'::regclass
      and c.conname = 'inventory_receive_batches_item_count_check'
      and pg_get_constraintdef(c.oid) like '%item_count >= 1%item_count <= 100%'
  ) then
    raise exception 't4_4b_item_cardinality_is_not_1_to_100';
  end if;

  if exists (
    select 1 from public.organization_roles r
    where r.code = 'owner'
      and not exists (
        select 1 from public.role_permissions rp
        where rp.role_id = r.id
          and rp.permission_code = 'inventory_batch.read'
      )
  ) or exists (
    select 1 from public.organization_roles r
    join public.role_permissions rp on rp.role_id = r.id
    where r.code = 'admin'
      and rp.permission_code = 'inventory_batch.read'
  ) or position(
    'inventory_batch.read' in pg_get_functiondef(
      'private.seed_foundation_domain_role_permissions()'::regprocedure
    )
  ) = 0 then
    raise exception 't4_4b_owner_admin_batch_baseline_invalid';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.inventory_receive_batch_items'::regclass
      and c.conname = 'inventory_receive_batch_items_pair_unique'
      and c.contype = 'u'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.inventory_receive_batch_items'::regclass
      and c.conname = 'inventory_receive_batch_items_command_unique'
      and c.contype = 'u'
  ) then
    raise exception 't4_4b_duplicate_or_command_lineage_constraint_missing';
  end if;

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'public.inventory_receive_batches'::regclass
  ) or not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'public.inventory_receive_batch_items'::regclass
  ) then
    raise exception 't4_4b_batch_rls_disabled';
  end if;

  if (select count(*) from pg_catalog.pg_policies p
      where p.schemaname = 'public'
        and p.tablename in (
          'inventory_receive_batches', 'inventory_receive_batch_items'
        )
        and p.cmd = 'SELECT'
        and p.roles = array['authenticated']::name[]
        and position('inventory_batch.read' in coalesce(p.qual, '')) > 0) <> 2 then
    raise exception 't4_4b_batch_rls_policy_invalid';
  end if;

  if exists (
    select 1
    from (values
      ('public.inventory_receive_batches'),
      ('public.inventory_receive_batch_items')
    ) protected(relation_name)
    where has_table_privilege('anon', protected.relation_name, 'select')
       or has_table_privilege('anon', protected.relation_name, 'insert')
       or has_table_privilege('authenticated', protected.relation_name, 'insert')
       or has_table_privilege('authenticated', protected.relation_name, 'update')
       or has_table_privilege('authenticated', protected.relation_name, 'delete')
       or not has_table_privilege('authenticated', protected.relation_name, 'select')
       or has_table_privilege('service_role', protected.relation_name, 'select')
       or has_table_privilege('service_role', protected.relation_name, 'insert')
       or has_table_privilege('service_role', protected.relation_name, 'update')
       or has_table_privilege('service_role', protected.relation_name, 'delete')
  ) then
    raise exception 't4_4b_data_api_or_service_table_grant_open';
  end if;

  if has_function_privilege(
       'anon', 'public.server_receive_inventory_batch(jsonb,uuid)', 'execute'
     )
     or has_function_privilege(
       'authenticated', 'public.server_receive_inventory_batch(jsonb,uuid)', 'execute'
     )
     or not has_function_privilege(
       'service_role', 'public.server_receive_inventory_batch(jsonb,uuid)', 'execute'
     ) then
    raise exception 't4_4b_rpc_grant_contract_failed';
  end if;

  v_function_definition := pg_get_functiondef(
    'public.server_receive_inventory_batch(jsonb,uuid)'::regprocedure
  );
  if position('security definer' in lower(v_function_definition)) = 0
     or not exists (
       select 1
       from pg_catalog.pg_proc p,
         unnest(coalesce(p.proconfig, array[]::text[])) as config(setting)
       where p.oid = 'public.server_receive_inventory_batch(jsonb,uuid)'::regprocedure
         and config.setting in ('search_path=', 'search_path=""')
     )
     or position('inventory.receive' in v_function_definition) = 0
     or position('private.server_actor_has_org_permission' in v_function_definition) = 0
     or position('private.post_inventory_command' in v_function_definition) = 0
     or position('for update' in lower(v_function_definition)) = 0
     or position('for key share' in lower(v_function_definition)) = 0
     or position('order by' in lower(v_function_definition)) = 0
     or position('batch_receive_duplicate_sku_location' in v_function_definition) = 0
     or position('batch_receive_idempotency_conflict' in v_function_definition) = 0 then
    raise exception 't4_4b_atomic_or_concurrency_source_contract_missing';
  end if;

  if to_regclass('public.inventory_locations') is not null
     or to_regclass('public.inventory_movements') is not null
     or (select count(*) from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname like 'server%receive%batch%') <> 1 then
    raise exception 't4_4b_duplicate_inventory_or_rpc_surface_detected';
  end if;
end
$contract_metadata$;

do $fixtures$
declare
  v_owner_a uuid := '00000000-0000-4000-8000-000000000901';
  v_staff_a uuid := '00000000-0000-4000-8000-000000000902';
  v_owner_b uuid := '00000000-0000-4000-8000-000000000903';
  v_org_a uuid := '00000000-0000-4000-8000-000000000910';
  v_org_b uuid := '00000000-0000-4000-8000-000000000911';
  v_branch_a1 uuid := '00000000-0000-4000-8000-000000000920';
  v_branch_a2 uuid := '00000000-0000-4000-8000-000000000921';
  v_branch_b1 uuid := '00000000-0000-4000-8000-000000000922';
  v_product_standard uuid := '00000000-0000-4000-8000-000000000930';
  v_product_variant uuid := '00000000-0000-4000-8000-000000000931';
  v_product_bundle uuid := '00000000-0000-4000-8000-000000000932';
  v_product_draft uuid := '00000000-0000-4000-8000-000000000933';
  v_product_b uuid := '00000000-0000-4000-8000-000000000934';
  v_sku_standard uuid := '00000000-0000-4000-8000-000000000940';
  v_sku_variant uuid := '00000000-0000-4000-8000-000000000941';
  v_sku_bundle uuid := '00000000-0000-4000-8000-000000000942';
  v_sku_draft uuid := '00000000-0000-4000-8000-000000000943';
  v_sku_b uuid := '00000000-0000-4000-8000-000000000944';
  v_warehouse_a1 uuid := '00000000-0000-4000-8000-000000000950';
  v_warehouse_a2 uuid := '00000000-0000-4000-8000-000000000951';
  v_warehouse_b1 uuid := '00000000-0000-4000-8000-000000000952';
  v_location_a1 uuid;
  v_location_a2 uuid;
  v_location_b1 uuid;
  v_staff_membership uuid;
  v_staff_role uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  )
  select id, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', email, '', now(), now(), now()
  from (values
    (v_owner_a, 't4-4b-owner-a@example.invalid'),
    (v_staff_a, 't4-4b-staff-a@example.invalid'),
    (v_owner_b, 't4-4b-owner-b@example.invalid')
  ) users(id, email);

  insert into public.organizations (id, name, slug, created_by) values
    (v_org_a, 'T4.4B Organization A', 't4-4b-organization-a', v_owner_a),
    (v_org_b, 'T4.4B Organization B', 't4-4b-organization-b', v_owner_b);

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner_a::text, 'role', 'authenticated', 'aal', 'aal1'
    )::text,
    true
  );
  insert into public.branches (id, organization_id, code, name, created_by) values
    (v_branch_a1, v_org_a, 'A1', 'Organization A Branch 1', v_owner_a),
    (v_branch_a2, v_org_a, 'A2', 'Organization A Branch 2', v_owner_a),
    (v_branch_b1, v_org_b, 'B1', 'Organization B Branch 1', v_owner_b);
  if (select count(*) from public.branches
      where (organization_id, id) in (
        (v_org_a, v_branch_a1), (v_org_a, v_branch_a2),
        (v_org_b, v_branch_b1)
      )) <> 3 then
    raise exception 't4_4b_branch_fixture_scope_invalid';
  end if;
  perform set_config('request.jwt.claims', '', true);

  insert into public.products (
    id, organization_id, name, status, structure_type, created_by
  ) values
    (v_product_standard, v_org_a, 'Standard Product', 'active', 'standard', v_owner_a),
    (v_product_variant, v_org_a, 'Variant Product', 'active', 'variant', v_owner_a),
    (v_product_bundle, v_org_a, 'Bundle Product', 'active', 'bundle', v_owner_a),
    (v_product_draft, v_org_a, 'Draft Product', 'draft', 'standard', v_owner_a),
    (v_product_b, v_org_b, 'Foreign Product', 'active', 'standard', v_owner_b);

  insert into public.skus (
    id, organization_id, product_id, sku_code, name,
    base_unit_code, status, created_by
  ) values
    (v_sku_standard, v_org_a, v_product_standard, 'T44-STD', 'Standard SKU', 'piece', 'active', v_owner_a),
    (v_sku_variant, v_org_a, v_product_variant, 'T44-VAR', 'Variant SKU', 'piece', 'active', v_owner_a),
    (v_sku_bundle, v_org_a, v_product_bundle, 'T44-BND', 'Bundle SKU', 'piece', 'active', v_owner_a),
    (v_sku_draft, v_org_a, v_product_draft, 'T44-DRF', 'Draft SKU', 'piece', 'draft', v_owner_a),
    (v_sku_b, v_org_b, v_product_b, 'T44-B', 'Foreign SKU', 'piece', 'active', v_owner_b);

  insert into public.warehouses (
    id, organization_id, branch_id, code, name, created_by
  ) values
    (v_warehouse_a1, v_org_a, v_branch_a1, 'A1-WH', 'A1 Warehouse', v_owner_a),
    (v_warehouse_a2, v_org_a, v_branch_a2, 'A2-WH', 'A2 Warehouse', v_owner_a),
    (v_warehouse_b1, v_org_b, v_branch_b1, 'B1-WH', 'B1 Warehouse', v_owner_b);

  select id into strict v_location_a1 from public.locations
  where organization_id = v_org_a and warehouse_id = v_warehouse_a1 and is_default;
  select id into strict v_location_a2 from public.locations
  where organization_id = v_org_a and warehouse_id = v_warehouse_a2 and is_default;
  select id into strict v_location_b1 from public.locations
  where organization_id = v_org_b and warehouse_id = v_warehouse_b1 and is_default;

  insert into public.organization_members (
    organization_id, user_id, membership_status, scope
  ) values (v_org_a, v_staff_a, 'active', 'branch')
  returning id into v_staff_membership;
  select id into strict v_staff_role from public.organization_roles
  where organization_id = v_org_a and code = 'staff';
  insert into public.member_roles (membership_id, role_id, assigned_by)
  values (v_staff_membership, v_staff_role, v_owner_a);
  insert into public.member_branches (membership_id, branch_id)
  values (v_staff_membership, v_branch_a1);
  insert into public.role_permissions (role_id, permission_code)
  values (v_staff_role, 'inventory.receive')
  on conflict do nothing;

  perform set_config('test.t4_4b.location_a1', v_location_a1::text, true);
  perform set_config('test.t4_4b.location_a2', v_location_a2::text, true);
  perform set_config('test.t4_4b.location_b1', v_location_b1::text, true);
  perform set_config(
    'test.t4_4b.staff_membership', v_staff_membership::text, true
  );
end
$fixtures$;

set local role service_role;

do $trusted_happy_idempotency$
declare
  v_owner_a uuid := '00000000-0000-4000-8000-000000000901';
  v_org_a uuid := '00000000-0000-4000-8000-000000000910';
  v_branch_a1 uuid := '00000000-0000-4000-8000-000000000920';
  v_sku_standard uuid := '00000000-0000-4000-8000-000000000940';
  v_sku_variant uuid := '00000000-0000-4000-8000-000000000941';
  v_location_a1 uuid := current_setting('test.t4_4b.location_a1')::uuid;
  v_result jsonb;
  v_replay jsonb;
  v_multi jsonb;
  v_multi_reordered jsonb;
begin
  if has_table_privilege(
       'service_role', 'public.inventory_receive_batches', 'select'
     ) or has_table_privilege(
       'service_role', 'public.inventory_receive_batch_items', 'insert'
     ) then
    raise exception 't4_4b_service_role_direct_table_privilege_open';
  end if;

  v_result := public.server_receive_inventory_batch(
    jsonb_build_object(
      'contract_version', 1,
      'organization_id', v_org_a,
      'branch_id', v_branch_a1,
      'idempotency_key', '00000000-0000-4000-8000-000000000960',
      'reference', 'OPEN-ONE',
      'reason_code', 'opening_balance',
      'occurred_at', '2026-08-21T00:30:00+07:00',
      'items', jsonb_build_array(jsonb_build_object(
        'sku_id', v_sku_standard,
        'location_id', v_location_a1,
        'quantity', 5.000000,
        'unit_code', 'piece'
      ))
    ),
    v_owner_a
  );
  v_replay := public.server_receive_inventory_batch(
    jsonb_build_object(
      'contract_version', 1,
      'organization_id', v_org_a,
      'branch_id', v_branch_a1,
      'idempotency_key', '00000000-0000-4000-8000-000000000960',
      'reference', 'OPEN-ONE',
      'reason_code', 'opening_balance',
      'occurred_at', '2026-08-21T00:30:00+07:00',
      'items', jsonb_build_array(jsonb_build_object(
        'sku_id', v_sku_standard,
        'location_id', v_location_a1,
        'quantity', 5.000000,
        'unit_code', 'piece'
      ))
    ),
    v_owner_a
  );
  if v_result is distinct from v_replay
     or (v_result ->> 'item_count')::integer <> 1
     or jsonb_array_length(v_result -> 'items') <> 1 then
    raise exception 't4_4b_single_item_or_replay_failed';
  end if;

  v_multi := public.server_receive_inventory_batch(
    jsonb_build_object(
      'contract_version', 1,
      'organization_id', v_org_a,
      'branch_id', v_branch_a1,
      'idempotency_key', '00000000-0000-4000-8000-000000000961',
      'reference', 'OPEN-MULTI',
      'reason_code', 'opening_balance',
      'occurred_at', '2026-08-21T00:31:00+07:00',
      'items', jsonb_build_array(
        jsonb_build_object(
          'sku_id', v_sku_variant, 'location_id', v_location_a1,
          'quantity', 3.000000, 'unit_code', 'piece'
        ),
        jsonb_build_object(
          'sku_id', v_sku_standard, 'location_id', v_location_a1,
          'quantity', 2.000000, 'unit_code', 'piece'
        )
      )
    ),
    v_owner_a
  );
  v_multi_reordered := public.server_receive_inventory_batch(
    jsonb_build_object(
      'contract_version', 1,
      'organization_id', v_org_a,
      'branch_id', v_branch_a1,
      'idempotency_key', '00000000-0000-4000-8000-000000000961',
      'reference', 'OPEN-MULTI',
      'reason_code', 'opening_balance',
      'occurred_at', '2026-08-21T00:31:00+07:00',
      'items', jsonb_build_array(
        jsonb_build_object(
          'sku_id', v_sku_standard, 'location_id', v_location_a1,
          'quantity', 2.000000, 'unit_code', 'piece'
        ),
        jsonb_build_object(
          'sku_id', v_sku_variant, 'location_id', v_location_a1,
          'quantity', 3.000000, 'unit_code', 'piece'
        )
      )
    ),
    v_owner_a
  );
  if v_multi is distinct from v_multi_reordered
     or jsonb_array_length(v_multi -> 'items') <> 2 then
    raise exception 't4_4b_canonical_reordered_replay_failed';
  end if;

  begin
    perform public.server_receive_inventory_batch(
      jsonb_build_object(
        'contract_version', 1,
        'organization_id', v_org_a,
        'branch_id', v_branch_a1,
        'idempotency_key', '00000000-0000-4000-8000-000000000960',
        'reference', 'CHANGED',
        'reason_code', 'opening_balance',
        'occurred_at', '2026-08-21T00:30:00+07:00',
        'items', jsonb_build_array(jsonb_build_object(
          'sku_id', v_sku_standard, 'location_id', v_location_a1,
          'quantity', 5.000000, 'unit_code', 'piece'
        ))
      ),
      v_owner_a
    );
    raise exception 'expected_batch_idempotency_conflict';
  exception when unique_violation then null;
  end;

  perform set_config('test.t4_4b.single_result', v_result::text, true);
  perform set_config('test.t4_4b.multi_result', v_multi::text, true);
end
$trusted_happy_idempotency$;

do $trusted_validation_and_atomicity$
declare
  v_owner_a uuid := '00000000-0000-4000-8000-000000000901';
  v_org_a uuid := '00000000-0000-4000-8000-000000000910';
  v_branch_a1 uuid := '00000000-0000-4000-8000-000000000920';
  v_sku_standard uuid := '00000000-0000-4000-8000-000000000940';
  v_sku_bundle uuid := '00000000-0000-4000-8000-000000000942';
  v_sku_draft uuid := '00000000-0000-4000-8000-000000000943';
  v_location_a1 uuid := current_setting('test.t4_4b.location_a1')::uuid;
  v_location_a2 uuid := current_setting('test.t4_4b.location_a2')::uuid;
  v_oversized_items jsonb;
begin
  begin
    perform public.server_receive_inventory_batch(
      jsonb_build_object(
        'contract_version', 1, 'organization_id', v_org_a,
        'branch_id', v_branch_a1,
        'idempotency_key', '00000000-0000-4000-8000-000000000976',
        'reason_code', 'opening_balance', 'items', '[]'::jsonb
      ),
      v_owner_a
    );
    raise exception 'expected_zero_item_failure';
  exception when sqlstate '22023' then null;
  end;

  select jsonb_agg(jsonb_build_object(
    'sku_id', v_sku_standard,
    'location_id', v_location_a1,
    'quantity', 1.000000,
    'unit_code', 'piece'
  )) into strict v_oversized_items
  from generate_series(1, 101);
  begin
    perform public.server_receive_inventory_batch(
      jsonb_build_object(
        'contract_version', 1, 'organization_id', v_org_a,
        'branch_id', v_branch_a1,
        'idempotency_key', '00000000-0000-4000-8000-000000000977',
        'reason_code', 'opening_balance', 'items', v_oversized_items
      ),
      v_owner_a
    );
    raise exception 'expected_over_100_item_failure';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.server_receive_inventory_batch(
      jsonb_build_object(
        'contract_version', 1, 'organization_id', v_org_a,
        'branch_id', v_branch_a1,
        'idempotency_key', '00000000-0000-4000-8000-000000000962',
        'reason_code', 'opening_balance',
        'items', jsonb_build_array(
          jsonb_build_object(
            'sku_id', v_sku_standard, 'location_id', v_location_a1,
            'quantity', 1.000000, 'unit_code', 'piece'
          ),
          jsonb_build_object(
            'sku_id', '00000000-0000-4000-8000-000000000999',
            'location_id', v_location_a1,
            'quantity', 1.000000, 'unit_code', 'piece'
          )
        )
      ),
      v_owner_a
    );
    raise exception 'expected_atomic_invalid_sku_failure';
  exception when check_violation then null;
  end;

  begin
    perform public.server_receive_inventory_batch(
      jsonb_build_object(
        'contract_version', 1, 'organization_id', v_org_a,
        'branch_id', v_branch_a1,
        'idempotency_key', '00000000-0000-4000-8000-000000000963',
        'reason_code', 'opening_balance',
        'items', jsonb_build_array(
          jsonb_build_object(
            'sku_id', v_sku_standard, 'location_id', v_location_a1,
            'quantity', 1.000000, 'unit_code', 'piece'
          ),
          jsonb_build_object(
            'sku_id', v_sku_standard, 'location_id', v_location_a1,
            'quantity', 2.000000, 'unit_code', 'piece'
          )
        )
      ),
      v_owner_a
    );
    raise exception 'expected_duplicate_sku_location_failure';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.server_receive_inventory_batch(
      jsonb_build_object(
        'contract_version', 1, 'organization_id', v_org_a,
        'branch_id', v_branch_a1,
        'idempotency_key', '00000000-0000-4000-8000-000000000978',
        'reason_code', 'opening_balance',
        'items', jsonb_build_array(jsonb_build_object(
          'sku_id', v_sku_standard, 'location_id', v_location_a1,
          'quantity', 1.0000001, 'unit_code', 'piece'
        ))
      ),
      v_owner_a
    );
    raise exception 'expected_excess_quantity_scale_failure';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.server_receive_inventory_batch(
      jsonb_build_object(
        'contract_version', 1, 'organization_id', v_org_a,
        'branch_id', v_branch_a1,
        'idempotency_key', '00000000-0000-4000-8000-000000000964',
        'reason_code', 'opening_balance',
        'items', jsonb_build_array(jsonb_build_object(
          'sku_id', v_sku_bundle, 'location_id', v_location_a1,
          'quantity', 1.000000, 'unit_code', 'piece'
        ))
      ),
      v_owner_a
    );
    raise exception 'expected_bundle_receive_failure';
  exception when check_violation then null;
  end;

  begin
    perform public.server_receive_inventory_batch(
      jsonb_build_object(
        'contract_version', 1, 'organization_id', v_org_a,
        'branch_id', v_branch_a1,
        'idempotency_key', '00000000-0000-4000-8000-000000000965',
        'reason_code', 'opening_balance',
        'items', jsonb_build_array(jsonb_build_object(
          'sku_id', v_sku_draft, 'location_id', v_location_a1,
          'quantity', 1.000000, 'unit_code', 'piece'
        ))
      ),
      v_owner_a
    );
    raise exception 'expected_draft_receive_failure';
  exception when check_violation then null;
  end;

  begin
    perform public.server_receive_inventory_batch(
      jsonb_build_object(
        'contract_version', 1, 'organization_id', v_org_a,
        'branch_id', v_branch_a1,
        'idempotency_key', '00000000-0000-4000-8000-000000000966',
        'reason_code', 'opening_balance',
        'items', jsonb_build_array(jsonb_build_object(
          'sku_id', v_sku_standard, 'location_id', v_location_a1,
          'quantity', 1.000000, 'unit_code', 'box'
        ))
      ),
      v_owner_a
    );
    raise exception 'expected_base_unit_failure';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.server_receive_inventory_batch(
      jsonb_build_object(
        'contract_version', 1, 'organization_id', v_org_a,
        'branch_id', v_branch_a1,
        'idempotency_key', '00000000-0000-4000-8000-000000000967',
        'reason_code', 'opening_balance',
        'items', jsonb_build_array(jsonb_build_object(
          'sku_id', v_sku_standard, 'location_id', v_location_a1,
          'quantity', 0, 'unit_code', 'piece'
        ))
      ),
      v_owner_a
    );
    raise exception 'expected_quantity_failure';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.server_receive_inventory_batch(
      jsonb_build_object(
        'contract_version', 1, 'organization_id', v_org_a,
        'branch_id', v_branch_a1,
        'idempotency_key', '00000000-0000-4000-8000-000000000968',
        'reason_code', 'opening_balance',
        'items', jsonb_build_array(jsonb_build_object(
          'sku_id', v_sku_standard, 'location_id', v_location_a2,
          'quantity', 1.000000, 'unit_code', 'piece'
        ))
      ),
      v_owner_a
    );
    raise exception 'expected_branch_location_scope_failure';
  exception when insufficient_privilege then null;
  end;
end
$trusted_validation_and_atomicity$;

reset role;

do $atomicity_and_lineage_assertions$
declare
  v_org_a uuid := '00000000-0000-4000-8000-000000000910';
  v_sku_standard uuid := '00000000-0000-4000-8000-000000000940';
  v_sku_variant uuid := '00000000-0000-4000-8000-000000000941';
  v_location_a1 uuid := current_setting('test.t4_4b.location_a1')::uuid;
  v_single_batch uuid := (
    current_setting('test.t4_4b.single_result')::jsonb ->> 'batch_id'
  )::uuid;
  v_multi_batch uuid := (
    current_setting('test.t4_4b.multi_result')::jsonb ->> 'batch_id'
  )::uuid;
begin
  if exists (
    select 1 from public.inventory_receive_batches
    where organization_id = v_org_a
      and idempotency_key in (
        '00000000-0000-4000-8000-000000000976'::uuid,
        '00000000-0000-4000-8000-000000000977'::uuid,
        '00000000-0000-4000-8000-000000000978'::uuid,
        '00000000-0000-4000-8000-000000000962'::uuid,
        '00000000-0000-4000-8000-000000000963'::uuid,
        '00000000-0000-4000-8000-000000000964'::uuid,
        '00000000-0000-4000-8000-000000000965'::uuid,
        '00000000-0000-4000-8000-000000000966'::uuid,
        '00000000-0000-4000-8000-000000000967'::uuid,
        '00000000-0000-4000-8000-000000000968'::uuid
      )
  ) then
    raise exception 't4_4b_failed_batch_header_persisted';
  end if;

  if (select on_hand from public.inventory_balances
      where organization_id = v_org_a
        and sku_id = v_sku_standard
        and location_id = v_location_a1) <> 7.000000
     or (select on_hand from public.inventory_balances
         where organization_id = v_org_a
           and sku_id = v_sku_variant
           and location_id = v_location_a1) <> 3.000000 then
    raise exception 't4_4b_atomic_failure_changed_balance';
  end if;

  if (select count(*) from public.inventory_receive_batch_items
      where organization_id = v_org_a
        and batch_id in (v_single_batch, v_multi_batch)) <> 3
     or (select count(*)
         from public.inventory_receive_batch_items bi
         join public.inventory_commands c
           on c.organization_id = bi.organization_id
          and c.id = bi.inventory_command_id
         join public.stock_movements m
           on m.organization_id = c.organization_id
          and m.command_id = c.id
         join public.inventory_domain_events e
           on e.organization_id = c.organization_id
          and e.command_id = c.id
         where bi.organization_id = v_org_a
           and bi.batch_id in (v_single_batch, v_multi_batch)
           and c.command_type = 'receive'
           and c.status = 'completed'
           and m.movement_type = 'receive'
           and m.quantity_delta = bi.quantity
           and m.location_id = bi.location_id
           and e.event_name = 'stock.received') <> 3 then
    raise exception 't4_4b_batch_command_movement_event_lineage_invalid';
  end if;

  if exists (
    select 1
    from public.inventory_balances b
    join (
      select organization_id, sku_id, location_id, sum(quantity_delta) ledger_total
      from public.stock_movements
      where organization_id = v_org_a
      group by organization_id, sku_id, location_id
    ) ledger using (organization_id, sku_id, location_id)
    where b.organization_id = v_org_a
      and b.on_hand <> ledger.ledger_total
  ) then
    raise exception 't4_4b_balance_not_derived_from_movement';
  end if;
end
$atomicity_and_lineage_assertions$;

set local role service_role;

do $permission_and_same_balance_serial_contract$
declare
  v_owner_a uuid := '00000000-0000-4000-8000-000000000901';
  v_staff_a uuid := '00000000-0000-4000-8000-000000000902';
  v_org_a uuid := '00000000-0000-4000-8000-000000000910';
  v_branch_a1 uuid := '00000000-0000-4000-8000-000000000920';
  v_branch_a2 uuid := '00000000-0000-4000-8000-000000000921';
  v_sku_standard uuid := '00000000-0000-4000-8000-000000000940';
  v_sku_bundle uuid := '00000000-0000-4000-8000-000000000942';
  v_location_a1 uuid := current_setting('test.t4_4b.location_a1')::uuid;
  v_location_a2 uuid := current_setting('test.t4_4b.location_a2')::uuid;
  v_staff_membership uuid := current_setting('test.t4_4b.staff_membership')::uuid;
begin
  perform public.server_receive_inventory_batch(
    jsonb_build_object(
      'contract_version', 1, 'organization_id', v_org_a,
      'branch_id', v_branch_a1,
      'idempotency_key', '00000000-0000-4000-8000-000000000969',
      'reason_code', 'opening_balance',
      'items', jsonb_build_array(jsonb_build_object(
        'sku_id', v_sku_standard, 'location_id', v_location_a1,
        'quantity', 1.000000, 'unit_code', 'piece'
      ))
    ),
    v_staff_a
  );

  begin
    perform public.server_receive_inventory_batch(
      jsonb_build_object(
        'contract_version', 1, 'organization_id', v_org_a,
        'branch_id', v_branch_a2,
        'idempotency_key', '00000000-0000-4000-8000-000000000970',
        'reason_code', 'opening_balance',
        'items', jsonb_build_array(jsonb_build_object(
          'sku_id', v_sku_standard, 'location_id', v_location_a2,
          'quantity', 1.000000, 'unit_code', 'piece'
        ))
      ),
      v_staff_a
    );
    raise exception 'expected_branch_membership_ceiling_denial';
  exception when insufficient_privilege then null;
  end;

  perform public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000971',
    v_owner_a,
    v_org_a,
    v_staff_membership,
    'inventory.receive',
    v_branch_a1,
    'deny',
    null,
    null,
    'Block Initial Stock receive for T4.4B denial test',
    0
  );

  begin
    perform public.server_receive_inventory_batch(
      jsonb_build_object(
        'contract_version', 1, 'organization_id', v_org_a,
        'branch_id', v_branch_a1,
        'idempotency_key', '00000000-0000-4000-8000-000000000972',
        'reason_code', 'opening_balance',
        'items', jsonb_build_array(jsonb_build_object(
          'sku_id', v_sku_standard, 'location_id', v_location_a1,
          'quantity', 1.000000, 'unit_code', 'piece'
        ))
      ),
      v_staff_a
    );
    raise exception 'expected_individual_deny_precedence';
  exception when insufficient_privilege then null;
  end;

  -- Sequential same-Balance posts prove additive row-lock behavior. G12 must
  -- repeat this with two concurrent sessions and reversed overlapping Items.
  perform public.server_receive_inventory_batch(
    jsonb_build_object(
      'contract_version', 1, 'organization_id', v_org_a,
      'branch_id', v_branch_a1,
      'idempotency_key', '00000000-0000-4000-8000-000000000973',
      'reason_code', 'opening_balance',
      'items', jsonb_build_array(jsonb_build_object(
        'sku_id', v_sku_standard, 'location_id', v_location_a1,
        'quantity', 1.000000, 'unit_code', 'piece'
      ))
    ),
    v_owner_a
  );
  perform public.server_receive_inventory_batch(
    jsonb_build_object(
      'contract_version', 1, 'organization_id', v_org_a,
      'branch_id', v_branch_a1,
      'idempotency_key', '00000000-0000-4000-8000-000000000974',
      'reason_code', 'opening_balance',
      'items', jsonb_build_array(jsonb_build_object(
        'sku_id', v_sku_standard, 'location_id', v_location_a1,
        'quantity', 1.000000, 'unit_code', 'piece'
      ))
    ),
    v_owner_a
  );

  begin
    perform public.server_post_inventory_command(
      '00000000-0000-4000-8000-000000000975',
      v_org_a,
      'receive',
      v_sku_bundle,
      null,
      v_location_a1,
      1.000000,
      'opening_balance',
      null,
      repeat('a', 64),
      v_owner_a,
      now()
    );
    raise exception 'expected_single_receive_bundle_guard';
  exception when check_violation then null;
  end;
end
$permission_and_same_balance_serial_contract$;

reset role;

do $post_permission_assertions$
declare
  v_org_a uuid := '00000000-0000-4000-8000-000000000910';
  v_sku_standard uuid := '00000000-0000-4000-8000-000000000940';
  v_location_a1 uuid := current_setting('test.t4_4b.location_a1')::uuid;
begin
  if (select on_hand from public.inventory_balances
      where organization_id = v_org_a
        and sku_id = v_sku_standard
        and location_id = v_location_a1) <> 10.000000 then
    raise exception 't4_4b_same_balance_additive_result_invalid';
  end if;

  if exists (
    select 1 from public.inventory_receive_batches
    where organization_id = v_org_a
      and idempotency_key in (
        '00000000-0000-4000-8000-000000000970'::uuid,
        '00000000-0000-4000-8000-000000000972'::uuid
      )
  ) or exists (
    select 1 from public.inventory_commands
    where id = '00000000-0000-4000-8000-000000000975'::uuid
  ) then
    raise exception 't4_4b_permission_or_bundle_failure_left_rows';
  end if;
end
$post_permission_assertions$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000901',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);

do $owner_browser_contract$
declare
  v_org_a uuid := '00000000-0000-4000-8000-000000000910';
begin
  if (select count(*) from public.inventory_receive_batches
      where organization_id = v_org_a) <> 5
     or (select count(*) from public.inventory_receive_batch_items
         where organization_id = v_org_a) <> 6 then
    raise exception 't4_4b_owner_batch_read_or_row_count_invalid';
  end if;

  begin
    perform public.server_receive_inventory_batch(
      '{}'::jsonb,
      '00000000-0000-4000-8000-000000000901'
    );
    raise exception 'expected_authenticated_batch_rpc_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.inventory_receive_batches
    set reference = 'tampered'
    where organization_id = v_org_a;
    raise exception 'expected_browser_batch_write_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.inventory_balances set on_hand = on_hand + 1
    where organization_id = v_org_a;
    raise exception 'expected_browser_balance_write_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.stock_movements set reason_code = 'tampered'
    where organization_id = v_org_a;
    raise exception 'expected_browser_movement_write_denial';
  exception when insufficient_privilege then null;
  end;
end
$owner_browser_contract$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000903',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);

do $cross_tenant_rls$
begin
  if exists (
    select 1 from public.inventory_receive_batches
    where organization_id = '00000000-0000-4000-8000-000000000910'
  ) or exists (
    select 1 from public.inventory_receive_batch_items
    where organization_id = '00000000-0000-4000-8000-000000000910'
  ) then
    raise exception 't4_4b_cross_tenant_batch_rls_leak';
  end if;
end
$cross_tenant_rls$;

reset role;
select set_config('request.jwt.claims', '', true);

do $final_contract$
begin
  if exists (
    select 1
    from public.inventory_receive_batches b
    where b.status <> 'completed'
       or b.item_count <> (
         select count(*)
         from public.inventory_receive_batch_items bi
         where bi.organization_id = b.organization_id
           and bi.batch_id = b.id
       )
  ) then
    raise exception 't4_4b_persisted_batch_incomplete';
  end if;

  if exists (
    select 1
    from public.inventory_receive_batch_items bi
    join public.inventory_commands c
      on c.organization_id = bi.organization_id
     and c.id = bi.inventory_command_id
    where c.command_type <> 'receive'
       or c.status <> 'completed'
       or c.sku_id <> bi.sku_id
       or c.destination_location_id <> bi.location_id
       or c.quantity <> bi.quantity
  ) then
    raise exception 't4_4b_final_lineage_mismatch';
  end if;

  if to_regclass('public.inventory_locations') is not null
     or to_regclass('public.inventory_movements') is not null
     or (select count(*) from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'server_receive_inventory_batch') <> 1 then
    raise exception 't4_4b_unapproved_surface_detected';
  end if;
end
$final_contract$;

rollback;
