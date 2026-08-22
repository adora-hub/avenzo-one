\set ON_ERROR_STOP on

begin;

do $test$
declare
  v_user_id uuid := '00000000-0000-4000-8000-000000000201';
  v_org_a uuid := '00000000-0000-4000-8000-000000000202';
  v_org_b uuid := '00000000-0000-4000-8000-000000000203';
  v_product_a uuid := '00000000-0000-4000-8000-000000000204';
  v_product_b uuid := '00000000-0000-4000-8000-000000000205';
  v_product_empty uuid := '00000000-0000-4000-8000-000000000206';
  v_sku_a uuid := '00000000-0000-4000-8000-000000000207';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'phase-2-0-3-2@example.invalid',
    '',
    now(),
    now(),
    now()
  );

  insert into public.organizations (id, name, slug, created_by)
  values
    (v_org_a, 'Phase 2 Org A', 'phase-2-org-a', v_user_id),
    (v_org_b, 'Phase 2 Org B', 'phase-2-org-b', v_user_id);

  insert into public.products (id, organization_id, name, description, created_by)
  values
    (v_product_a, v_org_a, '  Product A  ', '  Foundation product  ', v_user_id),
    (v_product_b, v_org_b, 'Product B', null, v_user_id),
    (v_product_empty, v_org_a, 'Product without SKU', null, v_user_id);

  if (select name <> 'Product A' or description <> 'Foundation product'
      from public.products where id = v_product_a) then
    raise exception 'product_canonicalization_failed';
  end if;

  insert into public.skus (
    id, organization_id, product_id, sku_code, name, barcode,
    sales_code, base_unit_code, status, created_by
  ) values (
    v_sku_a, v_org_a, v_product_a, '  sku-a  ', '  SKU A  ', '  BAR-A  ',
    '  a001  ', '  PIECE  ', 'active', v_user_id
  );

  if (select sku_code <> 'SKU-A'
             or name <> 'SKU A'
             or barcode <> 'BAR-A'
             or sales_code <> 'A001'
             or base_unit_code <> 'piece'
             or quantity_scale <> 6
      from public.skus where id = v_sku_a) then
    raise exception 'sku_canonicalization_failed';
  end if;

  update public.products set status = 'active' where id = v_product_a;

  begin
    update public.products set status = 'active' where id = v_product_empty;
    raise exception 'expected_product_requires_active_sku';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.skus (
      organization_id, product_id, sku_code, name, base_unit_code
    ) values (v_org_a, v_product_a, 'sku-a', 'Duplicate SKU', 'piece');
    raise exception 'expected_duplicate_sku_code';
  exception when unique_violation then
    null;
  end;

  insert into public.skus (
    organization_id, product_id, sku_code, name, barcode, sales_code,
    base_unit_code
  ) values (
    v_org_b, v_product_b, 'sku-a', 'Same codes in another tenant',
    'BAR-A', 'A001', 'piece'
  );

  begin
    insert into public.skus (
      organization_id, product_id, sku_code, name, barcode, base_unit_code
    ) values (v_org_a, v_product_a, 'SKU-B', 'Duplicate barcode', 'BAR-A', 'piece');
    raise exception 'expected_duplicate_barcode';
  exception when unique_violation then
    null;
  end;

  begin
    insert into public.skus (
      organization_id, product_id, sku_code, name, sales_code, base_unit_code
    ) values (v_org_a, v_product_a, 'SKU-C', 'Duplicate sales code', 'a001', 'piece');
    raise exception 'expected_duplicate_sales_code';
  exception when unique_violation then
    null;
  end;

  begin
    insert into public.skus (
      organization_id, product_id, sku_code, name, base_unit_code
    ) values (v_org_b, v_product_a, 'CROSS-TENANT', 'Cross tenant', 'piece');
    raise exception 'expected_cross_tenant_product_fk';
  exception when foreign_key_violation then
    null;
  end;

  begin
    update public.skus set sales_code = 'A002' where id = v_sku_a;
    raise exception 'expected_permanent_sales_code';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    update public.skus set base_unit_code = 'kg' where id = v_sku_a;
    raise exception 'expected_immutable_base_unit';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    update public.skus set status = 'draft' where id = v_sku_a;
    raise exception 'expected_invalid_sku_status_transition';
  exception when sqlstate '22023' then
    null;
  end;

  update public.skus set status = 'archived' where id = v_sku_a;

  begin
    update public.skus set name = 'Changed archived SKU' where id = v_sku_a;
    raise exception 'expected_archived_sku_immutable';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    delete from public.skus where id = v_sku_a;
    raise exception 'expected_sku_delete_denied';
  exception when sqlstate '22023' then
    null;
  end;

  update public.products set status = 'archived' where id = v_product_a;

  begin
    update public.products set name = 'Changed archived product' where id = v_product_a;
    raise exception 'expected_archived_product_immutable';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    delete from public.products where id = v_product_a;
    raise exception 'expected_product_delete_denied';
  exception when sqlstate '22023' then
    null;
  end;

  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('products', 'skus')
      and c.relrowsecurity
    group by n.nspname
    having count(*) = 2
  ) then
    raise exception 'product_sku_rls_not_enabled';
  end if;

  -- Phase 2.0.3.5 intentionally grants authenticated SELECT so that its
  -- reviewed tenant/permission RLS policies can authorize visible rows.
  if has_table_privilege('anon', 'public.products', 'select')
     or has_table_privilege('anon', 'public.skus', 'select') then
    raise exception 'product_sku_anon_data_api_grant_open';
  end if;

  raise notice 'PHASE_2_0_3_2_PRODUCT_SKU_TESTS_PASSED';
end
$test$;

rollback;
