\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000b401', 'a4-owner@example.test', now(), now());

insert into public.organizations (
  id, name, slug, status, timezone, currency, created_by
) values (
  '00000000-0000-4000-8000-00000000b411', 'A4 Organization',
  'a4-organization', 'active', 'Asia/Bangkok', 'THB',
  '00000000-0000-4000-8000-00000000b401'
);

insert into public.products (
  id, organization_id, name, status, created_by, updated_by
) values
  ('00000000-0000-4000-8000-00000000b501', '00000000-0000-4000-8000-00000000b411', 'A4 Product 1', 'draft', '00000000-0000-4000-8000-00000000b401', '00000000-0000-4000-8000-00000000b401'),
  ('00000000-0000-4000-8000-00000000b502', '00000000-0000-4000-8000-00000000b411', 'A4 Product 2', 'draft', '00000000-0000-4000-8000-00000000b401', '00000000-0000-4000-8000-00000000b401'),
  ('00000000-0000-4000-8000-00000000b503', '00000000-0000-4000-8000-00000000b411', 'A4 Product 3', 'draft', '00000000-0000-4000-8000-00000000b401', '00000000-0000-4000-8000-00000000b401'),
  ('00000000-0000-4000-8000-00000000b504', '00000000-0000-4000-8000-00000000b411', 'A4 Product 4', 'draft', '00000000-0000-4000-8000-00000000b401', '00000000-0000-4000-8000-00000000b401'),
  ('00000000-0000-4000-8000-00000000b505', '00000000-0000-4000-8000-00000000b411', 'A4 Product 5', 'draft', '00000000-0000-4000-8000-00000000b401', '00000000-0000-4000-8000-00000000b401');

insert into public.skus (
  id, organization_id, product_id, sku_code, name, base_unit_code,
  status, created_by, updated_by
) values
  ('00000000-0000-4000-8000-00000000b601', '00000000-0000-4000-8000-00000000b411', '00000000-0000-4000-8000-00000000b501', 'A4-SKU-001', 'A4 SKU 1', 'piece', 'draft', '00000000-0000-4000-8000-00000000b401', '00000000-0000-4000-8000-00000000b401'),
  ('00000000-0000-4000-8000-00000000b602', '00000000-0000-4000-8000-00000000b411', '00000000-0000-4000-8000-00000000b502', 'A4-SKU-002', 'A4 SKU 2', 'piece', 'draft', '00000000-0000-4000-8000-00000000b401', '00000000-0000-4000-8000-00000000b401'),
  ('00000000-0000-4000-8000-00000000b603', '00000000-0000-4000-8000-00000000b411', '00000000-0000-4000-8000-00000000b503', 'A4-SKU-003', 'A4 SKU 3', 'piece', 'draft', '00000000-0000-4000-8000-00000000b401', '00000000-0000-4000-8000-00000000b401'),
  ('00000000-0000-4000-8000-00000000b604', '00000000-0000-4000-8000-00000000b411', '00000000-0000-4000-8000-00000000b504', 'A4-SKU-004', 'A4 SKU 4', 'piece', 'draft', '00000000-0000-4000-8000-00000000b401', '00000000-0000-4000-8000-00000000b401'),
  ('00000000-0000-4000-8000-00000000b605', '00000000-0000-4000-8000-00000000b411', '00000000-0000-4000-8000-00000000b505', 'A4-SKU-005', 'A4 SKU 5', 'piece', 'draft', '00000000-0000-4000-8000-00000000b401', '00000000-0000-4000-8000-00000000b401');

do $$
declare
  v_sequence_id uuid;
  v_live_sequence_id uuid;
  v_reserved_sequence_id uuid;
  v_batch_id uuid;
  v_reservation_id uuid;
  v_result jsonb;
  v_replay jsonb;
begin
  v_result := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000b701',
    '00000000-0000-4000-8000-00000000b411', 'sequence.create',
    '{"name":"A4 Permanent A","purpose":"permanent_sales","prefix":"A","start_number":1,"digit_count":3}'::jsonb,
    repeat('1', 64), '00000000-0000-4000-8000-00000000b401'
  );
  v_sequence_id := (v_result ->> 'sequence_id')::uuid;

  v_replay := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000b701',
    '00000000-0000-4000-8000-00000000b411', 'sequence.create',
    '{"name":"A4 Permanent A","purpose":"permanent_sales","prefix":"A","start_number":1,"digit_count":3}'::jsonb,
    repeat('1', 64), '00000000-0000-4000-8000-00000000b401'
  );
  if v_result <> v_replay then
    raise exception 'A4 idempotent replay returned a different result';
  end if;

  v_result := public.server_preview_sales_code_sequence(
    '00000000-0000-4000-8000-00000000b411', v_sequence_id,
    '00000000-0000-4000-8000-00000000b401', 3
  );
  if v_result -> 'codes' <> '["A001","A002","A003"]'::jsonb
     or (v_result ->> 'preview_only')::boolean is not true then
    raise exception 'A4 preview did not return A001-A003 without claiming them';
  end if;

  v_result := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000b702',
    '00000000-0000-4000-8000-00000000b411', 'permanent.allocate',
    jsonb_build_object('sequence_id', v_sequence_id, 'sku_id', '00000000-0000-4000-8000-00000000b601'),
    repeat('2', 64), '00000000-0000-4000-8000-00000000b401'
  );
  if v_result ->> 'sales_code' <> 'A001' then raise exception 'A4 expected A001'; end if;

  v_result := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000b703',
    '00000000-0000-4000-8000-00000000b411', 'permanent.allocate',
    jsonb_build_object('sequence_id', v_sequence_id, 'sku_id', '00000000-0000-4000-8000-00000000b602'),
    repeat('3', 64), '00000000-0000-4000-8000-00000000b401'
  );
  if v_result ->> 'sales_code' <> 'A002' then raise exception 'A4 expected A002'; end if;

  v_result := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000b704',
    '00000000-0000-4000-8000-00000000b411', 'permanent.allocate',
    jsonb_build_object('sequence_id', v_sequence_id, 'sku_id', '00000000-0000-4000-8000-00000000b603'),
    repeat('4', 64), '00000000-0000-4000-8000-00000000b401'
  );
  if v_result ->> 'sales_code' <> 'A003' then raise exception 'A4 expected A003'; end if;

  if (public.resolve_permanent_sku_identifier(
    '00000000-0000-4000-8000-00000000b411', 'a001',
    '00000000-0000-4000-8000-00000000b401'
  ) ->> 'sku_id')::uuid <> '00000000-0000-4000-8000-00000000b601' then
    raise exception 'A4 registry did not resolve A001 to SKU 1';
  end if;

  begin
    update public.skus set barcode = 'A001', updated_by = '00000000-0000-4000-8000-00000000b401'
    where id = '00000000-0000-4000-8000-00000000b604';
    raise exception 'A4 expected cross-field collision';
  exception when unique_violation then
    if sqlerrm not like '%identifier_cross_field_collision%' then raise; end if;
  end;

  begin
    update public.skus set sales_code = 'A099', updated_by = '00000000-0000-4000-8000-00000000b401'
    where id = '00000000-0000-4000-8000-00000000b601';
    raise exception 'A4 expected permanent Sales Code guard';
  exception when invalid_parameter_value then
    if sqlerrm not like '%sales_code_is_permanent%' then raise; end if;
  end;

  update public.skus set barcode = 'OLD-BARCODE', updated_by = '00000000-0000-4000-8000-00000000b401'
  where id = '00000000-0000-4000-8000-00000000b604';
  update public.skus set barcode = 'NEW-BARCODE', updated_by = '00000000-0000-4000-8000-00000000b401'
  where id = '00000000-0000-4000-8000-00000000b604';
  update public.skus set barcode = 'OLD-BARCODE', updated_by = '00000000-0000-4000-8000-00000000b401'
  where id = '00000000-0000-4000-8000-00000000b605';

  v_result := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000b705',
    '00000000-0000-4000-8000-00000000b411', 'sequence.create',
    '{"name":"A4 Live B","purpose":"live_code","prefix":"B","start_number":1,"digit_count":3}'::jsonb,
    repeat('5', 64), '00000000-0000-4000-8000-00000000b401'
  );
  v_live_sequence_id := (v_result ->> 'sequence_id')::uuid;
  v_result := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000b706',
    '00000000-0000-4000-8000-00000000b411', 'batch.reserve',
    jsonb_build_object('sequence_id', v_live_sequence_id, 'quantity', 70, 'expires_in_minutes', 120),
    repeat('6', 64), '00000000-0000-4000-8000-00000000b401'
  );
  if v_result ->> 'first_code' <> 'B001' or v_result ->> 'last_code' <> 'B070'
     or (v_result ->> 'quantity')::integer <> 70 then
    raise exception 'A4 expected B001-B070 reservation batch';
  end if;
  if (select count(*) from public.sales_code_reservations
      where batch_id = (v_result ->> 'batch_id')::uuid) <> 70 then
    raise exception 'A4 reservation batch did not create 70 codes';
  end if;

  v_result := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000b707',
    '00000000-0000-4000-8000-00000000b411', 'sequence.create',
    '{"name":"A4 Reserved P","purpose":"permanent_sales","prefix":"P","start_number":1,"digit_count":3}'::jsonb,
    repeat('7', 64), '00000000-0000-4000-8000-00000000b401'
  );
  v_reserved_sequence_id := (v_result ->> 'sequence_id')::uuid;
  v_result := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000b710',
    '00000000-0000-4000-8000-00000000b411', 'batch.reserve',
    jsonb_build_object('sequence_id', v_reserved_sequence_id, 'quantity', 2, 'expires_in_minutes', 60),
    repeat('8', 64), '00000000-0000-4000-8000-00000000b401'
  );
  v_batch_id := (v_result ->> 'batch_id')::uuid;
  select id into strict v_reservation_id
  from public.sales_code_reservations
  where organization_id = '00000000-0000-4000-8000-00000000b411'
    and batch_id = v_batch_id and code = 'P001';

  v_result := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000b708',
    '00000000-0000-4000-8000-00000000b411', 'reservation.assign',
    jsonb_build_object('reservation_id', v_reservation_id, 'sku_id', '00000000-0000-4000-8000-00000000b604'),
    repeat('9', 64), '00000000-0000-4000-8000-00000000b401'
  );
  if v_result ->> 'sales_code' <> 'P001' then raise exception 'A4 expected P001 assignment'; end if;

  perform public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000b709',
    '00000000-0000-4000-8000-00000000b411', 'batch.release',
    jsonb_build_object('batch_id', v_batch_id),
    repeat('a', 64), '00000000-0000-4000-8000-00000000b401'
  );
  if (select count(*) from public.sales_code_reservations
      where batch_id = v_batch_id and status = 'assigned') <> 1
     or (select count(*) from public.sales_code_reservations
      where batch_id = v_batch_id and status = 'released') <> 1 then
    raise exception 'A4 batch release changed assigned code or failed to release unused code';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('authenticated', 'public.sales_code_sequences', 'INSERT')
     or has_table_privilege('authenticated', 'public.sku_identifier_registry', 'UPDATE') then
    raise exception 'authenticated must not write A4 tables directly';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.server_execute_sales_code_command(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute A4 trusted command directly';
  end if;
  if (select count(*) from public.sales_code_allocator_events) <> 10 then
    raise exception 'A4 expected exactly one event per completed command';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000b401', true);

do $$
begin
  if (select count(*) from public.sales_code_sequences) <> 3 then
    raise exception 'A4 product.read actor did not see its three sequences';
  end if;
  if (select count(*) from public.sales_code_allocator_events) <> 10 then
    raise exception 'A4 product.read actor did not see allocator events';
  end if;
end;
$$;

reset role;
rollback;

select 'PHASE_2_1_A4_ATOMIC_SALES_CODE_ALLOCATOR_OK' as result;
