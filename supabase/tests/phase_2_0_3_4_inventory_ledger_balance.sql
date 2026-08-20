\set ON_ERROR_STOP on

begin;

do $test$
declare
  v_user_id uuid := '00000000-0000-4000-8000-000000000401';
  v_org_id uuid := '00000000-0000-4000-8000-000000000402';
  v_branch_id uuid := '00000000-0000-4000-8000-000000000403';
  v_product_id uuid := '00000000-0000-4000-8000-000000000404';
  v_sku_id uuid := '00000000-0000-4000-8000-000000000405';
  v_warehouse_id uuid := '00000000-0000-4000-8000-000000000406';
  v_source_location_id uuid;
  v_destination_location_id uuid := '00000000-0000-4000-8000-000000000407';
  v_receive_command uuid := '00000000-0000-4000-8000-000000000408';
  v_adjust_command uuid := '00000000-0000-4000-8000-000000000409';
  v_transfer_command uuid := '00000000-0000-4000-8000-000000000410';
  v_failed_command uuid := '00000000-0000-4000-8000-000000000411';
  v_result jsonb;
  v_replay_result jsonb;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'phase-2-0-3-4@example.invalid',
    '',
    now(),
    now(),
    now()
  );

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.organizations (id, name, slug, created_by)
  values (v_org_id, 'Phase 2 Inventory Org', 'phase-2-inventory-org', v_user_id);

  insert into public.branches (id, organization_id, code, name, created_by)
  values (v_branch_id, v_org_id, 'MAIN', 'Main Branch', v_user_id);

  insert into public.products (id, organization_id, name, created_by)
  values (v_product_id, v_org_id, 'Inventory Product', v_user_id);

  insert into public.skus (
    id, organization_id, product_id, sku_code, name,
    base_unit_code, status, created_by
  ) values (
    v_sku_id, v_org_id, v_product_id, 'INV-001', 'Inventory SKU',
    'piece', 'active', v_user_id
  );

  update public.products set status = 'active' where id = v_product_id;

  insert into public.warehouses (
    id, organization_id, branch_id, code, name, created_by
  ) values (
    v_warehouse_id, v_org_id, v_branch_id, 'MAIN-WH', 'Main Warehouse', v_user_id
  );

  select id into strict v_source_location_id
  from public.locations
  where warehouse_id = v_warehouse_id and is_default;

  insert into public.locations (
    id, organization_id, branch_id, warehouse_id,
    code, name, status, created_by
  ) values (
    v_destination_location_id, v_org_id, v_branch_id, v_warehouse_id,
    'SHELF-2', 'Shelf 2', 'active', v_user_id
  );

  v_result := private.post_inventory_command(
    v_receive_command, v_org_id, 'receive', v_sku_id,
    null, v_source_location_id, 10.000000,
    'manual_receipt', null, repeat('a', 64), v_user_id, now()
  );

  if jsonb_array_length(v_result -> 'movement_ids') <> 1 then
    raise exception 'receive_movement_result_invalid';
  end if;

  v_result := private.post_inventory_command(
    v_adjust_command, v_org_id, 'adjustment_out', v_sku_id,
    v_source_location_id, null, 3.000000,
    'stock_count', 'Count correction', repeat('b', 64), v_user_id, now()
  );

  v_result := private.post_inventory_command(
    v_transfer_command, v_org_id, 'transfer', v_sku_id,
    v_source_location_id, v_destination_location_id, 2.000000,
    'internal_transfer', null, repeat('c', 64), v_user_id, now()
  );

  if jsonb_array_length(v_result -> 'movement_ids') <> 2
     or v_result ->> 'correlation_id' is null then
    raise exception 'transfer_result_invalid';
  end if;

  if (select on_hand <> 5.000000 or allocated <> 0 or available <> 5.000000
      from public.inventory_balances
      where organization_id = v_org_id
        and sku_id = v_sku_id
        and location_id = v_source_location_id) then
    raise exception 'source_balance_invalid';
  end if;

  if (select on_hand <> 2.000000 or allocated <> 0 or available <> 2.000000
      from public.inventory_balances
      where organization_id = v_org_id
        and sku_id = v_sku_id
        and location_id = v_destination_location_id) then
    raise exception 'destination_balance_invalid';
  end if;

  if exists (
    select 1
    from public.inventory_balances b
    full join (
      select organization_id, sku_id, location_id, sum(quantity_delta) as ledger_total
      from public.stock_movements
      where organization_id = v_org_id and sku_id = v_sku_id
      group by organization_id, sku_id, location_id
    ) m using (organization_id, sku_id, location_id)
    where coalesce(b.on_hand, 0) <> coalesce(m.ledger_total, 0)
  ) then
    raise exception 'balance_ledger_reconciliation_failed';
  end if;

  if (select sum(quantity_delta) <> 0
      from public.stock_movements
      where organization_id = v_org_id and command_id = v_transfer_command) then
    raise exception 'transfer_not_quantity_neutral';
  end if;

  if (select count(*) <> 2
      from public.stock_movements
      where organization_id = v_org_id
        and command_id = v_transfer_command
        and correlation_id = (v_result ->> 'correlation_id')::uuid) then
    raise exception 'transfer_pair_invalid';
  end if;

  v_replay_result := private.post_inventory_command(
    v_transfer_command, v_org_id, 'transfer', v_sku_id,
    v_source_location_id, v_destination_location_id, 2.000000,
    'internal_transfer', null, repeat('c', 64), v_user_id, now()
  );

  if v_replay_result <> v_result
     or (select count(*) from public.stock_movements
         where organization_id = v_org_id and command_id = v_transfer_command) <> 2
     or (select count(*) from public.inventory_domain_events
         where organization_id = v_org_id and command_id = v_transfer_command) <> 1 then
    raise exception 'command_replay_not_idempotent';
  end if;

  begin
    perform private.post_inventory_command(
      v_transfer_command, v_org_id, 'transfer', v_sku_id,
      v_source_location_id, v_destination_location_id, 2.000000,
      'internal_transfer', null, repeat('d', 64), v_user_id, now()
    );
    raise exception 'expected_command_payload_conflict';
  exception when unique_violation then
    null;
  end;

  begin
    perform private.post_inventory_command(
      v_failed_command, v_org_id, 'adjustment_out', v_sku_id,
      v_source_location_id, null, 999.000000,
      'stock_count', 'Impossible count', repeat('e', 64), v_user_id, now()
    );
    raise exception 'expected_negative_stock_rejection';
  exception when check_violation then
    null;
  end;

  if exists (select 1 from public.inventory_commands where id = v_failed_command)
     or exists (select 1 from public.stock_movements where command_id = v_failed_command) then
    raise exception 'failed_command_left_partial_rows';
  end if;

  begin
    insert into public.inventory_balances (
      organization_id, branch_id, warehouse_id, location_id, sku_id
    ) values (
      v_org_id, v_branch_id, v_warehouse_id,
      '00000000-0000-4000-8000-000000000499', v_sku_id
    );
    raise exception 'expected_direct_balance_write_denial';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.stock_movements set reason_code = 'tampered'
    where command_id = v_receive_command;
    raise exception 'expected_movement_immutability';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    delete from public.inventory_domain_events where command_id = v_receive_command;
    raise exception 'expected_event_immutability';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    update public.skus set status = 'archived' where id = v_sku_id;
    raise exception 'expected_nonzero_sku_archive_denial';
  exception when check_violation then
    null;
  end;

  begin
    update public.locations set status = 'archived'
    where id = v_destination_location_id;
    raise exception 'expected_nonzero_location_archive_denial';
  exception when check_violation then
    null;
  end;

  if (select count(*) <> 3 from public.inventory_commands
      where organization_id = v_org_id and status = 'completed')
     or (select count(*) <> 4 from public.stock_movements
         where organization_id = v_org_id)
     or (select count(*) <> 3 from public.inventory_domain_events
         where organization_id = v_org_id) then
    raise exception 'inventory_row_counts_invalid';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'inventory_commands', 'stock_movements',
        'inventory_balances', 'inventory_domain_events'
      )
      and c.relrowsecurity
    group by n.nspname
    having count(*) = 4
  ) then
    raise exception 'inventory_rls_not_enabled';
  end if;

  if has_table_privilege('anon', 'public.inventory_balances', 'select')
     or has_table_privilege('authenticated', 'public.inventory_balances', 'select')
     or has_table_privilege('anon', 'public.stock_movements', 'select')
     or has_table_privilege('authenticated', 'public.stock_movements', 'select') then
    raise exception 'inventory_data_api_grant_open';
  end if;

  if has_function_privilege(
    'authenticated',
    'private.post_inventory_command(uuid,uuid,text,uuid,uuid,uuid,numeric,text,text,text,uuid,timestamptz)',
    'execute'
  ) or has_function_privilege(
    'service_role',
    'private.post_inventory_command(uuid,uuid,text,uuid,uuid,uuid,numeric,text,text,text,uuid,timestamptz)',
    'execute'
  ) then
    raise exception 'inventory_posting_primitive_exposed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.contype = 'f'
      and c.conrelid in (
        'public.inventory_commands'::regclass,
        'public.stock_movements'::regclass,
        'public.inventory_balances'::regclass,
        'public.inventory_domain_events'::regclass
      )
      and not exists (
        select 1
        from pg_catalog.pg_index i
        where i.indrelid = c.conrelid
          and i.indkey::smallint[] @> c.conkey
      )
  ) then
    raise exception 'inventory_fk_index_missing';
  end if;

  raise notice 'PHASE_2_0_3_4_INVENTORY_LEDGER_BALANCE_TESTS_PASSED';
end
$test$;

rollback;
