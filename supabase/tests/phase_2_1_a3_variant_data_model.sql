\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000a301', 'a3-owner@example.test', now(), now()),
  ('00000000-0000-4000-8000-00000000a302', 'a3-reader@example.test', now(), now()),
  ('00000000-0000-4000-8000-00000000a303', 'a3-other-owner@example.test', now(), now());

insert into public.organizations (
  id, name, slug, status, timezone, currency, created_by
) values
  (
    '00000000-0000-4000-8000-00000000a311', 'A3 Organization A',
    'a3-organization-a', 'active', 'Asia/Bangkok', 'THB',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a312', 'A3 Organization B',
    'a3-organization-b', 'active', 'Asia/Bangkok', 'THB',
    '00000000-0000-4000-8000-00000000a303'
  );

insert into public.organization_members (
  id, organization_id, user_id, membership_status, scope
) values (
  '00000000-0000-4000-8000-00000000a321',
  '00000000-0000-4000-8000-00000000a311',
  '00000000-0000-4000-8000-00000000a302', 'active', 'organization'
);

do $$
declare
  v_reader_role uuid := '00000000-0000-4000-8000-00000000a331';
begin
  insert into public.organization_roles (
    id, organization_id, code, name, description, is_system, created_by
  ) values (
    v_reader_role, '00000000-0000-4000-8000-00000000a311',
    'a3_reader', 'A3 Reader', 'Read Variant data only', false,
    '00000000-0000-4000-8000-00000000a301'
  );

  insert into public.role_permissions (role_id, permission_code)
  values (v_reader_role, 'product.read');

  insert into public.member_roles (membership_id, role_id)
  values ('00000000-0000-4000-8000-00000000a321', v_reader_role);
end;
$$;

insert into public.products (
  id, organization_id, name, structure_type, status, created_by, updated_by
) values
  (
    '00000000-0000-4000-8000-00000000a401',
    '00000000-0000-4000-8000-00000000a311',
    'A3 Variant Product', 'variant', 'draft',
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a402',
    '00000000-0000-4000-8000-00000000a311',
    'A3 Standard Product', 'standard', 'draft',
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a403',
    '00000000-0000-4000-8000-00000000a312',
    'A3 Other Tenant Product', 'variant', 'draft',
    '00000000-0000-4000-8000-00000000a303',
    '00000000-0000-4000-8000-00000000a303'
  );

insert into public.skus (
  id, organization_id, product_id, sku_code, name, base_unit_code,
  status, created_by, updated_by
) values
  (
    '00000000-0000-4000-8000-00000000a501',
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a401',
    'A3-SHIRT-BLUE-S', 'Blue shirt / S', 'piece', 'draft',
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a502',
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a401',
    'A3-SHIRT-BLUE-M', 'Blue shirt / M', 'piece', 'draft',
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a503',
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a401',
    'A3-SHIRT-DUPLICATE', 'Duplicate combination candidate', 'piece', 'draft',
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a504',
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a402',
    'A3-STANDARD-001', 'Standard Product SKU', 'piece', 'draft',
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  );

insert into public.product_option_groups (
  id, organization_id, product_id, name, option_kind, display_order,
  created_by, updated_by
) values
  (
    '00000000-0000-4000-8000-00000000a601',
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a401',
    'สี', 'color', 1,
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a602',
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a401',
    'ไซซ์', 'size', 2,
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a603',
    '00000000-0000-4000-8000-00000000a312',
    '00000000-0000-4000-8000-00000000a403',
    'สี', 'color', 1,
    '00000000-0000-4000-8000-00000000a303',
    '00000000-0000-4000-8000-00000000a303'
  );

insert into public.product_option_values (
  id, organization_id, option_group_id, name, code, color_hex, display_order,
  created_by, updated_by
) values
  (
    '00000000-0000-4000-8000-00000000a701',
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a601',
    'สีฟ้า', 'BLUE', '#2F80ED', 1,
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a702',
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a601',
    'สีดำ', 'BLACK', '#111111', 2,
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a703',
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a602',
    'S', 'S', null, 1,
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a704',
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a602',
    'M', 'M', null, 2,
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  );

insert into public.product_option_value_aliases (
  id, organization_id, option_group_id, option_value_id, alias,
  created_by, updated_by
) values
  (
    '00000000-0000-4000-8000-00000000a801',
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a601',
    '00000000-0000-4000-8000-00000000a701', 'Blue',
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a802',
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a601',
    '00000000-0000-4000-8000-00000000a701', 'ฟ้า',
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  );

insert into public.sku_option_assignments (
  organization_id, product_id, sku_id, option_group_id, option_value_id,
  created_by, updated_by
) values
  (
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a401',
    '00000000-0000-4000-8000-00000000a501',
    '00000000-0000-4000-8000-00000000a601',
    '00000000-0000-4000-8000-00000000a701',
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a401',
    '00000000-0000-4000-8000-00000000a501',
    '00000000-0000-4000-8000-00000000a602',
    '00000000-0000-4000-8000-00000000a703',
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a401',
    '00000000-0000-4000-8000-00000000a502',
    '00000000-0000-4000-8000-00000000a601',
    '00000000-0000-4000-8000-00000000a701',
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  ),
  (
    '00000000-0000-4000-8000-00000000a311',
    '00000000-0000-4000-8000-00000000a401',
    '00000000-0000-4000-8000-00000000a502',
    '00000000-0000-4000-8000-00000000a602',
    '00000000-0000-4000-8000-00000000a704',
    '00000000-0000-4000-8000-00000000a301',
    '00000000-0000-4000-8000-00000000a301'
  );

set constraints all immediate;
set constraints all deferred;

do $$
begin
  if (select normalized_alias from public.product_option_value_aliases
      where id = '00000000-0000-4000-8000-00000000a801') <> 'blue' then
    raise exception 'A3 alias normalization failed';
  end if;

  if has_table_privilege('authenticated', 'public.product_option_groups', 'INSERT')
     or has_table_privilege('authenticated', 'public.sku_option_assignments', 'UPDATE') then
    raise exception 'authenticated must not write A3 tables directly';
  end if;

  begin
    update public.skus
    set sku_code = 'A3-SHIRT-BLUE-S-CHANGED'
    where id = '00000000-0000-4000-8000-00000000a501';
    raise exception 'A3 expected immutable SKU code failure';
  exception when invalid_parameter_value then
    if sqlerrm not like '%sku_code_is_immutable%' then raise; end if;
  end;

  begin
    insert into public.sku_option_assignments (
      organization_id, product_id, sku_id, option_group_id, option_value_id,
      created_by, updated_by
    ) values (
      '00000000-0000-4000-8000-00000000a311',
      '00000000-0000-4000-8000-00000000a402',
      '00000000-0000-4000-8000-00000000a504',
      '00000000-0000-4000-8000-00000000a601',
      '00000000-0000-4000-8000-00000000a701',
      '00000000-0000-4000-8000-00000000a301',
      '00000000-0000-4000-8000-00000000a301'
    );
    raise exception 'A3 expected standard Product assignment failure';
  exception when foreign_key_violation or check_violation then
    if sqlerrm not like '%invalid_or_inactive_variant_assignment%'
       and sqlerrm not like '%sku_option_assignments_group_fk%' then raise; end if;
  end;

  begin
    insert into public.product_option_value_aliases (
      organization_id, option_group_id, option_value_id, alias,
      created_by, updated_by
    ) values (
      '00000000-0000-4000-8000-00000000a311',
      '00000000-0000-4000-8000-00000000a601',
      '00000000-0000-4000-8000-00000000a702', 'BLUE',
      '00000000-0000-4000-8000-00000000a301',
      '00000000-0000-4000-8000-00000000a301'
    );
    raise exception 'A3 expected duplicate normalized alias failure';
  exception when unique_violation then
    if sqlerrm not like '%product_option_value_aliases_group_alias_unique%' then raise; end if;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.sku_option_assignments (
      organization_id, product_id, sku_id, option_group_id, option_value_id,
      created_by, updated_by
    ) values
      (
        '00000000-0000-4000-8000-00000000a311',
        '00000000-0000-4000-8000-00000000a401',
        '00000000-0000-4000-8000-00000000a503',
        '00000000-0000-4000-8000-00000000a601',
        '00000000-0000-4000-8000-00000000a701',
        '00000000-0000-4000-8000-00000000a301',
        '00000000-0000-4000-8000-00000000a301'
      ),
      (
        '00000000-0000-4000-8000-00000000a311',
        '00000000-0000-4000-8000-00000000a401',
        '00000000-0000-4000-8000-00000000a503',
        '00000000-0000-4000-8000-00000000a602',
        '00000000-0000-4000-8000-00000000a703',
        '00000000-0000-4000-8000-00000000a301',
        '00000000-0000-4000-8000-00000000a301'
      );
    set constraints all immediate;
    raise exception 'A3 expected duplicate Variant combination failure';
  exception when unique_violation then
    if sqlerrm not like '%duplicate_variant_combination%' then raise; end if;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000a302', true);

do $$
begin
  if (select count(*) from public.product_option_groups) <> 2 then
    raise exception 'A3 product.read actor did not see exactly its tenant option groups';
  end if;
  if (select count(*) from public.product_option_values) <> 4 then
    raise exception 'A3 product.read actor did not see exactly its tenant option values';
  end if;
  if (select count(*) from public.sku_option_assignments) <> 4 then
    raise exception 'A3 product.read actor did not see exactly its tenant assignments';
  end if;
end;
$$;

reset role;
rollback;

select 'PHASE_2_1_A3_VARIANT_DATA_MODEL_OK' as result;
