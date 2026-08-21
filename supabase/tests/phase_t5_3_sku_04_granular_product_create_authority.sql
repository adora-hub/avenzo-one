\set ON_ERROR_STOP on

begin;

do $metadata$
declare
  v_preview_definition text;
  v_execute_definition text;
begin
  select pg_get_functiondef(
    'public.server_preview_variant_sku_sequence(uuid,text,uuid,smallint)'::regprocedure
  ) into v_preview_definition;
  select pg_get_functiondef(
    'public.server_execute_variant_sku_sequence_command(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)'::regprocedure
  ) into v_execute_definition;

  if position('product.create' in v_preview_definition) = 0
     or position('product.manage' in v_preview_definition) > 0
     or position('product.create' in v_execute_definition) = 0
     or position('product.update' in v_execute_definition) = 0
     or position('product.manage' in v_execute_definition) > 0 then
    raise exception 't5_3_sku_04_granular_authority_definition_failed';
  end if;

  if position('Authorize before replay lookup' in v_execute_definition) = 0 then
    raise exception 't5_3_sku_04_replay_authorization_order_failed';
  end if;

  if has_function_privilege(
       'anon',
       'public.server_preview_variant_sku_sequence(uuid,text,uuid,smallint)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.server_preview_variant_sku_sequence(uuid,text,uuid,smallint)',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'public.server_execute_variant_sku_sequence_command(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.server_execute_variant_sku_sequence_command(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.server_preview_variant_sku_sequence(uuid,text,uuid,smallint)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.server_execute_variant_sku_sequence_command(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)',
       'execute'
     ) then
    raise exception 't5_3_sku_04_service_boundary_failed';
  end if;
end
$metadata$;

do $fixtures$
declare
  v_org_a uuid := '00000000-0000-4000-8000-000000000910';
  v_org_b uuid := '00000000-0000-4000-8000-000000000911';
  v_owner_a uuid := '00000000-0000-4000-8000-000000000901';
  v_creator uuid := '00000000-0000-4000-8000-000000000902';
  v_allow_only uuid := '00000000-0000-4000-8000-000000000903';
  v_legacy_only uuid := '00000000-0000-4000-8000-000000000904';
  v_second_owner uuid := '00000000-0000-4000-8000-000000000905';
  v_owner_b uuid := '00000000-0000-4000-8000-000000000906';
  v_owner_role uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  )
  select id, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', email, '', now(), now(), now()
  from (values
    (v_owner_a, 't5-3-owner-a@example.invalid'),
    (v_creator, 't5-3-creator@example.invalid'),
    (v_allow_only, 't5-3-allow@example.invalid'),
    (v_legacy_only, 't5-3-legacy@example.invalid'),
    (v_second_owner, 't5-3-owner-a2@example.invalid'),
    (v_owner_b, 't5-3-owner-b@example.invalid')
  ) users(id, email);

  insert into public.organizations (id, name, slug, created_by) values
    (v_org_a, 'T5.3 SKU-04 Organization A', 't5-3-sku-04-a', v_owner_a),
    (v_org_b, 'T5.3 SKU-04 Organization B', 't5-3-sku-04-b', v_owner_b);

  insert into public.organization_members (
    id, organization_id, user_id, membership_status, scope
  ) values
    ('00000000-0000-4000-8000-000000000912', v_org_a, v_creator, 'active', 'branch'),
    ('00000000-0000-4000-8000-000000000913', v_org_a, v_allow_only, 'active', 'organization'),
    ('00000000-0000-4000-8000-000000000914', v_org_a, v_legacy_only, 'active', 'organization'),
    ('00000000-0000-4000-8000-000000000915', v_org_a, v_second_owner, 'active', 'organization');

  insert into public.organization_roles (
    id, organization_id, code, name, description, is_system, created_by
  ) values
    ('00000000-0000-4000-8000-000000000921', v_org_a, 'sku04_creator',
     'SKU-04 Creator', 'Exact product.create baseline', false, v_owner_a),
    ('00000000-0000-4000-8000-000000000922', v_org_a, 'sku04_legacy',
     'SKU-04 Legacy', 'Legacy product.manage only', false, v_owner_a);

  insert into public.role_permissions (role_id, permission_code) values
    ('00000000-0000-4000-8000-000000000921', 'product.create'),
    ('00000000-0000-4000-8000-000000000922', 'product.manage');

  insert into public.member_roles (membership_id, role_id, assigned_by) values
    ('00000000-0000-4000-8000-000000000912', '00000000-0000-4000-8000-000000000921', v_owner_a),
    ('00000000-0000-4000-8000-000000000914', '00000000-0000-4000-8000-000000000922', v_owner_a);

  select id into strict v_owner_role
  from public.organization_roles
  where organization_id = v_org_a and code = 'owner';
  insert into public.member_roles (membership_id, role_id, assigned_by)
  values ('00000000-0000-4000-8000-000000000915', v_owner_role, v_owner_a);

  insert into public.product_categories (
    id, organization_id, name, created_by, updated_by
  ) values (
    '00000000-0000-4000-8000-000000000931', v_org_a,
    'T5.3 SKU-04 Category', v_owner_a, v_owner_a
  );
end
$fixtures$;

set local role service_role;

do $authority$
declare
  v_org_a uuid := '00000000-0000-4000-8000-000000000910';
  v_owner_a uuid := '00000000-0000-4000-8000-000000000901';
  v_creator uuid := '00000000-0000-4000-8000-000000000902';
  v_allow_only uuid := '00000000-0000-4000-8000-000000000903';
  v_legacy_only uuid := '00000000-0000-4000-8000-000000000904';
  v_owner_b uuid := '00000000-0000-4000-8000-000000000906';
  v_payload jsonb := '{
    "name":"T5.3 SKU-04 Product",
    "category_id":"00000000-0000-4000-8000-000000000931",
    "structure_type":"variant",
    "base_unit_code":"piece",
    "quantity_behavior":"discrete",
    "currency_code":"THB",
    "sku_prefix":"GC",
    "sku_product_sequence":1,
    "sku_sequence_digits":3,
    "option_groups":[{"name":"แบบ","kind":"custom","values":[{"name":"หนึ่ง","code":"ONE"}]}],
    "variants":[{"key":"one","name":"T5.3 SKU-04 Product · หนึ่ง","sku_code":"GC-001-ONE","sales_code":"G301","status":"draft","sale_price":100,"option_codes":["ONE"]}]
  }'::jsonb;
  v_result jsonb;
  v_replay jsonb;
begin
  perform public.server_preview_variant_sku_sequence(v_org_a, 'GC', v_owner_a, 3::smallint);
  perform public.server_preview_variant_sku_sequence(v_org_a, 'GC', v_creator, 3::smallint);

  begin
    perform public.server_preview_variant_sku_sequence(v_org_a, 'GC', v_legacy_only, 3::smallint);
    raise exception 'expected_legacy_product_manage_denial';
  exception when insufficient_privilege then
    if sqlerrm <> 'permission_denied' then raise; end if;
  end;

  begin
    perform public.server_preview_variant_sku_sequence(v_org_a, 'GC', v_owner_b, 3::smallint);
    raise exception 'expected_cross_tenant_actor_denial';
  exception when insufficient_privilege then
    if sqlerrm <> 'permission_denied' then raise; end if;
  end;

  v_result := public.server_execute_variant_sku_sequence_command(
    '00000000-0000-4000-8000-000000000951', v_org_a,
    'product.create_with_variants', v_payload, repeat('3', 64), v_creator
  );
  v_replay := public.server_execute_variant_sku_sequence_command(
    '00000000-0000-4000-8000-000000000951', v_org_a,
    'product.create_with_variants', v_payload, repeat('3', 64), v_creator
  );
  if v_result is distinct from v_replay then
    raise exception 't5_3_sku_04_idempotent_replay_changed_result';
  end if;

  perform public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000961', v_owner_a, v_org_a,
    '00000000-0000-4000-8000-000000000912', 'product.create', null,
    'deny', null, null, 'SKU-04 Individual Deny must beat role baseline', 0
  );

  begin
    perform public.server_preview_variant_sku_sequence(v_org_a, 'GC', v_creator, 3::smallint);
    raise exception 'expected_individual_deny_preview_denial';
  exception when insufficient_privilege then
    if sqlerrm <> 'permission_denied' then raise; end if;
  end;
  begin
    perform public.server_execute_variant_sku_sequence_command(
      '00000000-0000-4000-8000-000000000951', v_org_a,
      'product.create_with_variants', v_payload, repeat('3', 64), v_creator
    );
    raise exception 'expected_individual_deny_replay_denial';
  exception when insufficient_privilege then
    if sqlerrm <> 'permission_denied' then raise; end if;
  end;

  perform public.server_set_member_permission_override(
    '00000000-0000-4000-8000-000000000962', v_owner_a, v_org_a,
    '00000000-0000-4000-8000-000000000913', 'product.create', null,
    'allow', null, null, 'Allow exact SKU-04 Product creation', 0
  );
  perform public.server_preview_variant_sku_sequence(v_org_a, 'GA', v_allow_only, 3::smallint);

  begin
    perform public.server_set_member_permission_override(
      '00000000-0000-4000-8000-000000000963', v_owner_a, v_org_a,
      '00000000-0000-4000-8000-000000000915', 'product.create', null,
      'deny', null, null, 'Owner target must remain protected', 0
    );
    raise exception 'expected_owner_target_override_denial';
  exception when insufficient_privilege then null;
  end;

end
$authority$;

reset role;

do $state_assertions$
begin
  if (select count(*) from public.products
      where organization_id = '00000000-0000-4000-8000-000000000910'
        and name = 'T5.3 SKU-04 Product') <> 1
     or (select count(*) from public.skus
         where organization_id = '00000000-0000-4000-8000-000000000910'
           and sku_code = 'GC-001-ONE') <> 1
     or (select last_sequence from public.sku_product_sequences
         where organization_id = '00000000-0000-4000-8000-000000000910'
           and prefix = 'GC') <> 1 then
    raise exception 't5_3_sku_04_duplicate_or_partial_state_detected';
  end if;
end
$state_assertions$;

rollback;
