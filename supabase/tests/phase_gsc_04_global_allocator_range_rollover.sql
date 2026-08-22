\set ON_ERROR_STOP on

begin;

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-00000000d411';
  v_actor uuid := '00000000-0000-4000-8000-00000000d401';
  v_product uuid := '00000000-0000-4000-8000-00000000d502';
  v_result jsonb;
  v_replay jsonb;
  v_hash text;
  v_batch_id uuid;
begin
  -- Existing historical A definition may coexist with the new Global V1 A
  -- sequence without being rewritten or selected for allocation.
  if not exists (
    select 1 from public.sales_code_sequences
    where organization_id = v_org and prefix = 'A' and standard_version = 'legacy'
  ) then
    raise exception 'gsc04_expected_legacy_a_fixture';
  end if;

  insert into public.skus (
    id, organization_id, product_id, sku_code, name, sales_code,
    base_unit_code, status, created_by, updated_by
  )
  select gen_random_uuid(), v_org, v_product,
    'GSC04-A-' || lpad(n::text, 3, '0'),
    'GSC04 occupied A ' || n,
    'A' || lpad(n::text, 3, '0'),
    'piece', 'draft', v_actor, v_actor
  from generate_series(1, 119) n;

  v_result := public.server_preview_global_sales_code_range(
    v_org, 'a', 50, v_actor
  );
  if v_result ->> 'first_code' <> 'A120'
     or v_result ->> 'last_code' <> 'A169'
     or (v_result ->> 'reserved')::boolean
     or not (v_result ->> 'authoritative')::boolean then
    raise exception 'gsc04_high_water_preview_failed: %', v_result;
  end if;

  v_hash := encode(extensions.digest(
    jsonb_build_object('prefix', 'A', 'quantity', 50, 'ttl_hours', 3)::text,
    'sha256'
  ), 'hex');
  v_result := public.server_reserve_global_sales_code_range(
    '00000000-0000-4000-8000-00000000e401', v_org,
    'A', 50, v_hash, v_actor
  );
  if v_result ->> 'first_code' <> 'A120'
     or v_result ->> 'last_code' <> 'A169'
     or v_result ->> 'state' <> 'reserved'
     or (v_result ->> 'quantity')::integer <> 50
     or (v_result ->> 'expires_at')::timestamptz < now() + interval '2 hours 59 minutes'
     or (v_result ->> 'expires_at')::timestamptz > now() + interval '3 hours 1 minute' then
    raise exception 'gsc04_range_reservation_failed: %', v_result;
  end if;

  v_replay := public.server_reserve_global_sales_code_range(
    '00000000-0000-4000-8000-00000000e401', v_org,
    'A', 50, v_hash, v_actor
  );
  if v_replay <> v_result
     or (select count(*) from public.sales_code_reservation_batches
         where organization_id = v_org and id = (v_result ->> 'batch_id')::uuid) <> 1
     or (select count(*) from public.sales_code_allocator_events
         where organization_id = v_org
           and command_id = '00000000-0000-4000-8000-00000000e401') <> 1 then
    raise exception 'gsc04_idempotent_replay_failed';
  end if;

  begin
    perform public.server_reserve_global_sales_code_range(
      '00000000-0000-4000-8000-00000000e401', v_org,
      'A', 1,
      encode(extensions.digest(
        jsonb_build_object('prefix', 'A', 'quantity', 1, 'ttl_hours', 3)::text,
        'sha256'
      ), 'hex'),
      v_actor
    );
    raise exception 'gsc04_expected_idempotency_conflict';
  exception when unique_violation then
    if sqlerrm not like '%command_payload_conflict%' then raise; end if;
  end;

  -- A second command receives a disjoint range under the same authority.
  v_hash := encode(extensions.digest(
    jsonb_build_object('prefix', 'A', 'quantity', 2, 'ttl_hours', 3)::text,
    'sha256'
  ), 'hex');
  v_result := public.server_reserve_global_sales_code_range(
    '00000000-0000-4000-8000-00000000e402', v_org,
    'A', 2, v_hash, v_actor
  );
  if v_result ->> 'first_code' <> 'A170'
     or v_result ->> 'last_code' <> 'A171' then
    raise exception 'gsc04_next_available_range_failed: %', v_result;
  end if;

  -- A never-assigned expired range returns to the available pool.
  v_hash := encode(extensions.digest(
    jsonb_build_object('prefix', 'R', 'quantity', 2, 'ttl_hours', 3)::text,
    'sha256'
  ), 'hex');
  v_result := public.server_reserve_global_sales_code_range(
    '00000000-0000-4000-8000-00000000e403', v_org,
    'R', 2, v_hash, v_actor
  );
  v_batch_id := (v_result ->> 'batch_id')::uuid;
  update public.sales_code_reservations
  set expires_at = now() - interval '1 minute'
  where organization_id = v_org and batch_id = v_batch_id;
  update public.sales_code_reservation_batches
  set expires_at = now() - interval '1 minute'
  where organization_id = v_org and id = v_batch_id;

  v_result := public.server_reserve_global_sales_code_range(
    '00000000-0000-4000-8000-00000000e404', v_org,
    'R', 2, v_hash, v_actor
  );
  if v_result ->> 'first_code' <> 'R001'
     or v_result ->> 'last_code' <> 'R002'
     or (v_result ->> 'expired_reservations')::integer <> 2 then
    raise exception 'gsc04_expired_pool_reuse_failed: %', v_result;
  end if;

  -- A batch never splits across Prefixes.
  insert into public.skus (
    id, organization_id, product_id, sku_code, name, sales_code,
    base_unit_code, status, created_by, updated_by
  ) values (
    gen_random_uuid(), v_org, v_product, 'GSC04-G-980',
    'GSC04 rollover high water', 'G980', 'piece', 'draft', v_actor, v_actor
  );
  v_result := public.server_preview_global_sales_code_range(v_org, 'G', 50, v_actor);
  if v_result ->> 'first_code' <> 'H001'
     or v_result ->> 'last_code' <> 'H050'
     or not (v_result ->> 'moved_to_next_prefix')::boolean then
    raise exception 'gsc04_whole_range_rollover_failed: %', v_result;
  end if;

  insert into public.skus (
    id, organization_id, product_id, sku_code, name, sales_code,
    base_unit_code, status, created_by, updated_by
  ) values (
    gen_random_uuid(), v_org, v_product, 'GSC04-Z-999',
    'GSC04 Z rollover', 'Z999', 'piece', 'draft', v_actor, v_actor
  );
  v_result := public.server_preview_global_sales_code_range(v_org, 'Z', 1, v_actor);
  if v_result ->> 'first_code' <> 'AA001' then
    raise exception 'gsc04_z_to_aa_rollover_failed: %', v_result;
  end if;

  insert into public.skus (
    id, organization_id, product_id, sku_code, name, sales_code,
    base_unit_code, status, created_by, updated_by
  ) values (
    gen_random_uuid(), v_org, v_product, 'GSC04-ZZZ-999',
    'GSC04 terminal code', 'ZZZ999', 'piece', 'draft', v_actor, v_actor
  );
  begin
    perform public.server_preview_global_sales_code_range(v_org, 'ZZZ', 1, v_actor);
    raise exception 'gsc04_expected_terminal_exhaustion';
  exception when numeric_value_out_of_range then
    if sqlerrm not like '%global_sales_code_prefix_exhausted%' then raise; end if;
  end;

  begin
    perform public.server_preview_global_sales_code_range(v_org, 'A', 51, v_actor);
    raise exception 'gsc04_expected_quantity_rejection';
  exception when invalid_parameter_value then
    if sqlerrm not like '%global_sales_code_range_input_invalid%' then raise; end if;
  end;

  if not exists (
    select 1 from public.sales_code_sequences
    where organization_id = v_org and prefix = 'A'
      and standard_version = 'global_v1'
  ) or (select count(*) from public.sales_code_sequences
        where organization_id = v_org and prefix = 'A') <> 2 then
    raise exception 'gsc04_legacy_global_sequence_coexistence_failed';
  end if;
end;
$$;

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-00000000d411';
  v_outsider uuid := '00000000-0000-4000-8000-00000000d409';
begin
  insert into auth.users (id, email, created_at, updated_at)
  values (v_outsider, 'gsc04-outsider@example.test', now(), now());

  begin
    perform public.server_preview_global_sales_code_range(v_org, 'A', 1, v_outsider);
    raise exception 'gsc04_expected_permission_denial';
  exception when insufficient_privilege then
    if sqlerrm not like '%permission_denied%' then raise; end if;
  end;

  if has_function_privilege(
       'anon',
       'public.server_preview_global_sales_code_range(uuid,text,integer,uuid)',
       'EXECUTE'
     ) or has_function_privilege(
       'authenticated',
       'public.server_reserve_global_sales_code_range(uuid,uuid,text,integer,text,uuid,timestamp with time zone)',
       'EXECUTE'
     ) then
    raise exception 'gsc04_browser_function_surface_open';
  end if;
end;
$$;

rollback;

select 'PHASE_GSC_04_GLOBAL_ALLOCATOR_RANGE_ROLLOVER_OK' as result;
