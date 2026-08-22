\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, created_at, updated_at)
values (
  '00000000-0000-4000-8000-00000000b301',
  'rapid-be03b-owner@example.test', now(), now()
);

insert into public.organizations (
  id, name, slug, status, timezone, currency, created_by
) values (
  '00000000-0000-4000-8000-00000000b311',
  'Rapid BE03B Organization', 'rapid-be03b-organization', 'active',
  'Asia/Bangkok', 'THB', '00000000-0000-4000-8000-00000000b301'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000b301","role":"authenticated","aal":"aal1"}',
  true
);

insert into public.branches (
  id, organization_id, code, name, status, created_by
) values (
  '00000000-0000-4000-8000-00000000b321',
  '00000000-0000-4000-8000-00000000b311',
  'BKK-01', 'Rapid BE03B Branch', 'active',
  '00000000-0000-4000-8000-00000000b301'
);

select set_config('request.jwt.claims', '', true);

insert into public.product_categories (
  id, organization_id, name, created_by, updated_by
) values (
  '00000000-0000-4000-8000-00000000b331',
  '00000000-0000-4000-8000-00000000b311',
  'Rapid BE03B Category',
  '00000000-0000-4000-8000-00000000b301',
  '00000000-0000-4000-8000-00000000b301'
);

do $$
declare
  v_org constant uuid := '00000000-0000-4000-8000-00000000b311';
  v_actor constant uuid := '00000000-0000-4000-8000-00000000b301';
  v_branch constant uuid := '00000000-0000-4000-8000-00000000b321';
  v_category constant uuid := '00000000-0000-4000-8000-00000000b331';
  v_reserve_payload jsonb;
  v_reserve_result jsonb;
  v_batch_id uuid;
  v_payload jsonb;
  v_result jsonb;
  v_replay jsonb;
begin
  v_reserve_payload := jsonb_build_object(
    'prefix', 'A', 'quantity', 3, 'ttl_hours', 3
  );
  v_reserve_result := public.server_reserve_global_sales_code_range(
    '00000000-0000-4000-8000-00000000b341', v_org, 'A', 3,
    encode(extensions.digest(v_reserve_payload::text, 'sha256'), 'hex'),
    v_actor
  );
  v_batch_id := (v_reserve_result ->> 'batch_id')::uuid;

  -- Submit an explicit subset (A001 and A003). A002 must stay reserved.
  v_payload := jsonb_build_object(
    'sales_code_mode', 'reserved_batch',
    'reservation_batch_id', v_batch_id,
    'creation_items', jsonb_build_array(
      jsonb_build_object(
        'client_row_id', 'rapid-row-001',
        'command_id', '00000000-0000-4000-8000-00000000b351',
        'command_type', 'product.create_with_initial_sku',
        'sales_code', 'A001',
        'payload', jsonb_build_object(
          'name', 'Rapid BE03B A001', 'sku_name', 'Rapid BE03B A001',
          'sku_code', 'A001', 'category_id', v_category,
          'structure_type', 'standard', 'base_unit_code', 'piece',
          'sale_price', 490
        ),
        'handoff', jsonb_build_object(
          'branch_id', v_branch, 'initial_stock', 12
        )
      ),
      jsonb_build_object(
        'client_row_id', 'rapid-row-003',
        'command_id', '00000000-0000-4000-8000-00000000b353',
        'command_type', 'product.create_with_initial_sku',
        'sales_code', 'A003',
        'payload', jsonb_build_object(
          'name', 'Rapid BE03B A003', 'sku_name', 'Rapid BE03B A003',
          'sku_code', 'A003', 'category_id', v_category,
          'structure_type', 'standard', 'base_unit_code', 'pair',
          'sale_price', 590
        ),
        'handoff', jsonb_build_object(
          'branch_id', v_branch, 'initial_stock', 0
        )
      )
    )
  );

  v_result := public.server_execute_global_sales_code_creation(
    '00000000-0000-4000-8000-00000000b359', v_org, 'rapid', v_payload,
    encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_actor
  );
  v_replay := public.server_execute_global_sales_code_creation(
    '00000000-0000-4000-8000-00000000b359', v_org, 'rapid', v_payload,
    encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_actor
  );

  if v_result <> v_replay
     or v_result ->> 'status' <> 'succeeded'
     or (v_result ->> 'created_count')::integer <> 2
     or (v_result ->> 'sku_count')::integer <> 2
     or v_result ->> 'initial_stock_boundary' <> 'rapid-be-05-pending'
     or v_result ->> 'image_boundary' <> 'rapid-be-04-pending'
     or (v_result ->> 'inventory_posted')::boolean
     or (v_result ->> 'images_finalized')::boolean
     or v_result -> 'items' -> 0 ->> 'client_row_id' <> 'rapid-row-001'
     or v_result -> 'items' -> 1 ->> 'client_row_id' <> 'rapid-row-003'
     or v_result -> 'sales_codes' <> '["A001", "A003"]'::jsonb then
    raise exception 'rapid_be03b_subset_or_replay_failed: %', v_result;
  end if;

  if (select count(*) from public.products
      where organization_id = v_org
        and name in ('Rapid BE03B A001', 'Rapid BE03B A003')) <> 2
     or (select count(*) from public.skus
         where organization_id = v_org
           and sku_code = sales_code
           and sales_code in ('A001', 'A003')
           and status = 'draft') <> 2
     or (select count(*) from public.sales_code_reservations
         where organization_id = v_org and batch_id = v_batch_id
           and code in ('A001', 'A003') and status = 'assigned') <> 2
     or (select count(*) from public.sales_code_reservations
         where organization_id = v_org and batch_id = v_batch_id
           and code = 'A002' and status = 'reserved') <> 1
     or (select status from public.sales_code_reservation_batches
         where organization_id = v_org and id = v_batch_id) <> 'active' then
    raise exception 'rapid_be03b_persistence_or_subset_state_failed';
  end if;
end;
$$;

-- A malformed row in the selected set must roll back the complete command and
-- must not consume either reservation.
do $$
declare
  v_org constant uuid := '00000000-0000-4000-8000-00000000b311';
  v_actor constant uuid := '00000000-0000-4000-8000-00000000b301';
  v_branch constant uuid := '00000000-0000-4000-8000-00000000b321';
  v_category constant uuid := '00000000-0000-4000-8000-00000000b331';
  v_reserve_payload jsonb := jsonb_build_object(
    'prefix', 'B', 'quantity', 2, 'ttl_hours', 3
  );
  v_reserve_result jsonb;
  v_batch_id uuid;
  v_payload jsonb;
begin
  v_reserve_result := public.server_reserve_global_sales_code_range(
    '00000000-0000-4000-8000-00000000b361', v_org, 'B', 2,
    encode(extensions.digest(v_reserve_payload::text, 'sha256'), 'hex'),
    v_actor
  );
  v_batch_id := (v_reserve_result ->> 'batch_id')::uuid;
  v_payload := jsonb_build_object(
    'sales_code_mode', 'reserved_batch',
    'reservation_batch_id', v_batch_id,
    'creation_items', jsonb_build_array(
      jsonb_build_object(
        'client_row_id', 'rapid-rollback-001',
        'command_id', '00000000-0000-4000-8000-00000000b371',
        'sales_code', 'B001',
        'payload', jsonb_build_object(
          'name', 'Rapid Rollback B001', 'sku_name', 'Rapid Rollback B001',
          'sku_code', 'B001', 'category_id', v_category,
          'structure_type', 'standard', 'base_unit_code', 'piece',
          'sale_price', 100
        ),
        'handoff', jsonb_build_object('branch_id', v_branch, 'initial_stock', 1)
      ),
      jsonb_build_object(
        'client_row_id', 'rapid-rollback-002',
        'command_id', '00000000-0000-4000-8000-00000000b372',
        'sales_code', 'B002',
        'payload', jsonb_build_object(
          'name', 'Rapid Rollback B002', 'sku_name', 'Rapid Rollback B002',
          'sku_code', 'B002', 'category_id', v_category,
          'structure_type', 'standard', 'base_unit_code', 'unsupported',
          'sale_price', 100
        ),
        'handoff', jsonb_build_object('branch_id', v_branch, 'initial_stock', 1)
      )
    )
  );

  begin
    perform public.server_execute_global_sales_code_creation(
      '00000000-0000-4000-8000-00000000b379', v_org, 'rapid', v_payload,
      encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_actor
    );
    raise exception 'rapid_be03b_expected_invalid_row';
  exception when sqlstate '22023' then
    if sqlerrm <> 'rapid_row_invalid' then raise; end if;
  end;

  if exists (select 1 from public.products where organization_id = v_org
             and name like 'Rapid Rollback B%')
     or exists (select 1 from public.global_sales_code_creation_commands
                where id = '00000000-0000-4000-8000-00000000b379')
     or (select count(*) from public.sales_code_reservations
         where organization_id = v_org and batch_id = v_batch_id
           and status = 'reserved') <> 2 then
    raise exception 'rapid_be03b_atomic_rollback_failed';
  end if;
end;
$$;

-- The trusted function remains closed to Browser roles and no new table/RPC
-- surface is introduced by Rapid-BE-03B.
do $$
begin
  if has_function_privilege(
       'anon',
       'public.server_execute_global_sales_code_creation(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.server_execute_global_sales_code_creation(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.server_execute_global_sales_code_creation(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)',
       'EXECUTE'
     ) then
    raise exception 'rapid_be03b_security_surface_failed';
  end if;

  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'rapid%creation%'
      and c.relkind in ('r', 'p')
  ) then
    raise exception 'rapid_be03b_duplicate_table_surface_created';
  end if;
end;
$$;

rollback;

select 'RAPID_BE_03B_RESERVED_BATCH_CREATION_OK' as result;
