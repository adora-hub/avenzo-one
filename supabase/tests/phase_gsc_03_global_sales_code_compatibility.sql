\set ON_ERROR_STOP on

begin;

do $$
declare
  v_sequence_id uuid;
  v_live_sequence_id uuid;
  v_result jsonb;
begin
  if (select sales_code from public.skus
      where id = '00000000-0000-4000-8000-00000000d601') <> 'CF-LEGACY-01' then
    raise exception 'gsc03_legacy_sales_code_changed';
  end if;
  if (select standard_version from public.sales_code_sequences
      where id = '00000000-0000-4000-8000-00000000d701') <> 'legacy' then
    raise exception 'gsc03_existing_sequence_not_grandfathered';
  end if;

  update public.skus
  set name = 'Legacy SKU remains editable',
      updated_by = '00000000-0000-4000-8000-00000000d401'
  where id = '00000000-0000-4000-8000-00000000d601';

  begin
    update public.sales_code_sequences
    set next_number = next_number + 1
    where id = '00000000-0000-4000-8000-00000000d701';
    raise exception 'gsc03_expected_legacy_sequence_read_only';
  exception when check_violation then
    if sqlerrm not like '%sales_code_legacy_sequence_read_only%' then raise; end if;
  end;

  begin
    insert into public.skus (
      id, organization_id, product_id, sku_code, name, sales_code,
      base_unit_code, status, created_by, updated_by
    ) values (
      '00000000-0000-4000-8000-00000000d602',
      '00000000-0000-4000-8000-00000000d411',
      '00000000-0000-4000-8000-00000000d502',
      'GSC03-INVALID-000', 'Invalid zero', 'A000',
      'piece', 'draft',
      '00000000-0000-4000-8000-00000000d401',
      '00000000-0000-4000-8000-00000000d401'
    );
    raise exception 'gsc03_expected_zero_rejection';
  exception when check_violation then
    if sqlerrm not like '%global_sales_code_invalid%' then raise; end if;
  end;

  begin
    insert into public.skus (
      id, organization_id, product_id, sku_code, name, sales_code,
      base_unit_code, status, created_by, updated_by
    ) values (
      '00000000-0000-4000-8000-00000000d603',
      '00000000-0000-4000-8000-00000000d411',
      '00000000-0000-4000-8000-00000000d502',
      'GSC03-INVALID-TH', 'Invalid Thai', 'ก001',
      'piece', 'draft',
      '00000000-0000-4000-8000-00000000d401',
      '00000000-0000-4000-8000-00000000d401'
    );
    raise exception 'gsc03_expected_thai_rejection';
  exception when check_violation then
    if sqlerrm not like '%global_sales_code_invalid%' then raise; end if;
  end;

  begin
    insert into public.skus (
      id, organization_id, product_id, sku_code, name, sales_code,
      base_unit_code, status, created_by, updated_by
    ) values (
      '00000000-0000-4000-8000-00000000d604',
      '00000000-0000-4000-8000-00000000d411',
      '00000000-0000-4000-8000-00000000d502',
      'SAME-INVALID', 'Invalid same as SKU', 'SAME-INVALID',
      'piece', 'draft',
      '00000000-0000-4000-8000-00000000d401',
      '00000000-0000-4000-8000-00000000d401'
    );
    raise exception 'gsc03_expected_same_as_sku_rejection';
  exception when check_violation then
    if sqlerrm not like '%global_sales_code_invalid%' then raise; end if;
  end;

  insert into public.skus (
    id, organization_id, product_id, sku_code, name, sales_code,
    base_unit_code, status, created_by, updated_by
  ) values
    ('00000000-0000-4000-8000-00000000d605',
     '00000000-0000-4000-8000-00000000d411',
     '00000000-0000-4000-8000-00000000d502',
     'C001', 'Valid same as SKU', 'C001', 'piece', 'draft',
     '00000000-0000-4000-8000-00000000d401',
     '00000000-0000-4000-8000-00000000d401'),
    ('00000000-0000-4000-8000-00000000d606',
     '00000000-0000-4000-8000-00000000d411',
     '00000000-0000-4000-8000-00000000d502',
     'GSC03-LOWERCASE', 'Normalized manual', ' b001 ', 'piece', 'draft',
     '00000000-0000-4000-8000-00000000d401',
     '00000000-0000-4000-8000-00000000d401'),
    ('00000000-0000-4000-8000-00000000d607',
     '00000000-0000-4000-8000-00000000d411',
     '00000000-0000-4000-8000-00000000d502',
     'GSC03-UPPER-BOUND', 'Upper boundary', 'ZZZ999', 'piece', 'draft',
     '00000000-0000-4000-8000-00000000d401',
     '00000000-0000-4000-8000-00000000d401'),
    ('00000000-0000-4000-8000-00000000d608',
     '00000000-0000-4000-8000-00000000d411',
     '00000000-0000-4000-8000-00000000d502',
     'GSC03-AUTO', 'Trusted allocation target', null, 'piece', 'draft',
     '00000000-0000-4000-8000-00000000d401',
     '00000000-0000-4000-8000-00000000d401');

  if (select sales_code from public.skus
      where id = '00000000-0000-4000-8000-00000000d606') <> 'B001' then
    raise exception 'gsc03_database_normalization_failed';
  end if;

  v_result := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000d801',
    '00000000-0000-4000-8000-00000000d411', 'sequence.create',
    '{"name":"GSC03 D","purpose":"permanent_sales","prefix":"D","start_number":1,"digit_count":3}'::jsonb,
    repeat('1', 64), '00000000-0000-4000-8000-00000000d401'
  );
  v_sequence_id := (v_result ->> 'sequence_id')::uuid;

  if (select standard_version from public.sales_code_sequences
      where id = v_sequence_id) <> 'global_v1' then
    raise exception 'gsc03_new_sequence_not_global_v1';
  end if;

  v_result := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000d802',
    '00000000-0000-4000-8000-00000000d411', 'permanent.allocate',
    jsonb_build_object(
      'sequence_id', v_sequence_id,
      'sku_id', '00000000-0000-4000-8000-00000000d608'
    ),
    repeat('2', 64), '00000000-0000-4000-8000-00000000d401'
  );
  if v_result ->> 'sales_code' <> 'D001' then
    raise exception 'gsc03_trusted_global_assignment_failed';
  end if;

  begin
    perform public.server_execute_sales_code_command(
      '00000000-0000-4000-8000-00000000d803',
      '00000000-0000-4000-8000-00000000d411', 'sequence.create',
      '{"name":"Invalid Legacy","purpose":"permanent_sales","prefix":"ABCD","start_number":0,"digit_count":4}'::jsonb,
      repeat('3', 64), '00000000-0000-4000-8000-00000000d401'
    );
    raise exception 'gsc03_expected_invalid_trusted_sequence_rejection';
  exception when check_violation then
    if sqlerrm not like '%global_sales_code_sequence_invalid%'
       and sqlerrm not like '%sales_code_sequences_global_v1_definition_check%' then
      raise;
    end if;
  end;

  v_result := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000d804',
    '00000000-0000-4000-8000-00000000d411', 'sequence.create',
    '{"name":"GSC03 Live E","purpose":"live_code","prefix":"E","start_number":1,"digit_count":3}'::jsonb,
    repeat('4', 64), '00000000-0000-4000-8000-00000000d401'
  );
  v_live_sequence_id := (v_result ->> 'sequence_id')::uuid;
  v_result := public.server_execute_sales_code_command(
    '00000000-0000-4000-8000-00000000d805',
    '00000000-0000-4000-8000-00000000d411', 'batch.reserve',
    jsonb_build_object(
      'sequence_id', v_live_sequence_id,
      'quantity', 2,
      'expires_in_minutes', 120
    ),
    repeat('5', 64), '00000000-0000-4000-8000-00000000d401'
  );
  if v_result ->> 'first_code' <> 'E001'
     or v_result ->> 'last_code' <> 'E002' then
    raise exception 'gsc03_global_reservation_failed';
  end if;

  begin
    update public.sales_code_sequences
    set next_number = next_number + 1
    where id = '00000000-0000-4000-8000-00000000d701';
    raise exception 'gsc03_expected_legacy_allocator_block';
  exception when check_violation then
    if sqlerrm not like '%sales_code_legacy_sequence_read_only%' then raise; end if;
  end;
end;
$$;

do $$
begin
  if has_table_privilege('anon', 'public.sales_code_sequences', 'SELECT')
     or has_table_privilege('anon', 'public.sales_code_sequences', 'INSERT')
     or has_table_privilege('authenticated', 'public.sales_code_sequences', 'INSERT')
     or has_table_privilege('authenticated', 'public.sales_code_reservations', 'UPDATE') then
    raise exception 'gsc03_browser_allocator_write_surface_open';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.server_execute_sales_code_command(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'gsc03_browser_trusted_command_open';
  end if;
end;
$$;

rollback;

select 'PHASE_GSC_03_GLOBAL_SALES_CODE_COMPATIBILITY_OK' as result;
