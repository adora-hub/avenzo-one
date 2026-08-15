\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000001101', 'r6-owner@example.test', now(), now()),
  ('00000000-0000-4000-8000-000000001102', 'r6-outsider@example.test', now(), now());

insert into public.organizations (
  id, name, slug, status, timezone, currency, created_by
) values (
  '00000000-0000-4000-8000-000000001201', 'R6 Test Organization',
  'r6-test-organization', 'active', 'Asia/Bangkok', 'THB',
  '00000000-0000-4000-8000-000000001101'
);

do $$
declare
  v_owner_role uuid;
  v_owner_membership uuid;
begin
  select id into v_owner_role from public.organization_roles
  where organization_id = '00000000-0000-4000-8000-000000001201' and code = 'owner';
  select id into strict v_owner_membership from public.organization_members
  where organization_id = '00000000-0000-4000-8000-000000001201'
    and user_id = '00000000-0000-4000-8000-000000001101';
  if v_owner_role is null then
    insert into public.organization_roles (
      id, organization_id, code, name, description, is_system, created_by
    ) values (
      '00000000-0000-4000-8000-000000001401',
      '00000000-0000-4000-8000-000000001201', 'owner', 'Owner',
      'R6 test owner', true, '00000000-0000-4000-8000-000000001101'
    ) returning id into v_owner_role;
  end if;
  insert into public.member_roles (membership_id, role_id)
  values (v_owner_membership, v_owner_role) on conflict do nothing;
end;
$$;

insert into public.products (
  id, organization_id, name, status, created_by, updated_by
) values (
  '00000000-0000-4000-8000-000000001501',
  '00000000-0000-4000-8000-000000001201', 'R6 Image Product', 'draft',
  '00000000-0000-4000-8000-000000001101',
  '00000000-0000-4000-8000-000000001101'
);

do $$
declare
  v_result jsonb;
  v_replay jsonb;
  v_index integer;
begin
  v_result := public.server_execute_product_image_command(
    '00000000-0000-4000-8000-000000001701',
    '00000000-0000-4000-8000-000000001201', 'product.image.prepare',
    '{"product_id":"00000000-0000-4000-8000-000000001501","original_file_name":"cover.jpg","mime_type":"image/jpeg","file_size_bytes":2048,"alt_text":"R6 cover"}'::jsonb,
    repeat('a', 64), '00000000-0000-4000-8000-000000001101'
  );
  v_replay := public.server_execute_product_image_command(
    '00000000-0000-4000-8000-000000001701',
    '00000000-0000-4000-8000-000000001201', 'product.image.prepare',
    '{"product_id":"00000000-0000-4000-8000-000000001501","original_file_name":"cover.jpg","mime_type":"image/jpeg","file_size_bytes":2048,"alt_text":"R6 cover"}'::jsonb,
    repeat('a', 64), '00000000-0000-4000-8000-000000001101'
  );
  if v_result <> v_replay then raise exception 'R6 idempotent replay changed result'; end if;
  if v_result ->> 'storage_path' not like
    '00000000-0000-4000-8000-000000001201/00000000-0000-4000-8000-000000001501/%.jpg' then
    raise exception 'R6 immutable tenant path is invalid';
  end if;

  begin
    perform public.server_execute_product_image_command(
      '00000000-0000-4000-8000-000000001702',
      '00000000-0000-4000-8000-000000001201', 'product.image.finalize',
      jsonb_build_object('image_id', v_result ->> 'entity_id', 'expected_version', 1),
      repeat('b', 64), '00000000-0000-4000-8000-000000001101'
    );
    raise exception 'R6 expected missing object rejection';
  exception when invalid_parameter_value then
    if sqlerrm not like '%product_image_object_missing%' then raise; end if;
  end;

  for v_index in 2..9 loop
    perform public.server_execute_product_image_command(
      ('00000000-0000-4000-8000-' || lpad((1700 + v_index)::text, 12, '0'))::uuid,
      '00000000-0000-4000-8000-000000001201', 'product.image.prepare',
      jsonb_build_object(
        'product_id', '00000000-0000-4000-8000-000000001501',
        'original_file_name', 'image-' || v_index || '.png',
        'mime_type', 'image/png', 'file_size_bytes', 1024
      ), repeat(v_index::text, 64), '00000000-0000-4000-8000-000000001101'
    );
  end loop;

  begin
    perform public.server_execute_product_image_command(
      '00000000-0000-4000-8000-000000001799',
      '00000000-0000-4000-8000-000000001201', 'product.image.prepare',
      '{"product_id":"00000000-0000-4000-8000-000000001501","original_file_name":"tenth.webp","mime_type":"image/webp","file_size_bytes":100}'::jsonb,
      repeat('f', 64), '00000000-0000-4000-8000-000000001101'
    );
    raise exception 'R6 expected 9 image limit';
  exception when invalid_parameter_value then
    if sqlerrm not like '%product_image_limit_exceeded%' then raise; end if;
  end;

  perform public.server_execute_product_image_command(
    '00000000-0000-4000-8000-000000001798',
    '00000000-0000-4000-8000-000000001201', 'product.image.fail',
    jsonb_build_object(
      'image_id', v_result ->> 'entity_id', 'expected_version', 1,
      'failure_reason', 'test upload compensation'
    ), repeat('e', 64), '00000000-0000-4000-8000-000000001101'
  );
end;
$$;

do $$
begin
  if (select count(*) from public.product_images where status = 'uploading') <> 8 then
    raise exception 'R6 active image count is incorrect';
  end if;
  if (select count(*) from public.product_image_events) <> 10 then
    raise exception 'R6 command event count is incorrect';
  end if;
  if has_table_privilege('authenticated', 'public.product_images', 'INSERT')
     or has_table_privilege('authenticated', 'public.product_images', 'UPDATE')
     or has_table_privilege('authenticated', 'public.product_images', 'DELETE') then
    raise exception 'authenticated must not mutate product image metadata directly';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.server_execute_product_image_command(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)',
    'EXECUTE'
  ) then raise exception 'authenticated must not execute trusted R6 command directly'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001101', true);
do $$ begin
  if (select count(*) from public.product_images) <> 9 then
    raise exception 'R6 creator should see own upload lifecycle rows';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001102', true);
do $$ begin
  if (select count(*) from public.product_images) <> 0 then
    raise exception 'R6 outsider saw tenant product images';
  end if;
end $$;

reset role;
rollback;

select 'PHASE_2_1_R6_BEHAVIOR_AND_RLS_OK' as result;
