\set ON_ERROR_STOP on

begin;

do $fixtures$
declare
  v_user uuid := '00000000-0000-4000-8000-000000000701';
  v_org uuid := '00000000-0000-4000-8000-000000000710';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) values (
    v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'phase-2-0-6-trigger@example.invalid', '', now(), now(), now()
  );
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_user, 'role', 'authenticated', 'aal', 'aal2'
  )::text, true);
  insert into public.organizations (id, name, slug, created_by)
  values (v_org, 'Phase 2.0.6 Trigger Org', 'phase-2-0-6-trigger-org', v_user);
  insert into public.branches (id, organization_id, code, name, created_by)
  values ('00000000-0000-4000-8000-000000000720', v_org, 'TRG', 'Trigger Branch', v_user);
end
$fixtures$;

set local role service_role;
select public.server_execute_foundation_command(
  '00000000-0000-4000-8000-000000000730',
  '00000000-0000-4000-8000-000000000710',
  'warehouse.create',
  '{"branch_id":"00000000-0000-4000-8000-000000000720","code":"TRIGGER","name":"Trigger Warehouse"}'::jsonb,
  repeat('6', 64),
  '00000000-0000-4000-8000-000000000701',
  now()
) \gset command_

select public.server_execute_foundation_command(
  '00000000-0000-4000-8000-000000000731',
  '00000000-0000-4000-8000-000000000710',
  'product.create',
  '{"name":"Phase 2.0.6 Product","description":"Audit test"}'::jsonb,
  repeat('7', 64),
  '00000000-0000-4000-8000-000000000701',
  now()
) \gset product_

select public.server_execute_foundation_command(
  '00000000-0000-4000-8000-000000000732',
  '00000000-0000-4000-8000-000000000710',
  'sku.create',
  jsonb_build_object(
    'product_id', :'product_server_execute_foundation_command'::jsonb ->> 'entity_id',
    'sku_code', 'P206-SKU', 'name', 'Phase 2.0.6 SKU',
    'base_unit_code', 'piece', 'status', 'active'
  ),
  repeat('8', 64),
  '00000000-0000-4000-8000-000000000701',
  now()
) \gset sku_

select public.server_execute_foundation_command(
  '00000000-0000-4000-8000-000000000735',
  '00000000-0000-4000-8000-000000000710',
  'product.activate',
  jsonb_build_object(
    'product_id', :'product_server_execute_foundation_command'::jsonb ->> 'entity_id',
    'expected_version',
      (:'product_server_execute_foundation_command'::jsonb ->> 'version')::bigint
  ),
  repeat('b', 64),
  '00000000-0000-4000-8000-000000000701',
  now()
);

select public.server_execute_foundation_command(
  '00000000-0000-4000-8000-000000000733',
  '00000000-0000-4000-8000-000000000710',
  'location.create',
  jsonb_build_object(
    'warehouse_id', :'command_server_execute_foundation_command'::jsonb ->> 'entity_id',
    'code', 'AUDIT', 'name', 'Inventory Audit Location'
  ),
  repeat('9', 64),
  '00000000-0000-4000-8000-000000000701',
  now()
) \gset location_

select public.server_post_inventory_command(
  '00000000-0000-4000-8000-000000000734',
  '00000000-0000-4000-8000-000000000710',
  'receive',
  (:'sku_server_execute_foundation_command'::jsonb ->> 'entity_id')::uuid,
  null,
  (:'location_server_execute_foundation_command'::jsonb ->> 'entity_id')::uuid,
  2.000000,
  'phase_test',
  'Audit integration test',
  repeat('a', 64),
  '00000000-0000-4000-8000-000000000701',
  now()
);

-- This is the key regression gate: fire the deferred trigger before RESET ROLE.
set constraints all immediate;

select branch_id
from public.server_resolve_foundation_branch_ids(
  '00000000-0000-4000-8000-000000000710',
  'warehouse',
  array[(:'command_server_execute_foundation_command'::jsonb ->> 'entity_id')::uuid]
);
reset role;

set local role authenticated;
do $authenticated_denied$
begin
  perform public.server_resolve_foundation_branch_ids(
    '00000000-0000-4000-8000-000000000710', 'warehouse',
    array['00000000-0000-4000-8000-000000000730'::uuid]
  );
  raise exception 'expected_authenticated_scope_resolver_denial';
exception when insufficient_privilege then null;
end
$authenticated_denied$;
reset role;

set local role service_role;
do $cross_tenant_denied$
begin
  perform public.server_resolve_foundation_branch_ids(
    '00000000-0000-4000-8000-000000000711', 'warehouse',
    array['00000000-0000-4000-8000-000000000799'::uuid]
  );
  raise exception 'expected_cross_tenant_scope_resolver_denial';
exception when no_data_found then null;
end
$cross_tenant_denied$;
reset role;

do $verify$
begin
  if (
    select count(*) <> 1
    from public.warehouses w
    join public.locations l on l.warehouse_id = w.id
    where w.organization_id = '00000000-0000-4000-8000-000000000710'
      and l.is_default and l.status = 'active'
  ) then
    raise exception 'service_role_warehouse_default_location_failed';
  end if;
  if (
    select count(*) <> 1 from private.organization_audit_logs
    where organization_id = '00000000-0000-4000-8000-000000000710'
      and category = 'inventory' and action = 'stock.received'
  ) then
    raise exception 'inventory_human_audit_missing';
  end if;
  if (
    select count(*) <> 1 from public.inventory_domain_events
    where organization_id = '00000000-0000-4000-8000-000000000710'
      and event_name = 'stock.received'
  ) then
    raise exception 'inventory_event_count_invalid';
  end if;
end
$verify$;

rollback;
select 'phase_2_0_6_warehouse_command_trigger_security_ok' as result;
