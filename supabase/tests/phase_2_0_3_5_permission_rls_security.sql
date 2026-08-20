\set ON_ERROR_STOP on

begin;

do $fixtures$
declare
  v_owner_a uuid := '00000000-0000-4000-8000-000000000501';
  v_owner_b uuid := '00000000-0000-4000-8000-000000000502';
  v_staff_a uuid := '00000000-0000-4000-8000-000000000503';
  v_suspended_a uuid := '00000000-0000-4000-8000-000000000504';
  v_platform_admin uuid := '00000000-0000-4000-8000-000000000505';
  v_org_a uuid := '00000000-0000-4000-8000-000000000510';
  v_org_b uuid := '00000000-0000-4000-8000-000000000511';
  v_branch_a1 uuid := '00000000-0000-4000-8000-000000000520';
  v_branch_a2 uuid := '00000000-0000-4000-8000-000000000521';
  v_branch_b1 uuid := '00000000-0000-4000-8000-000000000522';
  v_product_a uuid := '00000000-0000-4000-8000-000000000530';
  v_product_b uuid := '00000000-0000-4000-8000-000000000531';
  v_sku_a uuid := '00000000-0000-4000-8000-000000000540';
  v_sku_b uuid := '00000000-0000-4000-8000-000000000541';
  v_warehouse_a1 uuid := '00000000-0000-4000-8000-000000000550';
  v_warehouse_a2 uuid := '00000000-0000-4000-8000-000000000551';
  v_warehouse_b1 uuid := '00000000-0000-4000-8000-000000000552';
  v_location_a1 uuid := '00000000-0000-4000-8000-000000000560';
  v_location_a2 uuid := '00000000-0000-4000-8000-000000000561';
  v_location_b1 uuid := '00000000-0000-4000-8000-000000000562';
  v_staff_membership uuid;
  v_suspended_membership uuid;
  v_staff_role uuid;
  v_admin_role uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  )
  select id, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', email, '', now(), now(), now()
  from (values
    (v_owner_a, 'phase-2-0-3-5-owner-a@example.invalid'),
    (v_owner_b, 'phase-2-0-3-5-owner-b@example.invalid'),
    (v_staff_a, 'phase-2-0-3-5-staff-a@example.invalid'),
    (v_suspended_a, 'phase-2-0-3-5-suspended-a@example.invalid'),
    (v_platform_admin, 'phase-2-0-3-5-platform@example.invalid')
  ) users(id, email);

  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_owner_a, 'role', 'authenticated', 'aal', 'aal2'
  )::text, true);

  insert into public.organizations (id, name, slug, created_by) values
    (v_org_a, 'Phase 2 Security Org A', 'phase-2-security-org-a', v_owner_a),
    (v_org_b, 'Phase 2 Security Org B', 'phase-2-security-org-b', v_owner_b);

  insert into public.branches (id, organization_id, code, name, created_by) values
    (v_branch_a1, v_org_a, 'A1', 'Org A Branch 1', v_owner_a),
    (v_branch_a2, v_org_a, 'A2', 'Org A Branch 2', v_owner_a),
    (v_branch_b1, v_org_b, 'B1', 'Org B Branch 1', v_owner_b);

  insert into public.organization_members (
    organization_id, user_id, membership_status, scope
  ) values (v_org_a, v_staff_a, 'active', 'branch')
  returning id into v_staff_membership;

  insert into public.organization_members (
    organization_id, user_id, membership_status, scope
  ) values (v_org_a, v_suspended_a, 'suspended', 'organization')
  returning id into v_suspended_membership;

  select id into strict v_staff_role from public.organization_roles
  where organization_id = v_org_a and code = 'staff';
  select id into strict v_admin_role from public.organization_roles
  where organization_id = v_org_a and code = 'admin';

  insert into public.member_roles (membership_id, role_id, assigned_by) values
    (v_staff_membership, v_staff_role, v_owner_a),
    (v_suspended_membership, v_admin_role, v_owner_a);
  insert into public.member_branches (membership_id, branch_id)
  values (v_staff_membership, v_branch_a1);

  insert into public.role_permissions (role_id, permission_code)
  values
    (v_staff_role, 'product.read'),
    (v_staff_role, 'warehouse.read'),
    (v_staff_role, 'inventory.read'),
    (v_staff_role, 'inventory.transfer')
  on conflict do nothing;

  insert into public.platform_admins (user_id, status, note, created_by)
  values (v_platform_admin, 'active', 'Phase 2.0.3.5 test', v_owner_a);

  insert into public.products (id, organization_id, name, created_by) values
    (v_product_a, v_org_a, 'Org A Product', v_owner_a),
    (v_product_b, v_org_b, 'Org B Product', v_owner_b);
  insert into public.skus (
    id, organization_id, product_id, sku_code, name, base_unit_code, status, created_by
  ) values
    (v_sku_a, v_org_a, v_product_a, 'SEC-A', 'Org A SKU', 'piece', 'active', v_owner_a),
    (v_sku_b, v_org_b, v_product_b, 'SEC-B', 'Org B SKU', 'piece', 'active', v_owner_b);
  update public.products set status = 'active' where id in (v_product_a, v_product_b);

  insert into public.warehouses (
    id, organization_id, branch_id, code, name, created_by
  ) values
    (v_warehouse_a1, v_org_a, v_branch_a1, 'A1-WH', 'A1 Warehouse', v_owner_a),
    (v_warehouse_a2, v_org_a, v_branch_a2, 'A2-WH', 'A2 Warehouse', v_owner_a),
    (v_warehouse_b1, v_org_b, v_branch_b1, 'B1-WH', 'B1 Warehouse', v_owner_b);

  insert into public.locations (
    id, organization_id, branch_id, warehouse_id, code, name, status, created_by
  ) values
    (v_location_a1, v_org_a, v_branch_a1, v_warehouse_a1, 'PICK', 'A1 Pick', 'active', v_owner_a),
    (v_location_a2, v_org_a, v_branch_a2, v_warehouse_a2, 'PICK', 'A2 Pick', 'active', v_owner_a),
    (v_location_b1, v_org_b, v_branch_b1, v_warehouse_b1, 'PICK', 'B1 Pick', 'active', v_owner_b);

  perform private.post_inventory_command(
    '00000000-0000-4000-8000-000000000570', v_org_a, 'receive', v_sku_a,
    null, v_location_a1, 10, 'opening_balance', null, repeat('a', 64), v_owner_a, now()
  );
  perform private.post_inventory_command(
    '00000000-0000-4000-8000-000000000571', v_org_a, 'receive', v_sku_a,
    null, v_location_a2, 20, 'opening_balance', null, repeat('b', 64), v_owner_a, now()
  );
  perform private.post_inventory_command(
    '00000000-0000-4000-8000-000000000572', v_org_b, 'receive', v_sku_b,
    null, v_location_b1, 30, 'opening_balance', null, repeat('c', 64), v_owner_b, now()
  );

  if (select count(*) from public.role_permissions rp
      join public.organization_roles r on r.id = rp.role_id
      where r.organization_id = v_org_a and r.code = 'owner'
        and rp.permission_code in (
          'product.read', 'product.manage', 'warehouse.read', 'warehouse.manage',
          'inventory.read', 'inventory.receive', 'inventory.adjust', 'inventory.transfer'
        )) <> 8 then
    raise exception 'owner_domain_permission_seed_failed';
  end if;
  if (select count(*) from public.role_permissions rp
      join public.organization_roles r on r.id = rp.role_id
      where r.organization_id = v_org_a and r.code = 'admin'
        and rp.permission_code in (
          'product.read', 'product.manage', 'warehouse.read', 'warehouse.manage',
          'inventory.read', 'inventory.receive', 'inventory.adjust', 'inventory.transfer'
        )) <> 8 then
    raise exception 'admin_domain_permission_seed_failed';
  end if;
end
$fixtures$;

-- Branch-scoped Staff sees only Org A / Branch A1 read models.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000503', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000503","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
do $staff_rls$
begin
  if (select count(*) from public.products) <> 1
     or (select count(*) from public.skus) <> 1 then
    raise exception 'staff_product_tenant_isolation_failed';
  end if;
  if (select count(*) from public.warehouses) <> 1
     or (select count(*) from public.locations where not is_default) <> 1 then
    raise exception 'staff_warehouse_branch_isolation_failed';
  end if;
  if (select count(*) from public.inventory_balances) <> 1
     or (select count(*) from public.stock_movements) <> 1
     or (select count(*) from public.inventory_commands) <> 1
     or (select count(*) from public.inventory_domain_events) <> 1 then
    raise exception 'staff_inventory_branch_isolation_failed';
  end if;

  begin
    insert into public.products (organization_id, name, created_by)
    values (
      '00000000-0000-4000-8000-000000000510',
      'Forbidden browser write',
      '00000000-0000-4000-8000-000000000503'
    );
    raise exception 'expected_direct_product_write_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.server_post_inventory_command(
      '00000000-0000-4000-8000-000000000580',
      '00000000-0000-4000-8000-000000000510',
      'receive',
      '00000000-0000-4000-8000-000000000540',
      null,
      '00000000-0000-4000-8000-000000000560',
      1, 'test', null, repeat('d', 64),
      '00000000-0000-4000-8000-000000000503', now()
    );
    raise exception 'expected_authenticated_server_rpc_denial';
  exception when insufficient_privilege then null;
  end;
end
$staff_rls$;
reset role;

-- inventory.read must not silently depend on warehouse.read. Remove the latter
-- and prove command visibility still follows inventory branch scope alone.
delete from public.role_permissions rp
using public.organization_roles r
where rp.role_id = r.id
  and r.organization_id = '00000000-0000-4000-8000-000000000510'
  and r.code = 'staff'
  and rp.permission_code = 'warehouse.read';
set local role authenticated;
do $inventory_read_independence$
begin
  if exists (select 1 from public.warehouses)
     or (select count(*) from public.inventory_commands) <> 1 then
    raise exception 'inventory_read_depends_on_warehouse_read';
  end if;
end
$inventory_read_independence$;
reset role;

-- Suspended members and Platform Admins are not tenant operators.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000504', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000504","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $suspended_rls$
begin
  if exists (select 1 from public.products)
     or exists (select 1 from public.inventory_balances) then
    raise exception 'suspended_member_access_not_denied';
  end if;
end
$suspended_rls$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000505', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000505","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
do $platform_aal1$
begin
  if exists (select 1 from public.products)
     or exists (select 1 from public.inventory_balances) then
    raise exception 'platform_admin_bypassed_tenant_rls';
  end if;
  begin
    perform public.platform_inventory_evidence('00000000-0000-4000-8000-000000000510');
    raise exception 'expected_platform_admin_aal2_requirement';
  exception when insufficient_privilege then null;
  end;
end
$platform_aal1$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000505","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $platform_aal2$
declare
  v_evidence jsonb;
begin
  v_evidence := public.platform_inventory_evidence('00000000-0000-4000-8000-000000000510');
  if (v_evidence ->> 'product_count')::integer <> 1
     or (v_evidence ->> 'movement_count')::integer <> 2
     or (v_evidence ->> 'on_hand_total')::numeric <> 30
     or (v_evidence ->> 'ledger_total')::numeric <> 30 then
    raise exception 'platform_inventory_evidence_invalid';
  end if;
end
$platform_aal2$;
reset role;

-- Only service_role may call the posting boundary. The actor still needs tenant
-- membership, permission, and scope on every affected branch.
set local role service_role;
do $server_boundary$
declare
  v_result jsonb;
begin
  v_result := public.server_post_inventory_command(
    '00000000-0000-4000-8000-000000000581',
    '00000000-0000-4000-8000-000000000510',
    'receive',
    '00000000-0000-4000-8000-000000000540',
    null,
    '00000000-0000-4000-8000-000000000560',
    5, 'supplier_receipt', null, repeat('e', 64),
    '00000000-0000-4000-8000-000000000501', now()
  );
  if jsonb_array_length(v_result -> 'movement_ids') <> 1 then
    raise exception 'authorized_server_receive_failed';
  end if;

  begin
    perform public.server_post_inventory_command(
      '00000000-0000-4000-8000-000000000582',
      '00000000-0000-4000-8000-000000000510',
      'transfer',
      '00000000-0000-4000-8000-000000000540',
      '00000000-0000-4000-8000-000000000560',
      '00000000-0000-4000-8000-000000000561',
      1, 'internal_transfer', null, repeat('f', 64),
      '00000000-0000-4000-8000-000000000503', now()
    );
    raise exception 'expected_both_branch_transfer_scope_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.server_post_inventory_command(
      '00000000-0000-4000-8000-000000000583',
      '00000000-0000-4000-8000-000000000510',
      'receive',
      '00000000-0000-4000-8000-000000000540',
      null,
      '00000000-0000-4000-8000-000000000560',
      1, 'test', null, repeat('0', 64),
      '00000000-0000-4000-8000-000000000505', now()
    );
    raise exception 'expected_platform_admin_inventory_write_denial';
  exception when insufficient_privilege then null;
  end;
end
$server_boundary$;
reset role;

do $catalog_and_grants$
begin
  if (select count(*) from public.permissions where code in (
    'product.read', 'product.manage', 'warehouse.read', 'warehouse.manage',
    'inventory.read', 'inventory.receive', 'inventory.adjust', 'inventory.transfer'
  )) <> 8 then
    raise exception 'domain_permission_catalog_incomplete';
  end if;
  if has_table_privilege('anon', 'public.products', 'select')
     or has_table_privilege('anon', 'public.inventory_balances', 'select')
     or has_table_privilege('authenticated', 'public.products', 'insert')
     or has_table_privilege('authenticated', 'public.inventory_balances', 'update') then
    raise exception 'domain_table_grants_are_too_broad';
  end if;
  if not has_table_privilege('authenticated', 'public.products', 'select')
     or not has_table_privilege('authenticated', 'public.inventory_balances', 'select') then
    raise exception 'reviewed_read_grants_missing';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.server_post_inventory_command(uuid,uuid,text,uuid,uuid,uuid,numeric,text,text,text,uuid,timestamptz)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.server_post_inventory_command(uuid,uuid,text,uuid,uuid,uuid,numeric,text,text,text,uuid,timestamptz)',
    'execute'
  ) then
    raise exception 'server_inventory_boundary_grant_invalid';
  end if;
  if has_function_privilege(
    'service_role',
    'private.post_inventory_command(uuid,uuid,text,uuid,uuid,uuid,numeric,text,text,text,uuid,timestamptz)',
    'execute'
  ) then
    raise exception 'private_inventory_primitive_exposed';
  end if;
  if (select count(*) from pg_policies
      where schemaname = 'public'
        and tablename in (
          'products', 'skus', 'warehouses', 'locations',
          'inventory_commands', 'stock_movements',
          'inventory_balances', 'inventory_domain_events'
        )
        and policyname like '%permission_select') <> 8 then
    raise exception 'reviewed_select_policy_count_invalid';
  end if;

  raise notice 'PHASE_2_0_3_5_PERMISSION_RLS_SECURITY_TESTS_PASSED';
end
$catalog_and_grants$;

rollback;
