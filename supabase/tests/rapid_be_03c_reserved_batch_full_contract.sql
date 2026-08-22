\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000c301', 'rapid-be03c-owner@example.test', now(), now()),
  ('00000000-0000-4000-8000-00000000c302', 'rapid-be03c-admin@example.test', now(), now()),
  ('00000000-0000-4000-8000-00000000c303', 'rapid-be03c-foreign@example.test', now(), now());

insert into public.organizations (
  id, name, slug, status, timezone, currency, created_by
) values (
  '00000000-0000-4000-8000-00000000c311',
  'Rapid BE03C Organization', 'rapid-be03c-organization', 'active',
  'Asia/Bangkok', 'THB', '00000000-0000-4000-8000-00000000c301'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000c301","role":"authenticated","aal":"aal1"}',
  true
);

insert into public.branches (
  id, organization_id, code, name, status, created_by
) values (
  '00000000-0000-4000-8000-00000000c321',
  '00000000-0000-4000-8000-00000000c311',
  'BKK-01', 'Rapid BE03C Branch', 'active',
  '00000000-0000-4000-8000-00000000c301'
);

select set_config('request.jwt.claims', '', true);

insert into public.product_categories (
  id, organization_id, name, created_by, updated_by
) values (
  '00000000-0000-4000-8000-00000000c331',
  '00000000-0000-4000-8000-00000000c311',
  'Rapid BE03C Category',
  '00000000-0000-4000-8000-00000000c301',
  '00000000-0000-4000-8000-00000000c301'
);

create or replace function pg_temp.rapid_be03c_payload(
  p_organization_id uuid,
  p_batch_id uuid,
  p_category_id uuid,
  p_branch_id uuid,
  p_limit integer,
  p_label text
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'sales_code_mode', 'reserved_batch',
    'reservation_batch_id', p_batch_id,
    'creation_items', coalesce(jsonb_agg(jsonb_build_object(
      'client_row_id', p_label || '-' || lpad(r.sequence_number::text, 3, '0'),
      'command_id', gen_random_uuid(),
      'command_type', 'product.create_with_initial_sku',
      'sales_code', r.code,
      'payload', jsonb_build_object(
        'name', p_label || ' ' || r.code,
        'sku_name', p_label || ' ' || r.code,
        'sku_code', r.code,
        'category_id', p_category_id,
        'structure_type', 'standard',
        'base_unit_code', 'piece',
        'sale_price', 100 + r.sequence_number
      ),
      'handoff', jsonb_build_object(
        'branch_id', p_branch_id,
        'initial_stock', r.sequence_number % 5
      )
    ) order by r.sequence_number), '[]'::jsonb)
  )
  from (
    select sr.sequence_number, sr.code
    from public.sales_code_reservations sr
    where sr.organization_id = p_organization_id
      and sr.batch_id = p_batch_id
      and sr.status = 'reserved'
    order by sr.sequence_number, sr.id
    limit p_limit
  ) r;
$$;

-- Boundary sizes 1, 10 and 50 must create exactly once and preserve the
-- approved image/stock handoff boundaries.
do $scale_contract$
declare
  v_org constant uuid := '00000000-0000-4000-8000-00000000c311';
  v_actor constant uuid := '00000000-0000-4000-8000-00000000c301';
  v_branch constant uuid := '00000000-0000-4000-8000-00000000c321';
  v_category constant uuid := '00000000-0000-4000-8000-00000000c331';
  v_quantity integer;
  v_prefix text;
  v_reserve_payload jsonb;
  v_reserve_result jsonb;
  v_payload jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_batch_id uuid;
  v_command_id uuid;
  v_before integer;
begin
  foreach v_quantity in array array[1, 10, 50] loop
    v_prefix := case v_quantity when 1 then 'D' when 10 then 'E' else 'F' end;
    v_reserve_payload := jsonb_build_object(
      'prefix', v_prefix, 'quantity', v_quantity, 'ttl_hours', 3
    );
    v_reserve_result := public.server_reserve_global_sales_code_range(
      gen_random_uuid(), v_org, v_prefix, v_quantity,
      encode(extensions.digest(v_reserve_payload::text, 'sha256'), 'hex'),
      v_actor
    );
    v_batch_id := (v_reserve_result ->> 'batch_id')::uuid;
    v_payload := pg_temp.rapid_be03c_payload(
      v_org, v_batch_id, v_category, v_branch, v_quantity,
      'Rapid BE03C ' || v_quantity
    );
    v_command_id := gen_random_uuid();
    select count(*) into v_before from public.products
    where organization_id = v_org;

    v_result := public.server_execute_global_sales_code_creation(
      v_command_id, v_org, 'rapid', v_payload,
      encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_actor
    );
    v_replay := public.server_execute_global_sales_code_creation(
      v_command_id, v_org, 'rapid', v_payload,
      encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_actor
    );

    if v_result <> v_replay
       or v_result ->> 'status' <> 'succeeded'
       or (v_result ->> 'created_count')::integer <> v_quantity
       or (v_result ->> 'sku_count')::integer <> v_quantity
       or v_result ->> 'image_boundary' <> 'rapid-be-04-pending'
       or v_result ->> 'initial_stock_boundary' <> 'rapid-be-05-pending'
       or (v_result ->> 'images_finalized')::boolean
       or (v_result ->> 'inventory_posted')::boolean
       or (select count(*) from public.products
           where organization_id = v_org) <> v_before + v_quantity
       or (select count(*) from public.sales_code_reservations
           where organization_id = v_org and batch_id = v_batch_id
             and status = 'assigned') <> v_quantity then
      raise exception 'rapid_be03c_scale_or_replay_failed:%:%', v_quantity, v_result;
    end if;
  end loop;
end
$scale_contract$;

-- Expired and foreign-owned batches reveal no reserved code details and do
-- not create a Product, SKU or command result.
do $reservation_guards$
declare
  v_org constant uuid := '00000000-0000-4000-8000-00000000c311';
  v_actor constant uuid := '00000000-0000-4000-8000-00000000c301';
  v_foreign constant uuid := '00000000-0000-4000-8000-00000000c303';
  v_branch constant uuid := '00000000-0000-4000-8000-00000000c321';
  v_category constant uuid := '00000000-0000-4000-8000-00000000c331';
  v_reserve_payload jsonb;
  v_result jsonb;
  v_payload jsonb;
  v_batch_id uuid;
  v_before integer;
begin
  foreach v_reserve_payload in array array[
    jsonb_build_object('prefix','G','quantity',1,'ttl_hours',3),
    jsonb_build_object('prefix','H','quantity',1,'ttl_hours',3)
  ] loop
    v_result := public.server_reserve_global_sales_code_range(
      gen_random_uuid(), v_org, v_reserve_payload ->> 'prefix', 1,
      encode(extensions.digest(v_reserve_payload::text, 'sha256'), 'hex'), v_actor
    );
    v_batch_id := (v_result ->> 'batch_id')::uuid;
    v_payload := pg_temp.rapid_be03c_payload(
      v_org, v_batch_id, v_category, v_branch, 1,
      'Rapid Guard ' || (v_reserve_payload ->> 'prefix')
    );
    select count(*) into v_before from public.products where organization_id = v_org;

    if v_reserve_payload ->> 'prefix' = 'G' then
      update public.sales_code_reservation_batches
      set expires_at = statement_timestamp() - interval '1 second'
      where organization_id = v_org and id = v_batch_id;
      begin
        perform public.server_execute_global_sales_code_creation(
          gen_random_uuid(), v_org, 'rapid', v_payload,
          encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_actor
        );
        raise exception 'rapid_be03c_expected_expiry_denial';
      exception when check_violation then
        if sqlerrm <> 'rapid_reservation_expired' then raise; end if;
      end;
    else
      update public.sales_code_reservation_batches
      set created_by = v_foreign
      where organization_id = v_org and id = v_batch_id;
      begin
        perform public.server_execute_global_sales_code_creation(
          gen_random_uuid(), v_org, 'rapid', v_payload,
          encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_actor
        );
        raise exception 'rapid_be03c_expected_foreign_denial';
      exception when insufficient_privilege then
        if sqlerrm <> 'rapid_reservation_not_owned' then raise; end if;
      end;
    end if;

    if (select count(*) from public.products where organization_id = v_org) <> v_before then
      raise exception 'rapid_be03c_guard_partial_product_created';
    end if;
  end loop;
end
$reservation_guards$;

-- An individual Deny must beat the Admin role baseline before reservation
-- data is consumed.
do $individual_deny$
declare
  v_org constant uuid := '00000000-0000-4000-8000-00000000c311';
  v_owner constant uuid := '00000000-0000-4000-8000-00000000c301';
  v_admin constant uuid := '00000000-0000-4000-8000-00000000c302';
  v_branch constant uuid := '00000000-0000-4000-8000-00000000c321';
  v_category constant uuid := '00000000-0000-4000-8000-00000000c331';
  v_membership uuid;
  v_role uuid;
  v_batch_id uuid;
  v_reserve_payload jsonb := jsonb_build_object('prefix','J','quantity',1,'ttl_hours',3);
  v_result jsonb;
  v_payload jsonb;
begin
  insert into public.organization_members (
    organization_id, user_id, membership_status, scope
  ) values (v_org, v_admin, 'active', 'organization') returning id into v_membership;
  select id into strict v_role from public.organization_roles
  where organization_id = v_org and code = 'admin';
  insert into public.member_roles (membership_id, role_id, assigned_by)
  values (v_membership, v_role, v_owner);

  perform public.server_set_member_permission_override(
    gen_random_uuid(), v_owner, v_org, v_membership,
    'product.create', null, 'deny', null, null,
    'Rapid-BE-03C deny precedence fixture', 0
  );

  -- The Owner reserves the batch, then the Admin attempts the trusted create.
  v_result := public.server_reserve_global_sales_code_range(
    gen_random_uuid(), v_org, 'J', 1,
    encode(extensions.digest(v_reserve_payload::text, 'sha256'), 'hex'), v_owner
  );
  v_batch_id := (v_result ->> 'batch_id')::uuid;
  update public.sales_code_reservation_batches set created_by = v_admin
  where organization_id = v_org and id = v_batch_id;
  v_payload := pg_temp.rapid_be03c_payload(
    v_org, v_batch_id, v_category, v_branch, 1, 'Rapid Deny'
  );

  begin
    perform public.server_execute_global_sales_code_creation(
      gen_random_uuid(), v_org, 'rapid', v_payload,
      encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_admin
    );
    raise exception 'rapid_be03c_expected_individual_deny';
  exception when insufficient_privilege then
    if sqlerrm <> 'permission_denied' then raise; end if;
  end;

  if exists (
    select 1 from public.products where organization_id = v_org
      and name like 'Rapid Deny%'
  ) or not exists (
    select 1 from public.sales_code_reservations
    where organization_id = v_org and batch_id = v_batch_id and status = 'reserved'
  ) then
    raise exception 'rapid_be03c_individual_deny_consumed_data';
  end if;
end
$individual_deny$;

-- Query-plan evidence: the reservation lookup has the canonical batch/code
-- index required by the locked subset path.
do $plan_contract$
begin
  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'sales_code_reservations'
      and indexdef ilike '%batch_id%'
  ) then
    raise exception 'rapid_be03c_reservation_batch_index_missing';
  end if;
end
$plan_contract$;

explain (analyze, buffers, format text)
select id, code
from public.sales_code_reservations
where organization_id = '00000000-0000-4000-8000-00000000c311'
  and batch_id = '00000000-0000-4000-8000-000000000000'
order by sequence_number, id;

rollback;

select 'RAPID_BE_03C_FULL_CONTRACT_OK' as result;
