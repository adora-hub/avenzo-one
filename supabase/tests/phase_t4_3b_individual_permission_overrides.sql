\set ON_ERROR_STOP on

-- C10 runtime gate (not authorized in this drafting step) must execute this
-- file together with phase_t4_2c_permission_rls_contract.sql and the approved
-- Phase 2 Product/SKU/Warehouse/Inventory regression set before closure.

begin;

do $contract_metadata$
declare
  v_expected record;
  v_trigger record;
begin
  if (select count(*) from public.permissions where code in (
    'audit.read', 'billing.manage', 'billing.read',
    'branch.create', 'branch.read', 'branch.update',
    'inventory_audit.read', 'inventory_batch.read',
    'inventory_movement.read', 'inventory.adjust', 'inventory.read',
    'inventory.receive', 'inventory.transfer', 'location.read',
    'member.invite', 'member.read', 'member.update',
    'organization.read', 'organization.update',
    'product.cost.read', 'product.manage', 'product.read',
    'role.manage', 'role.read', 'sku.read',
    'warehouse.manage', 'warehouse.read',
    'product.create', 'product.update', 'product.archive',
    'permission_override.manage'
  )) <> 31 then
    raise exception 't4_3b_c1_permission_catalog_incomplete';
  end if;

  for v_expected in
    select * from (values
      ('audit.read', 'organization'),
      ('billing.manage', 'organization'),
      ('billing.read', 'organization'),
      ('branch.create', 'organization'),
      ('branch.read', 'branch'),
      ('branch.update', 'branch'),
      ('inventory_audit.read', 'branch'),
      ('inventory_batch.read', 'branch'),
      ('inventory_movement.read', 'branch'),
      ('inventory.adjust', 'branch'),
      ('inventory.read', 'branch'),
      ('inventory.receive', 'branch'),
      ('inventory.transfer', 'branch'),
      ('location.read', 'branch'),
      ('member.invite', 'organization'),
      ('member.read', 'organization'),
      ('member.update', 'organization'),
      ('organization.read', 'organization'),
      ('organization.update', 'organization'),
      ('product.cost.read', 'organization'),
      ('product.manage', 'organization'),
      ('product.read', 'organization'),
      ('role.manage', 'organization'),
      ('role.read', 'organization'),
      ('sku.read', 'organization'),
      ('warehouse.manage', 'branch'),
      ('warehouse.read', 'branch'),
      ('product.create', 'organization'),
      ('product.update', 'organization'),
      ('product.archive', 'organization'),
      ('permission_override.manage', 'organization')
    ) expected(code, scope_kind)
  loop
    if not exists (
      select 1 from public.permissions p
      where p.code = v_expected.code
        and p.scope_kind = v_expected.scope_kind
    ) then
      raise exception 't4_3b_c1_scope_kind_mismatch:%', v_expected.code;
    end if;
  end loop;

  if exists (select 1 from public.permissions where scope_kind is null) then
    raise exception 't4_3b_c1_unclassified_permission';
  end if;

  if exists (
    select 1 from public.organization_roles r
    join public.role_permissions rp on rp.role_id = r.id
    where r.code <> 'owner'
      and rp.permission_code in (
        'permission_override.manage', 'inventory_batch.read'
      )
  ) then
    raise exception 't4_3b_owner_only_catalog_contract_failed';
  end if;

  if exists (
    select 1 from public.role_permissions legacy
    where legacy.permission_code = 'product.manage'
      and exists (
        select required.code
        from (values
          ('product.create'), ('product.update'), ('product.archive')
        ) required(code)
        where not exists (
          select 1 from public.role_permissions granular
          where granular.role_id = legacy.role_id
            and granular.permission_code = required.code
        )
      )
  ) then
    raise exception 't4_3b_c2_product_backfill_incomplete';
  end if;

  if to_regclass('private.member_permission_overrides') is null
     or to_regclass('private.member_permission_override_events') is null
     or to_regprocedure(
       'private.effective_org_permission_for_actor(uuid,uuid,text,uuid)'
     ) is null
     or to_regprocedure(
       'public.server_set_member_permission_override(uuid,uuid,uuid,uuid,text,uuid,text,timestamp with time zone,timestamp with time zone,text,bigint)'
     ) is null then
    raise exception 't4_3b_override_contract_missing';
  end if;

  if not (
    select c.relrowsecurity and c.relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'private.member_permission_overrides'::regclass
  ) or not (
    select c.relrowsecurity and c.relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'private.member_permission_override_events'::regclass
  ) then
    raise exception 't4_3b_private_rls_contract_failed';
  end if;

  if has_table_privilege('anon', 'private.member_permission_overrides', 'select')
     or has_table_privilege('authenticated', 'private.member_permission_overrides', 'select')
     or has_table_privilege('service_role', 'private.member_permission_overrides', 'insert')
     or has_table_privilege('anon', 'private.member_permission_override_events', 'select')
     or has_table_privilege('authenticated', 'private.member_permission_override_events', 'select')
     or has_table_privilege('service_role', 'private.member_permission_override_events', 'insert') then
    raise exception 't4_3b_browser_or_service_direct_table_grant_open';
  end if;

  if has_function_privilege(
    'anon',
    'public.server_set_member_permission_override(uuid,uuid,uuid,uuid,text,uuid,text,timestamp with time zone,timestamp with time zone,text,bigint)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.server_set_member_permission_override(uuid,uuid,uuid,uuid,text,uuid,text,timestamp with time zone,timestamp with time zone,text,bigint)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.server_set_member_permission_override(uuid,uuid,uuid,uuid,text,uuid,text,timestamp with time zone,timestamp with time zone,text,bigint)',
    'execute'
  ) then
    raise exception 't4_3b_c8_server_boundary_grant_failed';
  end if;

  for v_trigger in
    select * from (values
      ('foundation_commands', 'enforce_granular_product_command_permission'),
      ('product_domain_commands', 'enforce_granular_product_domain_command_permission'),
      ('product_image_commands', 'enforce_granular_product_image_command_permission'),
      ('sales_code_allocator_commands', 'enforce_granular_sales_code_command_permission'),
      ('role_permissions', 'enforce_owner_only_permission_assignment')
    ) expected(table_name, trigger_name)
  loop
    if not exists (
      select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = format('public.%I', v_trigger.table_name)::regclass
        and t.tgname = v_trigger.trigger_name and not t.tgisinternal
    ) then
      raise exception 't4_3b_required_trigger_missing:%.%',
        v_trigger.table_name, v_trigger.trigger_name;
    end if;
  end loop;

  if private.required_product_command_permission('product.create') <> 'product.create'
     or private.required_product_command_permission('product.create_with_initial_sku') <> 'product.create'
     or private.required_product_command_permission('product.create_with_variants') <> 'product.create'
     or private.required_product_command_permission('product.update') <> 'product.update'
     or private.required_product_command_permission('sku.create') <> 'product.update'
     or private.required_product_command_permission('product.variant_images.assign') <> 'product.update'
     or private.required_product_command_permission('product.archive') <> 'product.archive'
     or private.required_product_command_permission('sku.archive') <> 'product.archive' then
    raise exception 't4_3b_c4_product_command_mapping_failed';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'storage' and p.tablename = 'objects'
      and p.policyname = 'product managers can upload prepared product images'
      and position('product.update' in coalesce(p.with_check, '')) > 0
      and position('product.manage' in coalesce(p.with_check, '')) = 0
  ) then
    raise exception 't4_3b_product_storage_policy_not_cut_over';
  end if;

  if position(
    'product.update' in pg_get_functiondef(
      'public.server_preview_sales_code_sequence(uuid,uuid,uuid,integer)'::regprocedure
    )
  ) = 0 then
    raise exception 't4_3b_sales_code_preview_not_cut_over';
  end if;
end
$contract_metadata$;

do $fixtures$
declare
  v_owner_a uuid := '00000000-0000-4000-8000-000000000801';
  v_admin_a uuid := '00000000-0000-4000-8000-000000000802';
  v_staff_a uuid := '00000000-0000-4000-8000-000000000803';
  v_owner_b uuid := '00000000-0000-4000-8000-000000000804';
  v_second_owner_a uuid := '00000000-0000-4000-8000-000000000805';
  v_org_a uuid := '00000000-0000-4000-8000-000000000810';
  v_org_b uuid := '00000000-0000-4000-8000-000000000811';
  v_branch_a1 uuid := '00000000-0000-4000-8000-000000000820';
  v_branch_a2 uuid := '00000000-0000-4000-8000-000000000821';
  v_branch_b1 uuid := '00000000-0000-4000-8000-000000000822';
  v_owner_membership uuid;
  v_admin_membership uuid;
  v_staff_membership uuid;
  v_owner_b_membership uuid;
  v_second_owner_membership uuid;
  v_admin_role uuid;
  v_staff_role uuid;
  v_owner_role uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  )
  select id, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', email, '', now(), now(), now()
  from (values
    (v_owner_a, 't4-3b-owner-a@example.invalid'),
    (v_admin_a, 't4-3b-admin-a@example.invalid'),
    (v_staff_a, 't4-3b-staff-a@example.invalid'),
    (v_owner_b, 't4-3b-owner-b@example.invalid'),
    (v_second_owner_a, 't4-3b-owner-a2@example.invalid')
  ) users(id, email);

  insert into public.organizations (id, name, slug, created_by) values
    (v_org_a, 'T4.3B Organization A', 't4-3b-organization-a', v_owner_a),
    (v_org_b, 'T4.3B Organization B', 't4-3b-organization-b', v_owner_b);

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner_a::text,
      'role', 'authenticated',
      'aal', 'aal1'
    )::text,
    true
  );

  insert into public.branches (id, organization_id, code, name, created_by) values
    (v_branch_a1, v_org_a, 'A1', 'Organization A Branch 1', v_owner_a),
    (v_branch_a2, v_org_a, 'A2', 'Organization A Branch 2', v_owner_a),
    (v_branch_b1, v_org_b, 'B1', 'Organization B Branch 1', v_owner_b);

  if (select count(*) from public.branches
      where (id, organization_id) in (
        (v_branch_a1, v_org_a),
        (v_branch_a2, v_org_a),
        (v_branch_b1, v_org_b)
      )) <> 3 then
    raise exception 't4_3b_branch_fixture_organization_assignment_failed';
  end if;

  perform set_config('request.jwt.claims', '', true);

  insert into public.organization_members (
    organization_id, user_id, membership_status, scope
  ) values (v_org_a, v_admin_a, 'active', 'organization')
  returning id into v_admin_membership;

  insert into public.organization_members (
    organization_id, user_id, membership_status, scope
  ) values (v_org_a, v_staff_a, 'active', 'branch')
  returning id into v_staff_membership;

  insert into public.organization_members (
    organization_id, user_id, membership_status, scope
  ) values (v_org_a, v_second_owner_a, 'active', 'organization')
  returning id into v_second_owner_membership;

  select id into strict v_admin_role from public.organization_roles
  where organization_id = v_org_a and code = 'admin';
  select id into strict v_staff_role from public.organization_roles
  where organization_id = v_org_a and code = 'staff';
  select id into strict v_owner_role from public.organization_roles
  where organization_id = v_org_a and code = 'owner';

  insert into public.member_roles (membership_id, role_id, assigned_by) values
    (v_admin_membership, v_admin_role, v_owner_a),
    (v_staff_membership, v_staff_role, v_owner_a),
    (v_second_owner_membership, v_owner_role, v_owner_a);
  insert into public.member_branches (membership_id, branch_id)
  values (v_staff_membership, v_branch_a1);

  delete from public.role_permissions
  where role_id = v_staff_role
    and permission_code in (
      'product.create', 'product.update', 'product.archive',
      'warehouse.read', 'permission_override.manage'
    );

  if (select count(*) from public.role_permissions rp
      where rp.role_id = v_admin_role
        and rp.permission_code in (
          'product.create', 'product.update', 'product.archive'
        )) <> 3 then
    raise exception 't4_3b_future_admin_granular_product_seed_failed';
  end if;
  if exists (
    select 1 from public.role_permissions rp
    where rp.role_id = v_admin_role
      and rp.permission_code in (
        'permission_override.manage', 'inventory_batch.read'
      )
  ) then
    raise exception 't4_3b_future_admin_received_protected_permission';
  end if;

  begin
    insert into public.role_permissions (role_id, permission_code)
    values (v_admin_role, 'permission_override.manage');
    raise exception 'expected_owner_only_catalog_assignment_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.role_permissions (role_id, permission_code)
    values (v_admin_role, 'inventory_batch.read');
    raise exception 'expected_admin_batch_catalog_assignment_denial';
  exception when insufficient_privilege then null;
  end;

  select id into strict v_owner_membership
  from public.organization_members
  where organization_id = v_org_a and user_id = v_owner_a;
  select id into strict v_owner_b_membership
  from public.organization_members
  where organization_id = v_org_b and user_id = v_owner_b;

  perform set_config(
    'test.t4_3b.owner_membership_id', v_owner_membership::text, true
  );
  perform set_config(
    'test.t4_3b.admin_membership_id', v_admin_membership::text, true
  );
  perform set_config(
    'test.t4_3b.staff_membership_id', v_staff_membership::text, true
  );
  perform set_config(
    'test.t4_3b.owner_b_membership_id', v_owner_b_membership::text, true
  );
  perform set_config(
    'test.t4_3b.second_owner_membership_id',
    v_second_owner_membership::text,
    true
  );
end
$fixtures$;

set local role service_role;
do $trusted_server_commands$
declare
  v_owner_a uuid := '00000000-0000-4000-8000-000000000801';
  v_admin_a uuid := '00000000-0000-4000-8000-000000000802';
  v_staff_a uuid := '00000000-0000-4000-8000-000000000803';
  v_org_a uuid := '00000000-0000-4000-8000-000000000810';
  v_org_b uuid := '00000000-0000-4000-8000-000000000811';
  v_branch_a1 uuid := '00000000-0000-4000-8000-000000000820';
  v_branch_a2 uuid := '00000000-0000-4000-8000-000000000821';
  v_owner_membership uuid :=
    current_setting('test.t4_3b.owner_membership_id')::uuid;
  v_admin_membership uuid :=
    current_setting('test.t4_3b.admin_membership_id')::uuid;
  v_staff_membership uuid :=
    current_setting('test.t4_3b.staff_membership_id')::uuid;
  v_owner_b_membership uuid :=
    current_setting('test.t4_3b.owner_b_membership_id')::uuid;
  v_second_owner_membership uuid :=
    current_setting('test.t4_3b.second_owner_membership_id')::uuid;
  v_result jsonb;
  v_replay jsonb;
begin
  if has_table_privilege(
    'service_role', 'public.organization_members', 'select'
  ) then
    raise exception 't4_3b_service_role_unexpected_organization_members_select';
  end if;

  v_result := public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000830', v_owner_a, v_org_a,
    v_staff_membership, 'product.create', null, 'allow', null, null,
    'Allow staff to create Products for launch', 0
  );
  v_replay := public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000830', v_owner_a, v_org_a,
    v_staff_membership, 'product.create', null, 'allow', null, null,
    'Allow staff to create Products for launch', 0
  );
  if v_replay is distinct from v_result then
    raise exception 't4_3b_idempotent_replay_changed_result';
  end if;

  begin
    perform public.server_set_member_permission_override(
      '00000000-0000-4000-8000-000000000830', v_owner_a, v_org_a,
      v_staff_membership, 'product.create', null, 'allow', null, null,
      'Different request using same command ID', 0
    );
    raise exception 'expected_permission_override_command_conflict';
  exception when unique_violation then null;
  end;

  perform public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000831', v_owner_a, v_org_a,
    v_admin_membership, 'product.create', null, 'deny', null, null,
    'Separate Product creation from Admin maintenance', 0
  );

  perform public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000832', v_owner_a, v_org_a,
    v_staff_membership, 'warehouse.read', null, 'allow', null, null,
    'Allow warehouse read only inside existing Branch membership', 0
  );

  perform public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000837', v_owner_a, v_org_a,
    v_staff_membership, 'location.read', null, 'allow', null, null,
    'Allow Location read within the existing Branch ceiling', 0
  );

  perform public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000838', v_owner_a, v_org_a,
    v_staff_membership, 'inventory.read', null, 'deny', null, null,
    'Organization-wide Inventory deny', 0
  );
  perform public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000839', v_owner_a, v_org_a,
    v_staff_membership, 'inventory.read', v_branch_a1, 'allow', null, null,
    'Branch Allow cannot override Organization Deny', 0
  );

  perform public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000833', v_owner_a, v_org_a,
    v_staff_membership, 'warehouse.read', v_branch_a1, 'deny', null, null,
    'Temporarily deny warehouse read in assigned Branch', 0
  );

  perform public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000834', v_owner_a, v_org_a,
    v_staff_membership, 'product.archive', null, 'allow',
    statement_timestamp() - interval '2 hours',
    statement_timestamp() - interval '1 hour',
    'Expired archive permission fixture', 0
  );

  begin
    perform public.server_set_member_permission_override(
      '00000000-0000-4000-8000-000000000840', v_owner_a, v_org_a,
      v_staff_membership, 'warehouse.read', v_branch_a2, 'allow', null, null,
      'Must not create Branch membership', 0
    );
    raise exception 'expected_branch_ceiling_denial';
  exception when no_data_found then null;
  end;

  begin
    perform public.server_set_member_permission_override(
      '00000000-0000-4000-8000-000000000841', v_owner_a, v_org_a,
      v_owner_membership, 'product.create', null, 'deny', null, null,
      'Self mutation must fail', 0
    );
    raise exception 'expected_c6_self_override_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.server_set_member_permission_override(
      '00000000-0000-4000-8000-000000000842', v_owner_a, v_org_a,
      v_second_owner_membership, 'product.create', null, 'deny', null, null,
      'Owner target must fail', 0
    );
    raise exception 'expected_c6_owner_target_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.server_set_member_permission_override(
      '00000000-0000-4000-8000-000000000843', v_admin_a, v_org_a,
      v_staff_membership, 'product.update', null, 'deny', null, null,
      'Admin must not manage overrides in v1', 0
    );
    raise exception 'expected_c6_non_owner_actor_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.server_set_member_permission_override(
      '00000000-0000-4000-8000-000000000844', v_owner_a, v_org_a,
      v_owner_b_membership, 'product.create', null, 'deny', null, null,
      'Cross tenant target must remain hidden', 0
    );
    raise exception 'expected_cross_tenant_target_denial';
  exception when no_data_found then null;
  end;

  begin
    perform public.server_set_member_permission_override(
      '00000000-0000-4000-8000-000000000846', v_owner_a, v_org_a,
      v_admin_membership, 'inventory_batch.read', null, 'allow', null, null,
      'Batch authority must remain inactive', 0
    );
    raise exception 'expected_no_batch_override_denial';
  exception when insufficient_privilege then null;
  end;

  -- Staff has no Product role grant; individual Allow must pass both the
  -- historical compatibility precheck and the exact Product-create guard.
  perform public.server_execute_foundation_command(
    '00000000-0000-4000-8000-000000000850', v_org_a, 'product.create',
    '{"name":"T4.3B Allowed Product"}'::jsonb,
    repeat('a', 64), v_staff_a, statement_timestamp()
  );

  -- Admin still has update/archive but the individual create Deny wins.
  begin
    perform public.server_execute_foundation_command(
      '00000000-0000-4000-8000-000000000851', v_org_a, 'product.create',
      '{"name":"T4.3B Denied Product"}'::jsonb,
      repeat('b', 64), v_admin_a, statement_timestamp()
    );
    raise exception 'expected_granular_product_create_denial';
  exception when insufficient_privilege then null;
  end;

  perform public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000835', v_owner_a, v_org_a,
    v_staff_membership, 'product.create', null, 'deny', null, null,
    'Change staff Product create decision', 1
  );
  perform public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000836', v_owner_a, v_org_a,
    v_staff_membership, 'product.create', null, 'revoke', null, null,
    'Return staff Product create to role baseline', 2
  );

  begin
    perform public.server_set_member_permission_override(
      '00000000-0000-4000-8000-000000000845', v_owner_a, v_org_a,
      v_staff_membership, 'product.create', null, 'allow', null, null,
      'Stale revision must fail', 1
    );
    raise exception 'expected_permission_override_revision_conflict';
  exception when serialization_failure then null;
  end;
end
$trusted_server_commands$;
reset role;

do $effective_permission_assertions$
declare
  v_owner_a uuid := '00000000-0000-4000-8000-000000000801';
  v_admin_a uuid := '00000000-0000-4000-8000-000000000802';
  v_staff_a uuid := '00000000-0000-4000-8000-000000000803';
  v_org_a uuid := '00000000-0000-4000-8000-000000000810';
  v_branch_a1 uuid := '00000000-0000-4000-8000-000000000820';
  v_branch_a2 uuid := '00000000-0000-4000-8000-000000000821';
begin
  if private.effective_org_permission_for_actor(
       v_owner_a, v_org_a, 'product.manage', null
     ) then
    raise exception 't4_3b_c3_product_manage_remains_effective_alias';
  end if;
  if private.effective_org_permission_for_actor(
       v_admin_a, v_org_a, 'product.create', null
     ) then
    raise exception 't4_3b_c5_deny_did_not_override_admin_role';
  end if;
  if not private.effective_org_permission_for_actor(
       v_admin_a, v_org_a, 'product.update', null
     ) or not private.effective_org_permission_for_actor(
       v_admin_a, v_org_a, 'product.archive', null
     ) then
    raise exception 't4_3b_c5_product_deny_changed_unrelated_authority';
  end if;
  if private.effective_org_permission_for_actor(
       v_staff_a, v_org_a, 'warehouse.read', v_branch_a1
     ) then
    raise exception 't4_3b_deny_did_not_win_over_org_allow';
  end if;
  if private.effective_org_permission_for_actor(
       v_staff_a, v_org_a, 'warehouse.read', v_branch_a2
     ) then
    raise exception 't4_3b_c7_branch_allow_bypassed_membership_ceiling';
  end if;
  if not private.effective_org_permission_for_actor(
       v_staff_a, v_org_a, 'location.read', v_branch_a1
     ) or private.effective_org_permission_for_actor(
       v_staff_a, v_org_a, 'location.read', v_branch_a2
     ) then
    raise exception 't4_3b_c7_branch_allow_ceiling_result_incorrect';
  end if;
  if private.effective_org_permission_for_actor(
       v_staff_a, v_org_a, 'inventory.read', v_branch_a1
     ) then
    raise exception 't4_3b_organization_deny_lost_to_branch_allow';
  end if;
  if private.effective_org_permission_for_actor(
       v_staff_a, v_org_a, 'product.archive', null
     ) then
    raise exception 't4_3b_c9_expired_override_remains_effective';
  end if;
  if private.effective_org_permission_for_actor(
       v_staff_a, v_org_a, 'product.create', null
     ) then
    raise exception 't4_3b_revoked_override_did_not_restore_baseline';
  end if;

  if (select count(*) from public.member_branches mb
      join public.organization_members om on om.id = mb.membership_id
      where om.organization_id = v_org_a and om.user_id = v_staff_a) <> 1 then
    raise exception 't4_3b_c7_override_mutated_branch_membership';
  end if;
end
$effective_permission_assertions$;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000802', true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000802","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;
do $effective_summary_and_browser_denial$
declare
  v_permissions text[];
begin
  v_permissions := public.current_user_org_permissions(
    '00000000-0000-4000-8000-000000000810'
  );
  if 'product.create' = any(v_permissions)
     or 'product.manage' = any(v_permissions)
     or not ('product.update' = any(v_permissions))
     or not ('product.archive' = any(v_permissions)) then
    raise exception 't4_3b_effective_permission_summary_incorrect';
  end if;

  begin
    perform count(*) from private.member_permission_overrides;
    raise exception 'expected_authenticated_override_select_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.server_set_member_permission_override(
      '00000000-0000-4000-8000-000000000860',
      '00000000-0000-4000-8000-000000000802',
      '00000000-0000-4000-8000-000000000810',
      '00000000-0000-4000-8000-000000000000',
      'product.create', null, 'allow', null, null,
      'Browser must not execute trusted command', 0
    );
    raise exception 'expected_authenticated_override_rpc_denial';
  exception when insufficient_privilege then null;
  end;
end
$effective_summary_and_browser_denial$;
reset role;

set local role anon;
do $anon_denial$
begin
  begin
    perform count(*) from private.member_permission_override_events;
    raise exception 'expected_anon_override_event_select_denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.server_set_member_permission_override(
      '00000000-0000-4000-8000-000000000861',
      '00000000-0000-4000-8000-000000000801',
      '00000000-0000-4000-8000-000000000810',
      '00000000-0000-4000-8000-000000000000',
      'product.create', null, 'allow', null, null,
      'Anonymous must not execute trusted command', 0
    );
    raise exception 'expected_anon_override_rpc_denial';
  exception when insufficient_privilege then null;
  end;
end
$anon_denial$;
reset role;

do $audit_idempotency_and_no_batch$
declare
  v_org_a uuid := '00000000-0000-4000-8000-000000000810';
begin
  if (select count(*) from private.member_permission_override_events
      where organization_id = v_org_a) <> 10 then
    raise exception 't4_3b_c9_override_event_count_or_idempotency_failed';
  end if;
  if (select count(*) from private.member_permission_override_events
      where command_id = '00000000-0000-4000-8000-000000000830') <> 1 then
    raise exception 't4_3b_idempotent_replay_duplicated_event';
  end if;
  if exists (
    select 1 from private.member_permission_override_events e
    where e.organization_id = v_org_a
      and (
        e.reason is null or e.actor_user_id is null
        or e.before_data is null and e.event_type <> 'created'
        or e.after_data is null
        or e.retention_until < e.occurred_at + interval '5 years'
        or e.legal_hold
      )
  ) then
    raise exception 't4_3b_c9_audit_content_or_retention_failed';
  end if;
  if (select count(*) from private.organization_audit_logs
      where organization_id = v_org_a
        and source_type = 'member_permission_override_event') <> 10 then
    raise exception 't4_3b_c9_organization_audit_projection_failed';
  end if;

  begin
    update private.member_permission_override_events
    set after_data = after_data || '{"tampered":true}'::jsonb
    where organization_id = v_org_a;
    raise exception 'expected_immutable_override_event_denial';
  exception when insufficient_privilege then null;
  end;

  if (select array_agg(c.relname::text order by c.relname)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and c.relname ilike '%batch%'
        and c.relname ~* '(inventory|stock|receive|receipt|movement)')
     is distinct from array[
       'inventory_receive_batch_items',
       'inventory_receive_batches'
     ]::text[] then
    raise exception 't4_3b_c10_batch_table_surface_failed';
  end if;

  if (select array_agg(c.column_name::text order by c.ordinal_position)
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'inventory_receive_batches') is distinct from array[
          'id', 'organization_id', 'branch_id', 'batch_type',
          'idempotency_key', 'request_hash_version', 'request_hash',
          'reference', 'reason_code', 'reason_note', 'item_count',
          'actor_user_id', 'status', 'result', 'occurred_at',
          'created_at', 'completed_at'
        ]::text[]
     or (select array_agg(c.column_name::text order by c.ordinal_position)
         from information_schema.columns c
         where c.table_schema = 'public'
           and c.table_name = 'inventory_receive_batch_items') is distinct from array[
             'id', 'organization_id', 'branch_id', 'batch_id', 'line_no',
             'sku_id', 'warehouse_id', 'location_id', 'quantity',
             'base_unit_code', 'inventory_command_id', 'created_at'
           ]::text[] then
    raise exception 't4_3b_c10_batch_table_structure_failed';
  end if;

  if (select array_agg(
        p.schemaname || '.' || p.tablename || '.' || p.policyname
        order by p.schemaname, p.tablename, p.policyname
      )
      from pg_catalog.pg_policies p
      where position('inventory_batch.read' in coalesce(p.qual, '')) > 0
         or position('inventory_batch.read' in coalesce(p.with_check, '')) > 0)
     is distinct from array[
       'public.inventory_receive_batch_items.inventory_receive_batch_items_permission_select',
       'public.inventory_receive_batches.inventory_receive_batches_permission_select'
     ]::text[]
     or (select array_agg(p.policyname::text order by p.policyname)
         from pg_catalog.pg_policies p
         where p.schemaname = 'public'
           and p.tablename in (
             'inventory_receive_batches', 'inventory_receive_batch_items'
           )) is distinct from array[
             'inventory_receive_batch_items_permission_select',
             'inventory_receive_batches_permission_select'
           ]::text[] then
    raise exception 't4_3b_c10_batch_policy_surface_failed';
  end if;

  if (select array_agg(c.relname || '.' || t.tgname order by c.relname, t.tgname)
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'inventory_receive_batches', 'inventory_receive_batch_items'
        )
        and not t.tgisinternal) is distinct from array[
          'inventory_receive_batch_items.guard_inventory_receive_batch_item_insert',
          'inventory_receive_batch_items.prevent_inventory_receive_batch_item_update_delete',
          'inventory_receive_batches.guard_inventory_receive_batch_update',
          'inventory_receive_batches.prevent_inventory_receive_batch_delete'
        ]::text[] then
    raise exception 't4_3b_c10_batch_trigger_surface_failed';
  end if;

  if (select count(*)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where (n.nspname, p.proname) in (
        ('private', 'require_inventory_receive_batch_context'),
        ('private', 'guard_inventory_receive_batch_update'),
        ('private', 'guard_inventory_receive_batch_item_insert'),
        ('public', 'server_receive_inventory_batch')
      )) <> 4
     or exists (
       select 1
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private')
         and p.proname ilike '%inventory%receive%batch%'
         and (n.nspname, p.proname) not in (
           ('private', 'require_inventory_receive_batch_context'),
           ('private', 'guard_inventory_receive_batch_update'),
           ('private', 'guard_inventory_receive_batch_item_insert'),
           ('public', 'server_receive_inventory_batch')
         )
     )
     or to_regprocedure(
       'public.server_receive_inventory_batch(jsonb,uuid)'
     ) is null
     or (select count(*)
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname like 'server%receive%batch%') <> 1 then
    raise exception 't4_3b_c10_batch_function_surface_failed';
  end if;

  raise notice 'PHASE_T4_3B_INDIVIDUAL_PERMISSION_OVERRIDE_TESTS_PASSED';
end
$audit_idempotency_and_no_batch$;

rollback;
