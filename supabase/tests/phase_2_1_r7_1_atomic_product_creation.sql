\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, created_at, updated_at)
values ('00000000-0000-4000-8000-000000007101', 'r7-1-owner@example.test', now(), now());

insert into public.organizations (
  id, name, slug, status, timezone, currency, created_by
) values (
  '00000000-0000-4000-8000-000000007201', 'R7.1 Test Organization',
  'r7-1-test-organization', 'active', 'Asia/Bangkok', 'THB',
  '00000000-0000-4000-8000-000000007101'
);

do $$
declare
  v_owner_role uuid;
  v_owner_membership uuid;
begin
  select id into v_owner_role
  from public.organization_roles
  where organization_id = '00000000-0000-4000-8000-000000007201'
    and code = 'owner';

  select id into strict v_owner_membership
  from public.organization_members
  where organization_id = '00000000-0000-4000-8000-000000007201'
    and user_id = '00000000-0000-4000-8000-000000007101';

  if v_owner_role is null then
    insert into public.organization_roles (
      id, organization_id, code, name, description, is_system, created_by
    ) values (
      '00000000-0000-4000-8000-000000007301',
      '00000000-0000-4000-8000-000000007201',
      'owner', 'Owner', 'R7.1 test owner', true,
      '00000000-0000-4000-8000-000000007101'
    ) returning id into v_owner_role;
  end if;

  insert into public.member_roles (membership_id, role_id)
  values (v_owner_membership, v_owner_role)
  on conflict do nothing;
end;
$$;

insert into public.product_categories (
  id, organization_id, name, created_by, updated_by
) values (
  '00000000-0000-4000-8000-000000007401',
  '00000000-0000-4000-8000-000000007201',
  'R7.1 Bundles',
  '00000000-0000-4000-8000-000000007101',
  '00000000-0000-4000-8000-000000007101'
);

insert into public.product_brands (
  id, organization_id, name, created_by, updated_by
) values (
  '00000000-0000-4000-8000-000000007402',
  '00000000-0000-4000-8000-000000007201',
  'R7.1 Brand',
  '00000000-0000-4000-8000-000000007101',
  '00000000-0000-4000-8000-000000007101'
);

insert into public.product_tags (
  id, organization_id, name, created_by, updated_by
) values (
  '00000000-0000-4000-8000-000000007403',
  '00000000-0000-4000-8000-000000007201',
  'R7.1 New arrival',
  '00000000-0000-4000-8000-000000007101',
  '00000000-0000-4000-8000-000000007101'
);

insert into public.products (
  id, organization_id, name, status, created_by, updated_by
) values (
  '00000000-0000-4000-8000-000000007501',
  '00000000-0000-4000-8000-000000007201',
  'R7.1 Existing Component', 'draft',
  '00000000-0000-4000-8000-000000007101',
  '00000000-0000-4000-8000-000000007101'
);

insert into public.skus (
  id, organization_id, product_id, sku_code, name, barcode, sales_code,
  base_unit_code, status, created_by, updated_by
) values (
  '00000000-0000-4000-8000-000000007601',
  '00000000-0000-4000-8000-000000007201',
  '00000000-0000-4000-8000-000000007501',
  'R71-COMPONENT-001', 'R7.1 Component', '8857100000001', 'RC001',
  'piece', 'draft',
  '00000000-0000-4000-8000-000000007101',
  '00000000-0000-4000-8000-000000007101'
);

do $$
declare
  v_payload jsonb := jsonb_build_object(
    'name', 'R7.1 Atomic Bundle',
    'description', 'Created in one transaction',
    'category_id', '00000000-0000-4000-8000-000000007401',
    'brand_id', '00000000-0000-4000-8000-000000007402',
    'structure_type', 'bundle',
    'internal_note', 'R7.1 private note',
    'tag_ids', jsonb_build_array('00000000-0000-4000-8000-000000007403'),
    'sku_name', 'R7.1 Atomic Bundle SKU',
    'sku_code', 'R71-BUNDLE-001',
    'barcode', '8857100000018',
    'sales_code', 'RB001',
    'base_unit_code', 'set',
    'quantity_behavior', 'discrete',
    'sale_price', 1590,
    'cost_price', 700,
    'currency_code', 'THB',
    'tax_category', 'standard',
    'tax_rate', 7,
    'product_weight_kg', 0.5,
    'package_weight_kg', 0.7,
    'safety_stock', 2,
    'reorder_min', 5,
    'reorder_max', 20,
    'sell_units', jsonb_build_array(jsonb_build_object(
      'unit_code', 'case', 'name', 'Case of 6', 'base_quantity', 6,
      'barcode', '8857100000025'
    )),
    'bundle_components', jsonb_build_array(jsonb_build_object(
      'sku_id', '00000000-0000-4000-8000-000000007601', 'quantity', 2
    ))
  );
  v_result jsonb;
  v_replay jsonb;
begin
  v_result := public.server_execute_product_creation_command(
    '00000000-0000-4000-8000-000000007701',
    '00000000-0000-4000-8000-000000007201',
    'product.create_with_initial_sku', v_payload, repeat('7', 64),
    '00000000-0000-4000-8000-000000007101'
  );
  v_replay := public.server_execute_product_creation_command(
    '00000000-0000-4000-8000-000000007701',
    '00000000-0000-4000-8000-000000007201',
    'product.create_with_initial_sku', v_payload, repeat('7', 64),
    '00000000-0000-4000-8000-000000007101'
  );

  if v_result <> v_replay then
    raise exception 'R7.1 idempotent replay returned a different result';
  end if;
  if v_result ->> 'product_status' <> 'draft'
     or v_result ->> 'sku_status' <> 'draft'
     or (v_result ->> 'image_upload_required')::boolean is not true
     or (v_result ->> 'inventory_posted')::boolean is not false then
    raise exception 'R7.1 returned an unsafe creation state';
  end if;

  begin
    perform public.server_execute_product_creation_command(
      '00000000-0000-4000-8000-000000007701',
      '00000000-0000-4000-8000-000000007201',
      'product.create_with_initial_sku',
      v_payload || '{"name":"R7.1 conflict"}'::jsonb,
      repeat('8', 64),
      '00000000-0000-4000-8000-000000007101'
    );
    raise exception 'R7.1 expected command_payload_conflict';
  exception when unique_violation then
    if sqlerrm not like '%command_payload_conflict%' then raise; end if;
  end;
end;
$$;

do $$
begin
  begin
    perform public.server_execute_product_creation_command(
      '00000000-0000-4000-8000-000000007702',
      '00000000-0000-4000-8000-000000007201',
      'product.create_with_initial_sku',
      '{
        "name":"R7.1 Must Roll Back",
        "category_id":"00000000-0000-4000-8000-000000007401",
        "sku_name":"Duplicate SKU",
        "sku_code":"R71-COMPONENT-001",
        "base_unit_code":"piece"
      }'::jsonb,
      repeat('9', 64),
      '00000000-0000-4000-8000-000000007101'
    );
    raise exception 'R7.1 expected duplicate identifier failure';
  exception when unique_violation then null;
  end;

  if exists (select 1 from public.products where name = 'R7.1 Must Roll Back')
     or exists (select 1 from public.foundation_commands
                where id = '00000000-0000-4000-8000-000000007702') then
    raise exception 'R7.1 left partial state after duplicate identifier failure';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.server_execute_product_creation_command(
      '00000000-0000-4000-8000-000000007703',
      '00000000-0000-4000-8000-000000007201',
      'product.create_with_initial_sku',
      '{
        "name":"R7.1 Sales Code Rollback",
        "category_id":"00000000-0000-4000-8000-000000007401",
        "sku_name":"Duplicate Sales Code",
        "sku_code":"R71-SALES-ROLLBACK",
        "sales_code":"RC001",
        "base_unit_code":"piece"
      }'::jsonb,
      repeat('a', 64),
      '00000000-0000-4000-8000-000000007101'
    );
    raise exception 'R7.1 expected duplicate Sales Code failure';
  exception when unique_violation then null;
  end;

  begin
    perform public.server_execute_product_creation_command(
      '00000000-0000-4000-8000-000000007704',
      '00000000-0000-4000-8000-000000007201',
      'product.create_with_initial_sku',
      '{
        "name":"R7.1 Barcode Rollback",
        "category_id":"00000000-0000-4000-8000-000000007401",
        "sku_name":"Duplicate Barcode",
        "sku_code":"R71-BARCODE-ROLLBACK",
        "barcode":"8857100000001",
        "base_unit_code":"piece"
      }'::jsonb,
      repeat('b', 64),
      '00000000-0000-4000-8000-000000007101'
    );
    raise exception 'R7.1 expected duplicate Barcode failure';
  exception when unique_violation then null;
  end;

  if exists (select 1 from public.products
             where name in ('R7.1 Sales Code Rollback', 'R7.1 Barcode Rollback'))
     or exists (select 1 from public.foundation_commands
                where id in (
                  '00000000-0000-4000-8000-000000007703',
                  '00000000-0000-4000-8000-000000007704'
                )) then
    raise exception 'R7.1 left partial state after Sales Code or Barcode conflict';
  end if;
end;
$$;

do $$
declare
  v_product_id uuid;
  v_sku_id uuid;
begin
  select (result ->> 'product_id')::uuid, (result ->> 'sku_id')::uuid
  into strict v_product_id, v_sku_id
  from public.foundation_commands
  where id = '00000000-0000-4000-8000-000000007701';

  if (select count(*) from public.products where id = v_product_id) <> 1
     or (select count(*) from public.skus where id = v_sku_id and product_id = v_product_id) <> 1
     or (select count(*) from public.sku_product_profiles where sku_id = v_sku_id) <> 1
     or (select count(*) from public.sku_cost_profiles where sku_id = v_sku_id) <> 1
     or (select count(*) from public.product_tag_assignments where product_id = v_product_id) <> 1
     or (select count(*) from public.sku_sell_units where sku_id = v_sku_id) <> 1
     or (select count(*) from public.sku_bundle_components where bundle_sku_id = v_sku_id) <> 1 then
    raise exception 'R7.1 did not persist the complete aggregate';
  end if;
  if (select count(*) from public.foundation_domain_events
      where command_id = '00000000-0000-4000-8000-000000007701') <> 1 then
    raise exception 'R7.1 idempotency must emit one event';
  end if;
  if (select count(*) from private.organization_audit_logs
      where source_type = 'foundation_command'
        and source_id = '00000000-0000-4000-8000-000000007701') <> 1 then
    raise exception 'R7.1 must append one audit record';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.server_execute_product_creation_command(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute R7.1 command directly';
  end if;
end;
$$;

rollback;

select 'PHASE_2_1_R7_1_ATOMIC_PRODUCT_CREATION_OK' as result;
