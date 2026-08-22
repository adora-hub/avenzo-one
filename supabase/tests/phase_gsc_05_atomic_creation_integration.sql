\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000a501', 'gsc05-owner@example.test', now(), now());

insert into public.organizations (
  id, name, slug, status, timezone, currency, created_by
) values (
  '00000000-0000-4000-8000-00000000a511', 'GSC05 Organization',
  'gsc05-organization', 'active', 'Asia/Bangkok', 'THB',
  '00000000-0000-4000-8000-00000000a501'
);

do $$
declare
  v_owner_role uuid;
  v_membership uuid;
begin
  select id into strict v_membership from public.organization_members
  where organization_id = '00000000-0000-4000-8000-00000000a511'
    and user_id = '00000000-0000-4000-8000-00000000a501';
  select id into v_owner_role from public.organization_roles
  where organization_id = '00000000-0000-4000-8000-00000000a511' and code = 'owner';
  if v_owner_role is null then
    insert into public.organization_roles (
      id, organization_id, code, name, description, is_system, created_by
    ) values (
      '00000000-0000-4000-8000-00000000a521',
      '00000000-0000-4000-8000-00000000a511', 'owner', 'Owner',
      'GSC-05 owner', true, '00000000-0000-4000-8000-00000000a501'
    ) returning id into v_owner_role;
  end if;
  insert into public.member_roles (membership_id, role_id)
  values (v_membership, v_owner_role) on conflict do nothing;
end;
$$;

insert into public.product_categories (
  id, organization_id, name, created_by, updated_by
) values (
  '00000000-0000-4000-8000-00000000a531',
  '00000000-0000-4000-8000-00000000a511', 'GSC-05 Category',
  '00000000-0000-4000-8000-00000000a501',
  '00000000-0000-4000-8000-00000000a501'
);

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-00000000a511';
  v_actor uuid := '00000000-0000-4000-8000-00000000a501';
  v_payload jsonb;
  v_result jsonb;
  v_replay jsonb;
begin
  v_payload := jsonb_build_object(
    'sales_code_mode', 'sequence',
    'requested_prefix', 'N',
    'allocator_command_id', '00000000-0000-4000-8000-00000000a541',
    'creation_items', jsonb_build_array(jsonb_build_object(
      'command_id', '00000000-0000-4000-8000-00000000a542',
      'command_type', 'product.create_with_initial_sku',
      'payload', jsonb_build_object(
        'name', 'GSC05 Normal', 'sku_name', 'GSC05 Normal',
        'sku_code', 'GSC05-NORMAL-001',
        'category_id', '00000000-0000-4000-8000-00000000a531',
        'structure_type', 'standard', 'base_unit_code', 'piece',
        'sale_price', 100
      )
    ))
  );
  v_result := public.server_execute_global_sales_code_creation(
    '00000000-0000-4000-8000-00000000a543', v_org, 'normal', v_payload,
    encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_actor
  );
  v_replay := public.server_execute_global_sales_code_creation(
    '00000000-0000-4000-8000-00000000a543', v_org, 'normal', v_payload,
    encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_actor
  );
  if v_result <> v_replay
     or v_result -> 'sales_codes' ->> 0 <> 'N001'
     or (select sales_code from public.skus where id = (v_result -> 'results' -> 0 ->> 'sku_id')::uuid) <> 'N001'
     or (select count(*) from public.sales_code_reservations
         where organization_id = v_org and code = 'N001' and status = 'assigned') <> 1 then
    raise exception 'gsc05_normal_or_replay_failed: %', v_result;
  end if;
end;
$$;

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-00000000a511';
  v_actor uuid := '00000000-0000-4000-8000-00000000a501';
  v_variant_payload jsonb;
  v_payload jsonb;
  v_result jsonb;
begin
  v_variant_payload := jsonb_build_object(
    'name', 'GSC05 Variant',
    'category_id', '00000000-0000-4000-8000-00000000a531',
    'structure_type', 'variant', 'base_unit_code', 'piece',
    'sku_prefix', 'GV', 'sku_product_sequence', 1, 'sku_sequence_digits', 3,
    'option_groups', jsonb_build_array(jsonb_build_object(
      'name', 'สี', 'kind', 'color', 'values', jsonb_build_array(
        jsonb_build_object('name', 'ทอง', 'code', 'GLD'),
        jsonb_build_object('name', 'เงิน', 'code', 'SLV')
      )
    )),
    'variants', jsonb_build_array(
      jsonb_build_object('key', 'gold', 'name', 'GSC05 Variant Gold',
        'sku_code', 'GV-001-GLD', 'status', 'draft', 'sale_price', 200,
        'option_codes', jsonb_build_array('GLD')),
      jsonb_build_object('key', 'silver', 'name', 'GSC05 Variant Silver',
        'sku_code', 'GV-001-SLV', 'status', 'draft', 'sale_price', 200,
        'option_codes', jsonb_build_array('SLV'))
    )
  );
  v_payload := jsonb_build_object(
    'sales_code_mode', 'sequence', 'requested_prefix', 'V',
    'allocator_command_id', '00000000-0000-4000-8000-00000000a551',
    'creation_items', jsonb_build_array(jsonb_build_object(
      'command_id', '00000000-0000-4000-8000-00000000a552',
      'payload', v_variant_payload
    ))
  );
  v_result := public.server_execute_global_sales_code_creation(
    '00000000-0000-4000-8000-00000000a553', v_org, 'variant', v_payload,
    encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_actor
  );
  if (v_result ->> 'sku_count')::integer <> 2
     or v_result -> 'sales_codes' ->> 0 <> 'V001'
     or v_result -> 'sales_codes' ->> 1 <> 'V002'
     or (select count(*) from public.skus
         where product_id = (v_result -> 'results' -> 0 ->> 'product_id')::uuid
           and sales_code in ('V001', 'V002')) <> 2 then
    raise exception 'gsc05_variant_failed: %', v_result;
  end if;
end;
$$;

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-00000000a511';
  v_actor uuid := '00000000-0000-4000-8000-00000000a501';
  v_items jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_result jsonb;
  n integer;
begin
  for n in 1..50 loop
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'command_id', ('00000000-0000-4000-8000-' || lpad((560 + n)::text, 12, '0'))::uuid,
      'command_type', 'product.create_with_initial_sku',
      'payload', jsonb_build_object(
        'name', 'GSC05 Rapid ' || n, 'sku_name', 'GSC05 Rapid ' || n,
        'sku_code', 'GSC05-RAPID-' || lpad(n::text, 3, '0'),
        'category_id', '00000000-0000-4000-8000-00000000a531',
        'structure_type', 'standard', 'base_unit_code', 'piece',
        'sale_price', 300
      )
    ));
  end loop;
  v_payload := jsonb_build_object(
    'sales_code_mode', 'sequence', 'requested_prefix', 'R',
    'allocator_command_id', '00000000-0000-4000-8000-00000000a559',
    'creation_items', v_items
  );
  v_result := public.server_execute_global_sales_code_creation(
    '00000000-0000-4000-8000-00000000a558', v_org, 'rapid', v_payload,
    encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_actor
  );
  if (v_result ->> 'created_count')::integer <> 50
     or (v_result ->> 'sku_count')::integer <> 50
     or v_result -> 'sales_codes' ->> 0 <> 'R001'
     or v_result -> 'sales_codes' ->> 49 <> 'R050'
     or (select count(*) from public.products
         where organization_id = v_org and name like 'GSC05 Rapid %') <> 50
     or (select count(*) from public.sales_code_reservations
         where organization_id = v_org and code between 'R001' and 'R050'
           and status = 'assigned') <> 50
     or (v_result ->> 'inventory_posted')::boolean then
    raise exception 'gsc05_rapid_50_failed: %', v_result;
  end if;
end;
$$;

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-00000000a511';
  v_actor uuid := '00000000-0000-4000-8000-00000000a501';
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'sales_code_mode', 'manual',
    'creation_items', jsonb_build_array(
      jsonb_build_object('command_id', '00000000-0000-4000-8000-00000000a661',
        'payload', jsonb_build_object('name', 'GSC05 Rollback One', 'sku_name', 'Rollback One',
          'sku_code', 'GSC05-RB-1', 'sales_code', 'M001',
          'category_id', '00000000-0000-4000-8000-00000000a531',
          'structure_type', 'standard', 'base_unit_code', 'piece')),
      jsonb_build_object('command_id', '00000000-0000-4000-8000-00000000a662',
        'payload', jsonb_build_object('name', 'GSC05 Rollback Two', 'sku_name', 'Rollback Two',
          'sku_code', 'GSC05-RB-2', 'sales_code', 'M001',
          'category_id', '00000000-0000-4000-8000-00000000a531',
          'structure_type', 'standard', 'base_unit_code', 'piece'))
    )
  );
  begin
    perform public.server_execute_global_sales_code_creation(
      '00000000-0000-4000-8000-00000000a663', v_org, 'rapid', v_payload,
      encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_actor
    );
    raise exception 'gsc05_expected_atomic_conflict';
  exception when unique_violation then null;
  end;
  if exists (select 1 from public.products where organization_id = v_org
             and name in ('GSC05 Rollback One', 'GSC05 Rollback Two'))
     or exists (select 1 from public.global_sales_code_creation_commands
                where id = '00000000-0000-4000-8000-00000000a663') then
    raise exception 'gsc05_partial_rollback_detected';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('anon', 'public.global_sales_code_creation_commands', 'SELECT')
     or has_table_privilege('authenticated', 'public.global_sales_code_creation_commands', 'SELECT')
     or has_function_privilege('anon', 'public.server_execute_global_sales_code_creation(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.server_execute_global_sales_code_creation(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.server_execute_global_sales_code_creation(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)', 'EXECUTE') then
    raise exception 'gsc05_security_surface_failed';
  end if;
end;
$$;

rollback;

select 'PHASE_GSC_05_ATOMIC_CREATION_INTEGRATION_OK' as result;
