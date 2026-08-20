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

  if exists (
    select 1
    from (values
      ('public.inventory_commands'),
      ('public.stock_movements'),
      ('public.inventory_balances'),
      ('public.inventory_domain_events')
    ) protected(relation_name)
    where has_table_privilege('anon', protected.relation_name, 'select')
       or has_table_privilege('anon', protected.relation_name, 'insert')
       or has_table_privilege('anon', protected.relation_name, 'update')
       or has_table_privilege('anon', protected.relation_name, 'delete')
       or not has_table_privilege('authenticated', protected.relation_name, 'select')
       or has_table_privilege('authenticated', protected.relation_name, 'insert')
       or has_table_privilege('authenticated', protected.relation_name, 'update')
       or has_table_privilege('authenticated', protected.relation_name, 'delete')
  ) then
    raise exception 'inventory_data_api_grant_invalid';
  end if;

  if has_function_privilege(
    'authenticated',
    'private.post_inventory_command(uuid,uuid,text,uuid,uuid,uuid,numeric,text,text,text,uuid,timestamptz)',
    'execute'
  ) or has_function_privilege(
    'service_role',
    'private.post_inventory_command(uuid,uuid,text,uuid,uuid,uuid,numeric,text,text,text,uuid,timestamptz)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.server_post_inventory_command(uuid,uuid,text,uuid,uuid,uuid,numeric,text,text,text,uuid,timestamptz)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.server_post_inventory_command(uuid,uuid,text,uuid,uuid,uuid,numeric,text,text,text,uuid,timestamptz)',
    'execute'
  ) then
    raise exception 'inventory_posting_boundary_grant_invalid';
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


-- T4.2C compatibility fixtures add both an out-of-scope Branch and another
-- Organization without changing the historical ledger assertions above.
do $rls_fixtures$
declare
  v_reader_membership uuid;
  v_no_permission_membership uuid;
  v_reader_role uuid;
  v_no_permission_role uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  )
  select id, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', email, '', now(), now(), now()
  from (values
    ('00000000-0000-4000-8000-000000000412'::uuid, 'phase-2-0-3-4-reader@example.invalid'),
    ('00000000-0000-4000-8000-000000000413'::uuid, 'phase-2-0-3-4-no-permission@example.invalid')
  ) users(id, email);

  insert into public.branches (id, organization_id, code, name, created_by)
  values (
    '00000000-0000-4000-8000-000000000414',
    '00000000-0000-4000-8000-000000000402',
    'SECOND', 'Second Branch',
    '00000000-0000-4000-8000-000000000401'
  );
  insert into public.warehouses (
    id, organization_id, branch_id, code, name, created_by
  ) values (
    '00000000-0000-4000-8000-000000000415',
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000414',
    'SECOND-WH', 'Second Warehouse',
    '00000000-0000-4000-8000-000000000401'
  );
  insert into public.locations (
    id, organization_id, branch_id, warehouse_id,
    code, name, status, created_by
  ) values (
    '00000000-0000-4000-8000-000000000416',
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000414',
    '00000000-0000-4000-8000-000000000415',
    'QA', 'QA Location', 'active',
    '00000000-0000-4000-8000-000000000401'
  );

  insert into public.organizations (id, name, slug, created_by)
  values (
    '00000000-0000-4000-8000-000000000419',
    'Phase 2 Inventory Other Org', 'phase-2-inventory-other-org',
    '00000000-0000-4000-8000-000000000401'
  );
  insert into public.branches (id, organization_id, code, name, created_by)
  values (
    '00000000-0000-4000-8000-000000000420',
    '00000000-0000-4000-8000-000000000419',
    'OTHER', 'Other Org Branch',
    '00000000-0000-4000-8000-000000000401'
  );
  insert into public.products (id, organization_id, name, status, created_by)
  values (
    '00000000-0000-4000-8000-000000000421',
    '00000000-0000-4000-8000-000000000419',
    'Other Inventory Product', 'active',
    '00000000-0000-4000-8000-000000000401'
  );
  insert into public.skus (
    id, organization_id, product_id, sku_code, name,
    base_unit_code, status, created_by
  ) values (
    '00000000-0000-4000-8000-000000000422',
    '00000000-0000-4000-8000-000000000419',
    '00000000-0000-4000-8000-000000000421',
    'INV-OTHER', 'Other Inventory SKU',
    'piece', 'active',
    '00000000-0000-4000-8000-000000000401'
  );
  insert into public.warehouses (
    id, organization_id, branch_id, code, name, created_by
  ) values (
    '00000000-0000-4000-8000-000000000423',
    '00000000-0000-4000-8000-000000000419',
    '00000000-0000-4000-8000-000000000420',
    'OTHER-WH', 'Other Org Warehouse',
    '00000000-0000-4000-8000-000000000401'
  );
  insert into public.locations (
    id, organization_id, branch_id, warehouse_id,
    code, name, status, created_by
  ) values (
    '00000000-0000-4000-8000-000000000424',
    '00000000-0000-4000-8000-000000000419',
    '00000000-0000-4000-8000-000000000420',
    '00000000-0000-4000-8000-000000000423',
    'QA', 'Other Org QA Location', 'active',
    '00000000-0000-4000-8000-000000000401'
  );

  insert into public.organization_members (
    organization_id, user_id, membership_status, scope
  ) values (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000412',
    'active', 'branch'
  ) returning id into v_reader_membership;
  insert into public.organization_members (
    organization_id, user_id, membership_status, scope
  ) values (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000413',
    'active', 'branch'
  ) returning id into v_no_permission_membership;

  select id into strict v_reader_role from public.organization_roles
  where organization_id = '00000000-0000-4000-8000-000000000402'
    and code = 'viewer';
  select id into strict v_no_permission_role from public.organization_roles
  where organization_id = '00000000-0000-4000-8000-000000000402'
    and code = 'staff';
  delete from public.role_permissions
  where role_id in (v_reader_role, v_no_permission_role)
    and permission_code in (
      'inventory.read', 'inventory_movement.read', 'inventory_audit.read'
    );
  insert into public.role_permissions (role_id, permission_code) values
    (v_reader_role, 'inventory_movement.read'),
    (v_reader_role, 'inventory_audit.read');
  insert into public.member_roles (membership_id, role_id, assigned_by) values
    (v_reader_membership, v_reader_role, '00000000-0000-4000-8000-000000000401'),
    (v_no_permission_membership, v_no_permission_role, '00000000-0000-4000-8000-000000000401');
  insert into public.member_branches (membership_id, branch_id) values
    (v_reader_membership, '00000000-0000-4000-8000-000000000403'),
    (v_no_permission_membership, '00000000-0000-4000-8000-000000000403');

  perform set_config(
    'test.inventory.source_location_id',
    (select id from public.locations
     where warehouse_id = '00000000-0000-4000-8000-000000000406'
       and is_default)::text,
    true
  );
end
$rls_fixtures$;

-- Stock increases are accepted only through the approved server boundary.
set local role service_role;
do $server_boundary$
declare
  v_result jsonb;
begin
  v_result := public.server_post_inventory_command(
    '00000000-0000-4000-8000-000000000417',
    '00000000-0000-4000-8000-000000000402',
    'receive', '00000000-0000-4000-8000-000000000405', null,
    current_setting('test.inventory.source_location_id')::uuid,
    1, 'qa_receive', null, repeat('f', 64),
    '00000000-0000-4000-8000-000000000401', now()
  );
  if jsonb_array_length(v_result -> 'movement_ids') <> 1 then
    raise exception 'approved_server_receive_failed';
  end if;
  perform public.server_post_inventory_command(
    '00000000-0000-4000-8000-000000000418',
    '00000000-0000-4000-8000-000000000402',
    'receive', '00000000-0000-4000-8000-000000000405', null,
    '00000000-0000-4000-8000-000000000416',
    7, 'qa_receive', null, repeat('1', 64),
    '00000000-0000-4000-8000-000000000401', now()
  );
  perform public.server_post_inventory_command(
    '00000000-0000-4000-8000-000000000425',
    '00000000-0000-4000-8000-000000000419',
    'receive', '00000000-0000-4000-8000-000000000422', null,
    '00000000-0000-4000-8000-000000000424',
    9, 'qa_receive', null, repeat('2', 64),
    '00000000-0000-4000-8000-000000000401', now()
  );
end
$server_boundary$;
reset role;

do $server_boundary_postflight$
begin
  if (select on_hand from public.inventory_balances
      where organization_id = '00000000-0000-4000-8000-000000000402'
        and sku_id = '00000000-0000-4000-8000-000000000405'
        and location_id = current_setting(
          'test.inventory.source_location_id'
        )::uuid) <> 6 then
    raise exception 'approved_server_receive_balance_invalid';
  end if;
end
$server_boundary_postflight$;

-- Authenticated reads require granular permission and Organization/Branch RLS.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000412', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000412","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
do $authorized_reader$
begin
  if (select count(*) from public.inventory_balances) <> 2
     or (select count(*) from public.stock_movements) <> 5
     or (select count(*) from public.inventory_commands) <> 4
     or (select count(*) from public.inventory_domain_events) <> 4
     or exists (
       select 1 from public.inventory_balances
       where organization_id <> '00000000-0000-4000-8000-000000000402'
          or branch_id <> '00000000-0000-4000-8000-000000000403'
     )
     or exists (
       select 1 from public.stock_movements
       where organization_id <> '00000000-0000-4000-8000-000000000402'
          or branch_id <> '00000000-0000-4000-8000-000000000403'
     ) then
    raise exception 'inventory_authenticated_permission_or_scope_failed';
  end if;
  begin
    insert into public.inventory_balances default values;
    raise exception 'expected_browser_balance_insert_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.inventory_balances set on_hand = on_hand;
    raise exception 'expected_browser_balance_update_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.inventory_balances;
    raise exception 'expected_browser_balance_delete_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.stock_movements default values;
    raise exception 'expected_browser_ledger_insert_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.stock_movements set reason_code = reason_code;
    raise exception 'expected_browser_ledger_update_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.stock_movements;
    raise exception 'expected_browser_ledger_delete_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.server_post_inventory_command(
      '00000000-0000-4000-8000-000000000426',
      '00000000-0000-4000-8000-000000000402',
      'receive', '00000000-0000-4000-8000-000000000405', null,
      '00000000-0000-4000-8000-000000000407',
      1, 'browser_receive', null, repeat('3', 64),
      '00000000-0000-4000-8000-000000000412', now()
    );
    raise exception 'expected_browser_server_boundary_denial';
  exception when insufficient_privilege then null;
  end;
end
$authorized_reader$;
reset role;

-- Branch membership without either granular read permission exposes no rows.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000413', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000413","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
do $no_permission_reader$
begin
  if exists (select 1 from public.inventory_balances)
     or exists (select 1 from public.stock_movements)
     or exists (select 1 from public.inventory_commands)
     or exists (select 1 from public.inventory_domain_events) then
    raise exception 'inventory_permission_required';
  end if;
end
$no_permission_reader$;
reset role;

-- Anonymous clients cannot read or mutate inventory surfaces.
set local role anon;
do $anon_denial$
begin
  begin
    perform count(*) from public.inventory_balances;
    raise exception 'expected_anon_balance_select_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.stock_movements;
    raise exception 'expected_anon_ledger_select_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.inventory_commands;
    raise exception 'expected_anon_command_select_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.inventory_domain_events;
    raise exception 'expected_anon_inventory_event_select_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.inventory_balances default values;
    raise exception 'expected_anon_balance_write_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.stock_movements default values;
    raise exception 'expected_anon_ledger_write_denial';
  exception when insufficient_privilege then null;
  end;
end
$anon_denial$;
reset role;

do $completion$
begin
  raise notice 'PHASE_2_0_3_4_T4_2C_INVENTORY_SECURITY_TESTS_PASSED';
end
$completion$;

rollback;
