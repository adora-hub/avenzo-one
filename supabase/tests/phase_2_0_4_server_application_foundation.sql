\set ON_ERROR_STOP on

begin;

do $fixtures$
declare
  v_owner uuid := '00000000-0000-4000-8000-000000000601';
  v_staff uuid := '00000000-0000-4000-8000-000000000602';
  v_org uuid := '00000000-0000-4000-8000-000000000610';
  v_branch_1 uuid := '00000000-0000-4000-8000-000000000620';
  v_branch_2 uuid := '00000000-0000-4000-8000-000000000621';
  v_membership uuid;
  v_staff_role uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) values
    (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated',
      'authenticated', 'phase-2-0-4-owner@example.invalid', '', now(), now(), now()),
    (v_staff, '00000000-0000-0000-0000-000000000000', 'authenticated',
      'authenticated', 'phase-2-0-4-staff@example.invalid', '', now(), now(), now());

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_owner, 'role', 'authenticated', 'aal', 'aal2'
  )::text, true);

  insert into public.organizations (id, name, slug, created_by)
  values (v_org, 'Phase 2 Application Org', 'phase-2-application-org', v_owner);
  insert into public.branches (id, organization_id, code, name, created_by) values
    (v_branch_1, v_org, 'APP-1', 'Application Branch 1', v_owner),
    (v_branch_2, v_org, 'APP-2', 'Application Branch 2', v_owner);

  insert into public.organization_members (
    organization_id, user_id, membership_status, scope
  ) values (v_org, v_staff, 'active', 'branch') returning id into v_membership;
  select id into strict v_staff_role from public.organization_roles
  where organization_id = v_org and code = 'staff';
  insert into public.member_roles (membership_id, role_id, assigned_by)
  values (v_membership, v_staff_role, v_owner);
  insert into public.member_branches (membership_id, branch_id)
  values (v_membership, v_branch_1);
  insert into public.role_permissions (role_id, permission_code)
  values (v_staff_role, 'warehouse.manage') on conflict do nothing;
end
$fixtures$;

set local role service_role;
do $commands$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000610';
  v_owner uuid := '00000000-0000-4000-8000-000000000601';
  v_staff uuid := '00000000-0000-4000-8000-000000000602';
  v_branch_1 uuid := '00000000-0000-4000-8000-000000000620';
  v_branch_2 uuid := '00000000-0000-4000-8000-000000000621';
  v_product jsonb;
  v_replay jsonb;
  v_warehouse jsonb;
begin
  v_product := public.server_execute_foundation_command(
    '00000000-0000-4000-8000-000000000630', v_org, 'product.create',
    '{"name":"Application Product","description":"Phase 2.0.4"}'::jsonb,
    repeat('a', 64), v_owner, now()
  );
  v_replay := public.server_execute_foundation_command(
    '00000000-0000-4000-8000-000000000630', v_org, 'product.create',
    '{"name":"Application Product","description":"Phase 2.0.4"}'::jsonb,
    repeat('a', 64), v_owner, now()
  );
  if v_replay is distinct from v_product then
    raise exception 'idempotent_replay_result_changed';
  end if;

  begin
    perform public.server_execute_foundation_command(
      '00000000-0000-4000-8000-000000000630', v_org, 'product.create',
      '{"name":"Different Product"}'::jsonb, repeat('b', 64), v_owner, now()
    );
    raise exception 'expected_command_payload_conflict';
  exception when unique_violation then null;
  end;

  perform public.server_execute_foundation_command(
    '00000000-0000-4000-8000-000000000631', v_org, 'sku.create',
    jsonb_build_object(
      'product_id', v_product ->> 'entity_id', 'sku_code', 'APP-SKU-1',
      'name', 'Application SKU', 'base_unit_code', 'piece',
      'status', 'active', 'barcode', '8850000000001', 'sales_code', 'CF-APP-1'
    ), repeat('c', 64), v_owner, now()
  );
  perform public.server_execute_foundation_command(
    '00000000-0000-4000-8000-000000000632', v_org, 'product.activate',
    jsonb_build_object('product_id', v_product ->> 'entity_id', 'expected_version', 1),
    repeat('d', 64), v_owner, now()
  );

  begin
    perform public.server_execute_foundation_command(
      '00000000-0000-4000-8000-000000000633', v_org, 'product.update',
      jsonb_build_object(
        'product_id', v_product ->> 'entity_id', 'expected_version', 1,
        'name', 'Stale update'
      ), repeat('e', 64), v_owner, now()
    );
    raise exception 'expected_version_conflict';
  exception when serialization_failure then null;
  end;

  v_warehouse := public.server_execute_foundation_command(
    '00000000-0000-4000-8000-000000000634', v_org, 'warehouse.create',
    jsonb_build_object('branch_id', v_branch_1, 'code', 'OWNER-WH', 'name', 'Owner Warehouse'),
    repeat('f', 64), v_owner, now()
  );
  perform public.server_execute_foundation_command(
    '00000000-0000-4000-8000-000000000635', v_org, 'location.create',
    jsonb_build_object(
      'warehouse_id', v_warehouse ->> 'entity_id', 'code', 'PICK', 'name', 'Pick Face'
    ), repeat('1', 64), v_owner, now()
  );
  perform public.server_execute_foundation_command(
    '00000000-0000-4000-8000-000000000636', v_org, 'warehouse.create',
    jsonb_build_object('branch_id', v_branch_1, 'code', 'STAFF-WH', 'name', 'Staff Warehouse'),
    repeat('2', 64), v_staff, now()
  );

  begin
    perform public.server_execute_foundation_command(
      '00000000-0000-4000-8000-000000000637', v_org, 'warehouse.create',
      jsonb_build_object('branch_id', v_branch_2, 'code', 'DENIED-WH', 'name', 'Denied Warehouse'),
      repeat('3', 64), v_staff, now()
    );
    raise exception 'expected_branch_scope_denial';
  exception when insufficient_privilege then null;
  end;
end
$commands$;
reset role;

do $evidence$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000610';
  v_product_id uuid;
begin
  select (result ->> 'entity_id')::uuid into strict v_product_id
  from public.foundation_commands
  where id = '00000000-0000-4000-8000-000000000630';

  if (select version from public.products where id = v_product_id) <> 2 then
    raise exception 'optimistic_version_increment_failed';
  end if;
  if (select count(*) from public.foundation_commands where organization_id = v_org) <> 6
     or (select count(*) from public.foundation_domain_events where organization_id = v_org) <> 6 then
    raise exception 'command_event_atomicity_failed';
  end if;
  if (select count(*) from private.organization_audit_logs
      where organization_id = v_org and source_type = 'foundation_command') <> 6 then
    raise exception 'foundation_audit_evidence_failed';
  end if;

  begin
    update public.foundation_domain_events set metadata = metadata || '{"tampered":true}'::jsonb
    where organization_id = v_org;
    raise exception 'expected_immutable_event_denial';
  exception when invalid_parameter_value then null;
  end;
end
$evidence$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000602', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000602","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;
do $browser_denials$
begin
  begin
    perform public.server_execute_foundation_command(
      '00000000-0000-4000-8000-000000000638',
      '00000000-0000-4000-8000-000000000610', 'warehouse.create',
      '{"branch_id":"00000000-0000-4000-8000-000000000620","code":"WEB","name":"Browser"}'::jsonb,
      repeat('4', 64), '00000000-0000-4000-8000-000000000602', now()
    );
    raise exception 'expected_authenticated_rpc_denial';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.foundation_commands (
      id, organization_id, command_type, payload, request_hash, actor_user_id
    ) values (
      '00000000-0000-4000-8000-000000000639',
      '00000000-0000-4000-8000-000000000610', 'product.create', '{}',
      repeat('5', 64), '00000000-0000-4000-8000-000000000602'
    );
    raise exception 'expected_authenticated_command_write_denial';
  exception when insufficient_privilege then null;
  end;
end
$browser_denials$;
reset role;

rollback;

select 'phase_2_0_4_server_application_foundation_ok' as result;
