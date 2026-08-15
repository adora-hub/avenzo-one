\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000101', 'r5-owner@example.test', now(), now()),
  ('00000000-0000-4000-8000-000000000102', 'r5-reader@example.test', now(), now());

insert into public.organizations (
  id, name, slug, status, timezone, currency, created_by
) values (
  '00000000-0000-4000-8000-000000000201', 'R5 Test Organization',
  'r5-test-organization', 'active', 'Asia/Bangkok', 'THB',
  '00000000-0000-4000-8000-000000000101'
);

insert into public.organization_members (
  id, organization_id, user_id, membership_status, scope
) values (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000102', 'active', 'organization'
  );

do $$
declare
  v_owner_role uuid;
  v_owner_membership uuid;
  v_reader_role uuid := '00000000-0000-4000-8000-000000000402';
begin
  select id into v_owner_role
  from public.organization_roles
  where organization_id = '00000000-0000-4000-8000-000000000201'
    and code = 'owner';

  select id into strict v_owner_membership
  from public.organization_members
  where organization_id = '00000000-0000-4000-8000-000000000201'
    and user_id = '00000000-0000-4000-8000-000000000101';

  if v_owner_role is null then
    insert into public.organization_roles (
      id, organization_id, code, name, description, is_system, created_by
    ) values (
      '00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-000000000201',
      'owner', 'Owner', 'R5 test owner', true,
      '00000000-0000-4000-8000-000000000101'
    ) returning id into v_owner_role;
  end if;

  insert into public.organization_roles (
    id, organization_id, code, name, description, is_system, created_by
  ) values (
    v_reader_role, '00000000-0000-4000-8000-000000000201',
    'r5_reader', 'R5 Reader', 'Read Product without cost', false,
    '00000000-0000-4000-8000-000000000101'
  );

  insert into public.role_permissions (role_id, permission_code)
  values (v_reader_role, 'product.read');

  insert into public.member_roles (membership_id, role_id)
  values
    (v_owner_membership, v_owner_role),
    ('00000000-0000-4000-8000-000000000302', v_reader_role)
  on conflict do nothing;
end;
$$;

insert into public.products (
  id, organization_id, name, status, created_by, updated_by
) values
  (
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000201',
    'R5 Standard Product', 'draft',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000101'
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000201',
    'R5 Bundle A', 'draft',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000101'
  ),
  (
    '00000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000201',
    'R5 Bundle B', 'draft',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000101'
  );

update public.products
set structure_type = 'bundle', updated_by = '00000000-0000-4000-8000-000000000101'
where id in (
  '00000000-0000-4000-8000-000000000502',
  '00000000-0000-4000-8000-000000000503'
);

insert into public.skus (
  id, organization_id, product_id, sku_code, name, sales_code,
  base_unit_code, status, created_by, updated_by
) values
  (
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000501',
    'R5-STD-001', 'R5 Standard SKU', 'R501', 'piece', 'draft',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000101'
  ),
  (
    '00000000-0000-4000-8000-000000000602',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000502',
    'R5-BUNDLE-A', 'R5 Bundle SKU A', 'R5BA', 'piece', 'draft',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000101'
  ),
  (
    '00000000-0000-4000-8000-000000000603',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000503',
    'R5-BUNDLE-B', 'R5 Bundle SKU B', 'R5BB', 'piece', 'draft',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000101'
  );

do $$
declare
  v_category_id uuid;
  v_tag_id uuid;
  v_result jsonb;
  v_product_version bigint;
begin
  v_result := public.server_execute_product_domain_command(
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000201',
    'product.master.upsert',
    '{"master_kind":"category","name":"Accessories"}'::jsonb,
    repeat('a', 64),
    '00000000-0000-4000-8000-000000000101'
  );
  v_category_id := (v_result ->> 'entity_id')::uuid;

  if public.server_execute_product_domain_command(
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000201',
    'product.master.upsert',
    '{"master_kind":"category","name":"Accessories"}'::jsonb,
    repeat('a', 64),
    '00000000-0000-4000-8000-000000000101'
  ) <> v_result then
    raise exception 'R5 idempotent replay returned a different result';
  end if;

  v_result := public.server_execute_product_domain_command(
    '00000000-0000-4000-8000-000000000702',
    '00000000-0000-4000-8000-000000000201',
    'product.master.upsert',
    '{"master_kind":"tag","name":"New arrival"}'::jsonb,
    repeat('b', 64),
    '00000000-0000-4000-8000-000000000101'
  );
  v_tag_id := (v_result ->> 'entity_id')::uuid;

  select version into v_product_version from public.products
  where id = '00000000-0000-4000-8000-000000000501';
  perform public.server_execute_product_domain_command(
    '00000000-0000-4000-8000-000000000703',
    '00000000-0000-4000-8000-000000000201',
    'product.metadata.update',
    jsonb_build_object(
      'product_id', '00000000-0000-4000-8000-000000000501',
      'expected_version', v_product_version,
      'category_id', v_category_id,
      'internal_note', 'R5 internal note',
      'tag_ids', jsonb_build_array(v_tag_id)
    ),
    repeat('c', 64),
    '00000000-0000-4000-8000-000000000101'
  );

  perform public.server_execute_product_domain_command(
    '00000000-0000-4000-8000-000000000704',
    '00000000-0000-4000-8000-000000000201',
    'sku.profile.upsert',
    '{"sku_id":"00000000-0000-4000-8000-000000000601","expected_version":0,"quantity_behavior":"discrete","sale_price":590,"tax_category":"standard","tax_rate":7,"product_weight_kg":0.2,"package_weight_kg":0.3,"safety_stock":5,"reorder_min":10,"reorder_max":30}'::jsonb,
    repeat('d', 64),
    '00000000-0000-4000-8000-000000000101'
  );

  perform public.server_execute_product_domain_command(
    '00000000-0000-4000-8000-000000000705',
    '00000000-0000-4000-8000-000000000201',
    'sku.cost.upsert',
    '{"sku_id":"00000000-0000-4000-8000-000000000601","expected_version":0,"cost_price":250,"currency_code":"THB"}'::jsonb,
    repeat('e', 64),
    '00000000-0000-4000-8000-000000000101'
  );

  perform public.server_execute_product_domain_command(
    '00000000-0000-4000-8000-000000000706',
    '00000000-0000-4000-8000-000000000201',
    'sku.sell_units.replace',
    '{"sku_id":"00000000-0000-4000-8000-000000000601","units":[{"unit_code":"pack","name":"Pack of 6","base_quantity":6,"barcode":"8850000000006"}]}'::jsonb,
    repeat('f', 64),
    '00000000-0000-4000-8000-000000000101'
  );

  perform public.server_execute_product_domain_command(
    '00000000-0000-4000-8000-000000000707',
    '00000000-0000-4000-8000-000000000201',
    'sku.bundle.replace',
    '{"sku_id":"00000000-0000-4000-8000-000000000602","components":[{"sku_id":"00000000-0000-4000-8000-000000000603","quantity":1}]}'::jsonb,
    repeat('1', 64),
    '00000000-0000-4000-8000-000000000101'
  );

  begin
    perform public.server_execute_product_domain_command(
      '00000000-0000-4000-8000-000000000708',
      '00000000-0000-4000-8000-000000000201',
      'sku.bundle.replace',
      '{"sku_id":"00000000-0000-4000-8000-000000000603","components":[{"sku_id":"00000000-0000-4000-8000-000000000602","quantity":1}]}'::jsonb,
      repeat('2', 64),
      '00000000-0000-4000-8000-000000000101'
    );
    raise exception 'R5 cycle test expected bundle_cycle_forbidden';
  exception when check_violation then
    if sqlerrm not like '%bundle_cycle_forbidden%' then raise; end if;
  end;
end;
$$;

do $$
begin
  if (select count(*) from public.product_domain_events
      where command_id = '00000000-0000-4000-8000-000000000701') <> 1 then
    raise exception 'R5 idempotency must create exactly one event';
  end if;
  if (select base_quantity from public.sku_sell_units
      where sku_id = '00000000-0000-4000-8000-000000000601') <> 6 then
    raise exception 'R5 sell-unit conversion was not persisted';
  end if;
  if (select base_unit_code from public.skus
      where id = '00000000-0000-4000-8000-000000000601') <> 'piece' then
    raise exception 'R5 changed immutable SKU base unit';
  end if;
  if has_table_privilege('authenticated', 'public.sku_cost_profiles', 'INSERT') then
    raise exception 'authenticated must not write R5 tables directly';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.server_execute_product_domain_command(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute R5 trusted command directly';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);

do $$
begin
  if (select count(*) from public.product_categories) <> 1 then
    raise exception 'product.read actor should see R5 category';
  end if;
  if (select count(*) from public.sku_cost_profiles) <> 0 then
    raise exception 'product.read actor without product.cost.read saw cost data';
  end if;
end;
$$;

reset role;
rollback;

select 'PHASE_2_1_R5_BEHAVIOR_AND_RLS_OK' as result;
