\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000b501', 'b5-owner@example.test', now(), now());

insert into public.organizations (
  id, name, slug, status, timezone, currency, created_by
) values (
  '00000000-0000-4000-8000-00000000b511', 'B5 Variant Organization',
  'b5-variant-organization', 'active', 'Asia/Bangkok', 'THB',
  '00000000-0000-4000-8000-00000000b501'
);

do $$
declare
  v_owner_role uuid;
  v_owner_membership uuid;
begin
  select id into v_owner_role from public.organization_roles
  where organization_id = '00000000-0000-4000-8000-00000000b511' and code = 'owner';
  select id into strict v_owner_membership from public.organization_members
  where organization_id = '00000000-0000-4000-8000-00000000b511'
    and user_id = '00000000-0000-4000-8000-00000000b501';
  if v_owner_role is null then
    insert into public.organization_roles (
      id, organization_id, code, name, description, is_system, created_by
    ) values (
      '00000000-0000-4000-8000-00000000b521',
      '00000000-0000-4000-8000-00000000b511',
      'owner', 'Owner', 'B5 test owner', true,
      '00000000-0000-4000-8000-00000000b501'
    ) returning id into v_owner_role;
  end if;
  insert into public.member_roles (membership_id, role_id)
  values (v_owner_membership, v_owner_role) on conflict do nothing;
end;
$$;

insert into public.product_categories (
  id, organization_id, name, created_by, updated_by
) values (
  '00000000-0000-4000-8000-00000000b531',
  '00000000-0000-4000-8000-00000000b511',
  'B5 Apparel',
  '00000000-0000-4000-8000-00000000b501',
  '00000000-0000-4000-8000-00000000b501'
);

do $$
declare
  v_payload jsonb := '{
    "name":"B5 Variant Shirt",
    "description":"Atomic multi-variant test",
    "category_id":"00000000-0000-4000-8000-00000000b531",
    "structure_type":"variant",
    "base_unit_code":"piece",
    "quantity_behavior":"discrete",
    "currency_code":"THB",
    "tax_category":"standard",
    "tax_rate":7,
    "cost_price":120,
    "option_groups":[
      {"name":"สี","kind":"color","values":[
        {"name":"สีฟ้า","code":"BLU","aliases":["ฟ้า"]},
        {"name":"สีดำ","code":"BLK","aliases":["ดำ"]}
      ]},
      {"name":"ไซซ์","kind":"size","values":[
        {"name":"S","code":"S","aliases":["Small"]},
        {"name":"M","code":"M","aliases":["Medium"]}
      ]}
    ],
    "variants":[
      {"key":"blue-s","name":"B5 Variant Shirt · สีฟ้า · S","sku_code":"B5-SHIRT-BLU-S","barcode":"2950000000001","status":"draft","sale_price":390,"option_codes":["BLU","S"],"image_client_id":"image-blue"},
      {"key":"blue-m","name":"B5 Variant Shirt · สีฟ้า · M","sku_code":"B5-SHIRT-BLU-M","barcode":"2950000000002","status":"draft","sale_price":390,"option_codes":["BLU","M"],"image_client_id":"image-blue"},
      {"key":"black-s","name":"B5 Variant Shirt · สีดำ · S","sku_code":"B5-SHIRT-BLK-S","barcode":"2950000000003","status":"active","sale_price":420,"option_codes":["BLK","S"],"image_client_id":"image-black"},
      {"key":"black-m","name":"B5 Variant Shirt · สีดำ · M","sku_code":"B5-SHIRT-BLK-M","barcode":"2950000000004","status":"active","sale_price":420,"option_codes":["BLK","M"],"image_client_id":"image-black"}
    ]
  }'::jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_product_id uuid;
  v_first_sku_id uuid;
  v_image_id uuid := '00000000-0000-4000-8000-00000000b541';
  v_assign_result jsonb;
begin
  v_result := public.server_execute_variant_creation_command(
    '00000000-0000-4000-8000-00000000b551',
    '00000000-0000-4000-8000-00000000b511',
    'product.create_with_variants', v_payload, repeat('5', 64),
    '00000000-0000-4000-8000-00000000b501'
  );
  v_replay := public.server_execute_variant_creation_command(
    '00000000-0000-4000-8000-00000000b551',
    '00000000-0000-4000-8000-00000000b511',
    'product.create_with_variants', v_payload, repeat('5', 64),
    '00000000-0000-4000-8000-00000000b501'
  );

  if v_result <> v_replay then raise exception 'B5 idempotent replay changed result'; end if;
  if (v_result ->> 'variant_count')::integer <> 4
     or (v_result ->> 'option_group_count')::integer <> 2
     or jsonb_array_length(v_result -> 'variants') <> 4 then
    raise exception 'B5 result count mismatch: %', v_result;
  end if;

  v_product_id := (v_result ->> 'product_id')::uuid;
  v_first_sku_id := (v_result -> 'variants' -> 0 ->> 'sku_id')::uuid;
  if (select count(*) from public.skus where product_id = v_product_id) <> 4
     or (select count(*) from public.product_option_groups where product_id = v_product_id) <> 2
     or (select count(*) from public.product_option_values v join public.product_option_groups g on g.id = v.option_group_id where g.product_id = v_product_id) <> 4
     or (select count(*) from public.sku_option_assignments where product_id = v_product_id) <> 8
     or (select count(*) from public.sku_identifier_registry r join public.skus s on s.id = r.sku_id where s.product_id = v_product_id) <> 8 then
    raise exception 'B5 atomic graph is incomplete';
  end if;

  insert into public.product_image_commands (
    id, organization_id, command_type, payload, request_hash, actor_user_id
  ) values (
    '00000000-0000-4000-8000-00000000b554',
    '00000000-0000-4000-8000-00000000b511',
    'product.image.prepare', '{}'::jsonb, repeat('8', 64),
    '00000000-0000-4000-8000-00000000b501'
  );
  perform set_config('avenzo.product_image_command_id', '00000000-0000-4000-8000-00000000b554', true);
  perform set_config('avenzo.product_image_organization_id', '00000000-0000-4000-8000-00000000b511', true);
  insert into public.product_images (
    id, organization_id, product_id, storage_path, original_file_name,
    mime_type, file_size_bytes, alt_text, sort_order, is_cover, status,
    created_by, updated_by, finalized_at
  ) values (
    v_image_id, '00000000-0000-4000-8000-00000000b511', v_product_id,
    '00000000-0000-4000-8000-00000000b511/' || v_product_id::text || '/' || v_image_id::text || '.jpg',
    'b5-blue.jpg', 'image/jpeg', 1000, 'B5 blue variant', 1, true, 'ready',
    '00000000-0000-4000-8000-00000000b501', '00000000-0000-4000-8000-00000000b501', now()
  );

  v_assign_result := public.server_execute_variant_creation_command(
    '00000000-0000-4000-8000-00000000b552',
    '00000000-0000-4000-8000-00000000b511',
    'product.variant_images.assign',
    jsonb_build_object('product_id', v_product_id, 'assignments', jsonb_build_array(
      jsonb_build_object('sku_id', v_first_sku_id, 'product_image_id', v_image_id)
    )), repeat('6', 64), '00000000-0000-4000-8000-00000000b501'
  );
  if (v_assign_result ->> 'image_assignment_count')::integer <> 1
     or not exists (select 1 from public.sku_variant_images where sku_id = v_first_sku_id and product_image_id = v_image_id) then
    raise exception 'B5 recoverable variant image assignment failed';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.server_execute_variant_creation_command(
      '00000000-0000-4000-8000-00000000b553',
      '00000000-0000-4000-8000-00000000b511',
      'product.create_with_variants',
      '{
        "name":"B5 Must Roll Back",
        "category_id":"00000000-0000-4000-8000-00000000b531",
        "structure_type":"variant",
        "base_unit_code":"piece",
        "option_groups":[{"name":"สี","kind":"color","values":[{"name":"สีฟ้า","code":"BLU"}]}],
        "variants":[
          {"key":"one","name":"Duplicate one","sku_code":"B5-DUPLICATE","status":"draft","sale_price":100,"option_codes":["BLU"]},
          {"key":"two","name":"Duplicate two","sku_code":"B5-DUPLICATE","status":"draft","sale_price":100,"option_codes":["BLU"]}
        ]
      }'::jsonb,
      repeat('7', 64), '00000000-0000-4000-8000-00000000b501'
    );
    raise exception 'B5 expected duplicate SKU rollback';
  exception when unique_violation then null;
  end;

  if exists (select 1 from public.products where name = 'B5 Must Roll Back')
     or exists (select 1 from public.foundation_commands where id = '00000000-0000-4000-8000-00000000b553') then
    raise exception 'B5 left partial state after duplicate SKU';
  end if;
end;
$$;

do $$
begin
  if has_function_privilege('anon', 'public.server_execute_variant_creation_command(uuid,uuid,text,jsonb,text,uuid,timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.server_execute_variant_creation_command(uuid,uuid,text,jsonb,text,uuid,timestamptz)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.server_execute_variant_creation_command(uuid,uuid,text,jsonb,text,uuid,timestamptz)', 'EXECUTE') then
    raise exception 'B5 function privilege boundary is incorrect';
  end if;
end;
$$;

rollback;
