\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000401', 'sku04-owner@example.test', now(), now());

insert into public.organizations (
  id, name, slug, status, timezone, currency, created_by
) values (
  '00000000-0000-4000-8000-000000000411', 'SKU 04 Organization',
  'sku-04-organization', 'active', 'Asia/Bangkok', 'THB',
  '00000000-0000-4000-8000-000000000401'
);

do $$
declare
  v_owner_role uuid;
  v_owner_membership uuid;
begin
  select id into v_owner_role from public.organization_roles
  where organization_id = '00000000-0000-4000-8000-000000000411' and code = 'owner';
  select id into strict v_owner_membership from public.organization_members
  where organization_id = '00000000-0000-4000-8000-000000000411'
    and user_id = '00000000-0000-4000-8000-000000000401';
  if v_owner_role is null then
    insert into public.organization_roles (
      id, organization_id, code, name, description, is_system, created_by
    ) values (
      '00000000-0000-4000-8000-000000000421',
      '00000000-0000-4000-8000-000000000411',
      'owner', 'Owner', 'SKU-04 test owner', true,
      '00000000-0000-4000-8000-000000000401'
    ) returning id into v_owner_role;
  end if;
  insert into public.member_roles (membership_id, role_id)
  values (v_owner_membership, v_owner_role) on conflict do nothing;
end;
$$;

insert into public.product_categories (
  id, organization_id, name, created_by, updated_by
) values (
  '00000000-0000-4000-8000-000000000431',
  '00000000-0000-4000-8000-000000000411',
  'SKU-04 Category',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000401'
);

do $$
declare
  v_preview jsonb;
  v_payload jsonb := '{
    "name":"SKU-04 Product One",
    "category_id":"00000000-0000-4000-8000-000000000431",
    "structure_type":"variant",
    "base_unit_code":"piece",
    "quantity_behavior":"discrete",
    "currency_code":"THB",
    "sku_prefix":"TS",
    "sku_product_sequence":1,
    "sku_sequence_digits":3,
    "option_groups":[{"name":"สี","kind":"color","values":[
      {"name":"สีทอง","code":"GLD"},{"name":"สีเงิน","code":"SLV"}
    ]}],
    "variants":[
      {"key":"gold","name":"SKU-04 Product One · สีทอง","sku_code":"TS-001-GLD","sales_code":"S401","status":"draft","sale_price":320,"option_codes":["GLD"]},
      {"key":"silver","name":"SKU-04 Product One · สีเงิน","sku_code":"TS-001-SLV","sales_code":"S402","status":"draft","sale_price":320,"option_codes":["SLV"]}
    ]
  }'::jsonb;
  v_result jsonb;
  v_replay jsonb;
begin
  v_preview := public.server_preview_variant_sku_sequence(
    '00000000-0000-4000-8000-000000000411', 'ts',
    '00000000-0000-4000-8000-000000000401', 3::smallint
  );
  if (v_preview ->> 'formatted_sequence') <> '001'
     or (v_preview ->> 'reserved')::boolean then
    raise exception 'preview did not start at one: %', v_preview;
  end if;

  v_result := public.server_execute_variant_sku_sequence_command(
    '00000000-0000-4000-8000-000000000451',
    '00000000-0000-4000-8000-000000000411',
    'product.create_with_variants', v_payload, repeat('4', 64),
    '00000000-0000-4000-8000-000000000401'
  );
  v_replay := public.server_execute_variant_sku_sequence_command(
    '00000000-0000-4000-8000-000000000451',
    '00000000-0000-4000-8000-000000000411',
    'product.create_with_variants', v_payload, repeat('4', 64),
    '00000000-0000-4000-8000-000000000401'
  );
  if (v_result ->> 'variant_count')::integer <> 2
     or (select last_sequence from public.sku_product_sequences
         where organization_id = '00000000-0000-4000-8000-000000000411' and prefix = 'TS') <> 1 then
    raise exception 'atomic create result mismatch: %', v_result;
  end if;
  if v_result <> v_replay then
    raise exception 'idempotent replay changed result';
  end if;
  if (select count(*) from public.skus where organization_id = '00000000-0000-4000-8000-000000000411'
      and sku_code in ('TS-001-GLD', 'TS-001-SLV')) <> 2 then
    raise exception 'atomic create did not persist both SKU rows';
  end if;
end;
$$;

do $$
declare
  v_preview jsonb;
begin
  v_preview := public.server_preview_variant_sku_sequence(
    '00000000-0000-4000-8000-000000000411', 'TS',
    '00000000-0000-4000-8000-000000000401', 3::smallint
  );
  if (v_preview ->> 'formatted_sequence') <> '002' then
    raise exception 'preview did not advance to two: %', v_preview;
  end if;
end;
$$;

do $$
begin
  begin
    perform public.server_execute_variant_sku_sequence_command(
      '00000000-0000-4000-8000-000000000452',
      '00000000-0000-4000-8000-000000000411',
      'product.create_with_variants',
      '{
        "name":"SKU-04 Stale Product",
        "category_id":"00000000-0000-4000-8000-000000000431",
        "structure_type":"variant","base_unit_code":"piece",
        "sku_prefix":"TS","sku_product_sequence":1,"sku_sequence_digits":3,
        "option_groups":[{"name":"สี","kind":"color","values":[{"name":"ดำ","code":"BLK"}]}],
        "variants":[{"key":"black","name":"Stale · ดำ","sku_code":"TS-001-BLK","sales_code":"S403","status":"draft","sale_price":100,"option_codes":["BLK"]}]
      }'::jsonb,
      repeat('5', 64), '00000000-0000-4000-8000-000000000401'
    );
    raise exception 'expected SKU Product Sequence conflict';
  exception when unique_violation then
    if sqlerrm <> 'sku_product_sequence_conflict' then raise; end if;
  end;
  if exists (select 1 from public.products where organization_id = '00000000-0000-4000-8000-000000000411' and name = 'SKU-04 Stale Product')
     or exists (select 1 from public.foundation_commands where id = '00000000-0000-4000-8000-000000000452') then
    raise exception 'conflict did not roll back the Product';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.server_execute_variant_sku_sequence_command(
      '00000000-0000-4000-8000-000000000453',
      '00000000-0000-4000-8000-000000000411',
      'product.create_with_variants',
      '{
        "name":"SKU-04 Invalid Product",
        "category_id":"00000000-0000-4000-8000-000000000431",
        "structure_type":"variant","base_unit_code":"piece",
        "sku_prefix":"TS","sku_product_sequence":2,"sku_sequence_digits":3,
        "option_groups":[{"name":"สี","kind":"color","values":[{"name":"แดง","code":"RED"}]}],
        "variants":[{"key":"red","name":"Invalid · แดง","sku_code":"WRONG-002-RED","sales_code":"S404","status":"draft","sale_price":100,"option_codes":["RED"]}]
      }'::jsonb,
      repeat('6', 64), '00000000-0000-4000-8000-000000000401'
    );
    raise exception 'expected format mismatch';
  exception when invalid_parameter_value then null;
  end;
  if (select last_sequence from public.sku_product_sequences
      where organization_id = '00000000-0000-4000-8000-000000000411' and prefix = 'TS') <> 1 then
    raise exception 'failed create advanced the sequence';
  end if;
end;
$$;

do $$
declare
  v_payload jsonb := '{
    "name":"SKU-04 Product Five",
    "category_id":"00000000-0000-4000-8000-000000000431",
    "structure_type":"variant","base_unit_code":"piece",
    "sku_prefix":"TS","sku_product_sequence":5,"sku_sequence_digits":3,
    "option_groups":[{"name":"สี","kind":"color","values":[{"name":"น้ำเงิน","code":"BLU"}]}],
    "variants":[{"key":"blue","name":"Product Five · น้ำเงิน","sku_code":"TS-005-BLU","sales_code":"S405","status":"draft","sale_price":100,"option_codes":["BLU"]}]
  }'::jsonb;
  v_preview jsonb;
begin
  perform public.server_execute_variant_sku_sequence_command(
    '00000000-0000-4000-8000-000000000455',
    '00000000-0000-4000-8000-000000000411',
    'product.create_with_variants', v_payload, repeat('7', 64),
    '00000000-0000-4000-8000-000000000401'
  );
  v_preview := public.server_preview_variant_sku_sequence(
    '00000000-0000-4000-8000-000000000411', 'TS',
    '00000000-0000-4000-8000-000000000401', 3::smallint
  );
  if (v_preview ->> 'formatted_sequence') <> '006' then
    raise exception 'gap policy did not keep the high-water mark: %', v_preview;
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('anon', 'public.sku_product_sequences', 'SELECT')
     or has_table_privilege('authenticated', 'public.sku_product_sequences', 'SELECT')
     or has_function_privilege('anon', 'public.server_preview_variant_sku_sequence(uuid,text,uuid,smallint)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.server_execute_variant_sku_sequence_command(uuid,uuid,text,jsonb,text,uuid,timestamptz)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.server_preview_variant_sku_sequence(uuid,text,uuid,smallint)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.server_execute_variant_sku_sequence_command(uuid,uuid,text,jsonb,text,uuid,timestamptz)', 'EXECUTE') then
    raise exception 'function privilege boundary is incorrect';
  end if;
end;
$$;

rollback;
