\set ON_ERROR_STOP on

begin;

do $test$
declare
  v_user_id uuid := '00000000-0000-4000-8000-000000000301';
  v_org_a uuid := '00000000-0000-4000-8000-000000000302';
  v_org_b uuid := '00000000-0000-4000-8000-000000000303';
  v_branch_a1 uuid := '00000000-0000-4000-8000-000000000304';
  v_branch_a2 uuid := '00000000-0000-4000-8000-000000000305';
  v_branch_b1 uuid := '00000000-0000-4000-8000-000000000306';
  v_warehouse_a1 uuid := '00000000-0000-4000-8000-000000000307';
  v_warehouse_a2 uuid := '00000000-0000-4000-8000-000000000308';
  v_warehouse_b1 uuid := '00000000-0000-4000-8000-000000000309';
  v_default_location uuid;
  v_second_location uuid := '00000000-0000-4000-8000-000000000310';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'phase-2-0-3-3@example.invalid',
    '',
    now(),
    now(),
    now()
  );

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.organizations (id, name, slug, created_by)
  values
    (v_org_a, 'Phase 2 Warehouse Org A', 'phase-2-warehouse-org-a', v_user_id),
    (v_org_b, 'Phase 2 Warehouse Org B', 'phase-2-warehouse-org-b', v_user_id);

  insert into public.branches (id, organization_id, code, name, created_by)
  values
    (v_branch_a1, v_org_a, 'A1', 'Org A Branch 1', v_user_id),
    (v_branch_a2, v_org_a, 'A2', 'Org A Branch 2', v_user_id),
    (v_branch_b1, v_org_b, 'B1', 'Org B Branch 1', v_user_id);

  insert into public.warehouses (
    id, organization_id, branch_id, code, name, created_by
  ) values (
    v_warehouse_a1, v_org_a, v_branch_a1, '  wh-a  ', '  Warehouse A  ', v_user_id
  );

  select id
  into strict v_default_location
  from public.locations
  where warehouse_id = v_warehouse_a1
    and code = 'DEFAULT'
    and name = 'Default'
    and is_default
    and status = 'active';

  if (select code <> 'WH-A' or name <> 'Warehouse A'
      from public.warehouses where id = v_warehouse_a1) then
    raise exception 'warehouse_canonicalization_failed';
  end if;

  if (select count(*) <> 1 from public.locations where warehouse_id = v_warehouse_a1) then
    raise exception 'warehouse_default_location_not_created_once';
  end if;

  begin
    insert into public.warehouses (
      organization_id, branch_id, code, name, created_by
    ) values (v_org_a, v_branch_a2, 'wh-a', 'Duplicate org code', v_user_id);
    raise exception 'expected_duplicate_warehouse_code';
  exception when unique_violation then
    null;
  end;

  insert into public.warehouses (
    id, organization_id, branch_id, code, name, created_by
  ) values
    (v_warehouse_a2, v_org_a, v_branch_a2, 'WH-B', 'Warehouse B', v_user_id),
    (v_warehouse_b1, v_org_b, v_branch_b1, 'WH-A', 'Same code other tenant', v_user_id);

  begin
    insert into public.warehouses (
      organization_id, branch_id, code, name, created_by
    ) values (v_org_b, v_branch_a1, 'CROSS-TENANT', 'Cross tenant', v_user_id);
    raise exception 'expected_cross_tenant_branch_fk';
  exception when foreign_key_violation then
    null;
  end;

  insert into public.locations (
    id, organization_id, branch_id, warehouse_id,
    code, name, is_default, status, created_by
  ) values (
    v_second_location, v_org_a, v_branch_a1, v_warehouse_a1,
    '  shelf-1  ', '  Shelf 1  ', false, 'active', v_user_id
  );

  if (select code <> 'SHELF-1' or name <> 'Shelf 1'
      from public.locations where id = v_second_location) then
    raise exception 'location_canonicalization_failed';
  end if;

  begin
    insert into public.locations (
      organization_id, branch_id, warehouse_id, code, name, created_by
    ) values (v_org_a, v_branch_a1, v_warehouse_a1, 'shelf-1', 'Duplicate', v_user_id);
    raise exception 'expected_duplicate_location_code';
  exception when unique_violation then
    null;
  end;

  begin
    insert into public.locations (
      organization_id, branch_id, warehouse_id,
      code, name, is_default, created_by
    ) values (
      v_org_a, v_branch_a1, v_warehouse_a1,
      'SECOND-DEFAULT', 'Second Default', true, v_user_id
    );
    raise exception 'expected_second_default_rejected';
  exception when unique_violation then
    null;
  end;

  begin
    insert into public.locations (
      organization_id, branch_id, warehouse_id, code, name, created_by
    ) values (
      v_org_a, v_branch_a2, v_warehouse_a1, 'CROSS-BRANCH', 'Cross Branch', v_user_id
    );
    raise exception 'expected_cross_branch_warehouse_fk';
  exception when foreign_key_violation then
    null;
  end;

  begin
    update public.locations
    set is_default = false
    where id = v_default_location;
    set constraints all immediate;
    raise exception 'expected_default_location_required';
  exception when check_violation then
    null;
  end;

  update public.locations set is_default = false where id = v_default_location;
  update public.locations set is_default = true where id = v_second_location;
  set constraints all immediate;
  set constraints all deferred;

  if (select count(*) <> 1
      from public.locations
      where warehouse_id = v_warehouse_a1 and is_default and status = 'active') then
    raise exception 'default_location_swap_failed';
  end if;

  begin
    update public.locations
    set status = 'inactive'
    where id = v_second_location;
    raise exception 'expected_default_location_must_be_active';
  exception when check_violation then
    null;
  end;

  update public.warehouses set status = 'inactive' where id = v_warehouse_a1;
  update public.warehouses set status = 'active' where id = v_warehouse_a1;

  begin
    update public.warehouses set branch_id = v_branch_a2 where id = v_warehouse_a1;
    raise exception 'expected_immutable_warehouse_branch';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    update public.locations set warehouse_id = v_warehouse_a2 where id = v_second_location;
    raise exception 'expected_immutable_location_warehouse';
  exception when sqlstate '22023' then
    null;
  end;

  update public.locations
  set is_default = false, status = 'archived'
  where id = v_second_location;
  update public.locations
  set is_default = true
  where id = v_default_location;
  set constraints all immediate;
  set constraints all deferred;

  begin
    update public.locations set name = 'Changed archived location'
    where id = v_second_location;
    raise exception 'expected_archived_location_immutable';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    delete from public.locations where id = v_second_location;
    raise exception 'expected_location_delete_denied';
  exception when sqlstate '22023' then
    null;
  end;

  update public.warehouses set status = 'archived' where id = v_warehouse_a1;

  begin
    update public.warehouses set name = 'Changed archived warehouse'
    where id = v_warehouse_a1;
    raise exception 'expected_archived_warehouse_immutable';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    delete from public.warehouses where id = v_warehouse_a1;
    raise exception 'expected_warehouse_delete_denied';
  exception when sqlstate '22023' then
    null;
  end;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('warehouses', 'locations')
      and c.relrowsecurity
    group by n.nspname
    having count(*) = 2
  ) then
    raise exception 'warehouse_location_rls_not_enabled';
  end if;

  if has_table_privilege('anon', 'public.warehouses', 'select')
     or has_table_privilege('authenticated', 'public.warehouses', 'select')
     or has_table_privilege('anon', 'public.locations', 'select')
     or has_table_privilege('authenticated', 'public.locations', 'select') then
    raise exception 'warehouse_location_data_api_grant_open';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.contype = 'f'
      and c.conrelid in ('public.warehouses'::regclass, 'public.locations'::regclass)
      and not exists (
        select 1
        from pg_catalog.pg_index i
        where i.indrelid = c.conrelid
          and i.indkey::smallint[] @> c.conkey
      )
  ) then
    raise exception 'warehouse_location_fk_index_missing';
  end if;

  raise notice 'PHASE_2_0_3_3_WAREHOUSE_LOCATION_TESTS_PASSED';
end
$test$;

rollback;
