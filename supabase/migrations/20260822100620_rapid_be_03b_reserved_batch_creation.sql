-- Rapid-BE-03B: consume an approved subset of an existing Rapid Entry
-- reservation batch through the established GSC-05 atomic creation boundary.
-- Images and Initial Stock intentionally remain pending for BE-04 and BE-05.

begin;

create or replace function public.server_execute_global_sales_code_creation(
  p_command_id uuid,
  p_organization_id uuid,
  p_flow text,
  p_payload jsonb,
  p_request_hash text,
  p_actor_user_id uuid,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command public.global_sales_code_creation_commands%rowtype;
  v_reservation_batch public.sales_code_reservation_batches%rowtype;
  v_mode text;
  v_items jsonb;
  v_item jsonb;
  v_item_payload jsonb;
  v_variants jsonb;
  v_creation_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_reservations jsonb := '[]'::jsonb;
  v_reservation jsonb;
  v_reserve_result jsonb;
  v_allocator_payload jsonb;
  v_allocator_hash text;
  v_allocator_command_id uuid;
  v_batch_id uuid;
  v_target_count integer := 0;
  v_index integer := 0;
  v_variant_index integer;
  v_selected_reservation_count integer := 0;
  v_child_hash text;
  v_sku_id uuid;
  v_result jsonb;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_command_id is null or p_organization_id is null or p_actor_user_id is null
     or p_flow not in ('normal', 'variant', 'rapid')
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'global_sales_code_creation_input_invalid' using errcode = '22023';
  end if;

  v_mode := coalesce(nullif(p_payload ->> 'sales_code_mode', ''), 'sequence');
  if v_mode not in ('sequence', 'manual', 'same_as_sku', 'deferred', 'reserved_batch') then
    raise exception 'global_sales_code_creation_mode_invalid' using errcode = '22023';
  end if;
  if p_flow = 'rapid' and v_mode = 'deferred' then
    raise exception 'rapid_sales_code_required' using errcode = '23514';
  end if;
  if v_mode = 'reserved_batch' and p_flow <> 'rapid' then
    raise exception 'reserved_batch_mode_requires_rapid' using errcode = '23514';
  end if;

  v_items := p_payload -> 'creation_items';
  if jsonb_typeof(coalesce(v_items, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(v_items) < 1
     or jsonb_array_length(v_items) > 50
     or (p_flow in ('normal', 'variant') and jsonb_array_length(v_items) <> 1) then
    raise exception 'global_sales_code_creation_items_invalid' using errcode = '22023';
  end if;

  if not private.server_actor_has_org_permission(
    p_actor_user_id, p_organization_id, 'product.create', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  -- The UUID alone is the lock authority because the command table has a
  -- global PK. Keep this lock namespace identical to GSC-05 for replay safety.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_command_id::text, 20260821143000)
  );

  insert into public.global_sales_code_creation_commands (
    id, organization_id, flow, payload, request_hash, actor_user_id
  ) values (
    p_command_id, p_organization_id, p_flow, p_payload, p_request_hash,
    p_actor_user_id
  ) on conflict (id) do nothing;

  select c.* into strict v_command
  from public.global_sales_code_creation_commands c
  where c.id = p_command_id
  for update;

  if v_command.organization_id <> p_organization_id
     or v_command.flow <> p_flow
     or v_command.payload <> p_payload
     or v_command.request_hash <> p_request_hash
     or v_command.actor_user_id <> p_actor_user_id then
    if v_mode = 'reserved_batch' then
      raise exception 'idempotency_conflict' using errcode = '23505';
    end if;
    raise exception 'command_payload_conflict' using errcode = '23505';
  end if;
  if v_command.status = 'completed' then return v_command.result; end if;

  if p_flow = 'variant' then
    v_variants := (v_items -> 0) -> 'payload' -> 'variants';
    if jsonb_typeof(coalesce(v_variants, 'null'::jsonb)) <> 'array'
       or jsonb_array_length(v_variants) < 1
       or jsonb_array_length(v_variants) > 100 then
      raise exception 'global_sales_code_variant_items_invalid' using errcode = '22023';
    end if;
    v_target_count := jsonb_array_length(v_variants);
  else
    v_target_count := jsonb_array_length(v_items);
  end if;
  if v_target_count > 50 then
    raise exception 'global_sales_code_creation_target_limit_exceeded' using errcode = '22023';
  end if;

  if v_mode = 'sequence' then
    v_allocator_command_id := nullif(p_payload ->> 'allocator_command_id', '')::uuid;
    if v_allocator_command_id is null then
      raise exception 'global_sales_code_allocator_command_required' using errcode = '22023';
    end if;
    v_allocator_payload := jsonb_build_object(
      'prefix', upper(btrim(p_payload ->> 'requested_prefix')),
      'quantity', v_target_count,
      'ttl_hours', 3
    );
    v_allocator_hash := encode(extensions.digest(v_allocator_payload::text, 'sha256'), 'hex');
    v_reserve_result := public.server_reserve_global_sales_code_range(
      v_allocator_command_id, p_organization_id,
      p_payload ->> 'requested_prefix', v_target_count, v_allocator_hash,
      p_actor_user_id, v_occurred_at
    );
    v_batch_id := (v_reserve_result ->> 'batch_id')::uuid;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'code', r.code
    ) order by r.sequence_number), '[]'::jsonb)
    into v_reservations
    from public.sales_code_reservations r
    where r.organization_id = p_organization_id and r.batch_id = v_batch_id;
    if jsonb_array_length(v_reservations) <> v_target_count then
      raise exception 'global_sales_code_reservation_count_mismatch' using errcode = '23514';
    end if;
  elsif v_mode = 'reserved_batch' then
    if coalesce(p_payload ->> 'reservation_batch_id', '')
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'rapid_reservation_batch_required' using errcode = '22023';
    end if;
    v_batch_id := (p_payload ->> 'reservation_batch_id')::uuid;

    -- Lock the batch before individual reservations. This is the approved
    -- canonical lock order for every Rapid subset command.
    select b.* into v_reservation_batch
    from public.sales_code_reservation_batches b
    where b.organization_id = p_organization_id and b.id = v_batch_id
    for update;

    if v_reservation_batch.id is null
       or v_reservation_batch.created_by <> p_actor_user_id then
      raise exception 'rapid_reservation_not_owned' using errcode = '42501';
    end if;
    if v_reservation_batch.expires_at <= now() then
      raise exception 'rapid_reservation_expired' using errcode = '23514';
    end if;
    if v_reservation_batch.status <> 'active'
       or v_reservation_batch.purpose <> 'permanent_sales' then
      raise exception 'rapid_reserved_code_unavailable' using errcode = '23514';
    end if;

    -- Reject malformed or duplicate rows before any Product/SKU mutation.
    if exists (
      select 1
      from jsonb_array_elements(v_items) i(value)
      where jsonb_typeof(coalesce(i.value -> 'payload', 'null'::jsonb)) <> 'object'
        or jsonb_typeof(coalesce(i.value -> 'handoff', 'null'::jsonb)) <> 'object'
        or nullif(btrim(i.value ->> 'client_row_id'), '') is null
        or char_length(btrim(i.value ->> 'client_row_id')) > 128
        or coalesce(i.value ->> 'command_id', '')
           !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(upper(btrim(i.value ->> 'sales_code')), '')
           !~ '^[A-Z]{1,3}[0-9]{3}$'
        or coalesce(upper(btrim(i.value -> 'payload' ->> 'sku_code')), '')
           <> coalesce(upper(btrim(i.value ->> 'sales_code')), '')
        or nullif(btrim(i.value -> 'payload' ->> 'name'), '') is null
        or char_length(btrim(i.value -> 'payload' ->> 'name')) > 160
        or nullif(btrim(i.value -> 'payload' ->> 'sku_name'), '') is null
        or char_length(btrim(i.value -> 'payload' ->> 'sku_name')) > 160
        or coalesce(i.value -> 'payload' ->> 'structure_type', 'standard') <> 'standard'
        or coalesce(i.value -> 'payload' ->> 'base_unit_code', '')
           not in ('piece', 'pair', 'bottle', 'pack', 'set', 'box', 'kg')
        or coalesce(i.value -> 'payload' ->> 'sale_price', '')
           !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
        or case
             when coalesce(i.value -> 'payload' ->> 'sale_price', '')
                  ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
             then (i.value -> 'payload' ->> 'sale_price')::numeric > 999999999.99
             else false
           end
        or coalesce(i.value -> 'payload' ->> 'category_id', '')
           !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(i.value -> 'handoff' ->> 'branch_id', '')
           !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(i.value -> 'handoff' ->> 'initial_stock', '')
           !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'
        or case
             when coalesce(i.value -> 'handoff' ->> 'initial_stock', '')
                  ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'
             then (i.value -> 'handoff' ->> 'initial_stock')::numeric > 999999999
             else false
           end
    ) then
      raise exception 'rapid_row_invalid' using errcode = '22023';
    end if;

    if exists (
      select 1 from (
        select lower(btrim(value ->> 'client_row_id')) as key
        from jsonb_array_elements(v_items)
        group by 1 having count(*) > 1
        union all
        select upper(btrim(value ->> 'sales_code'))
        from jsonb_array_elements(v_items)
        group by 1 having count(*) > 1
        union all
        select lower(value ->> 'command_id')
        from jsonb_array_elements(v_items)
        group by 1 having count(*) > 1
        union all
        select lower(btrim(value -> 'payload' ->> 'name'))
        from jsonb_array_elements(v_items)
        group by 1 having count(*) > 1
      ) duplicate_keys
    ) then
      raise exception 'rapid_row_duplicate' using errcode = '23505';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_items) i(value)
      where not exists (
        select 1 from public.product_categories c
        where c.organization_id = p_organization_id
          and c.id = (i.value -> 'payload' ->> 'category_id')::uuid
          and c.status = 'active'
      )
    ) then
      raise exception 'rapid_row_invalid' using errcode = 'P0002';
    end if;

    -- Product creation is Organization-scoped, but the selected stock handoff
    -- branch must still be active and inside the actor's maximum membership scope.
    if exists (
      select 1
      from jsonb_array_elements(v_items) i(value)
      where not exists (
        select 1
        from public.branches b
        join public.organization_members om
          on om.organization_id = b.organization_id
         and om.user_id = p_actor_user_id
         and om.membership_status = 'active'
        where b.organization_id = p_organization_id
          and b.id = (i.value -> 'handoff' ->> 'branch_id')::uuid
          and b.status = 'active'
          and (
            rtrim(om.scope) = 'organization'
            or exists (
              select 1 from public.member_branches mb
              where mb.membership_id = om.id and mb.branch_id = b.id
            )
          )
      )
    ) then
      raise exception 'rapid_row_invalid' using errcode = '42501';
    end if;

    -- Acquire all selected row locks in sequence order before creating any
    -- child entities. Different submitted row orders cannot invert locks.
    perform r.id
    from public.sales_code_reservations r
    join jsonb_array_elements(v_items) i(value)
      on r.code = upper(btrim(i.value ->> 'sales_code'))
    where r.organization_id = p_organization_id and r.batch_id = v_batch_id
    order by r.sequence_number, r.id
    for update of r;

    select count(*)
    into v_selected_reservation_count
    from public.sales_code_reservations r
    join jsonb_array_elements(v_items) i(value)
      on r.code = upper(btrim(i.value ->> 'sales_code'))
    where r.organization_id = p_organization_id
      and r.batch_id = v_batch_id
      and r.purpose = 'permanent_sales'
      and r.status = 'reserved'
      and r.sku_id is null
      and r.created_by = p_actor_user_id
      and r.expires_at > now();

    if v_selected_reservation_count <> v_target_count then
      raise exception 'rapid_reserved_code_unavailable' using errcode = '23514';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'code', r.code, 'sequence_number', r.sequence_number
    ) order by i.ordinality), '[]'::jsonb)
    into v_reservations
    from jsonb_array_elements(v_items) with ordinality i(value, ordinality)
    join public.sales_code_reservations r
      on r.organization_id = p_organization_id
     and r.batch_id = v_batch_id
     and r.code = upper(btrim(i.value ->> 'sales_code'));
  end if;

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    if nullif(v_item ->> 'command_id', '') is null
       or jsonb_typeof(coalesce(v_item -> 'payload', 'null'::jsonb)) <> 'object' then
      raise exception 'global_sales_code_creation_child_invalid' using errcode = '22023';
    end if;
    v_item_payload := v_item -> 'payload';

    if p_flow = 'variant' then
      select jsonb_agg(
        case
          when v_mode = 'sequence' then jsonb_set(value, '{sales_code}', to_jsonb(v_reservations -> ((ordinality - 1)::integer) ->> 'code'), true)
          when v_mode = 'same_as_sku' then jsonb_set(value, '{sales_code}', to_jsonb(upper(btrim(value ->> 'sku_code'))), true)
          else value
        end order by ordinality
      ) into v_variants
      from jsonb_array_elements(v_item_payload -> 'variants') with ordinality;
      v_item_payload := jsonb_set(v_item_payload, '{variants}', v_variants, true);
      v_child_hash := encode(extensions.digest(v_item_payload::text, 'sha256'), 'hex');
      v_creation_result := public.server_execute_variant_sku_sequence_command(
        (v_item ->> 'command_id')::uuid, p_organization_id,
        'product.create_with_variants', v_item_payload, v_child_hash,
        p_actor_user_id, v_occurred_at
      );
      if v_mode = 'sequence' then
        for v_variant_index in 0..v_target_count - 1 loop
          v_reservation := v_reservations -> v_variant_index;
          v_sku_id := (v_creation_result -> 'variants' -> v_variant_index ->> 'sku_id')::uuid;
          perform private.confirm_global_sales_code_reservation(
            p_organization_id, v_batch_id, v_reservation ->> 'code',
            v_sku_id, p_actor_user_id
          );
        end loop;
      end if;
      v_results := v_results || jsonb_build_array(v_creation_result);
    else
      if coalesce(v_item ->> 'command_type', 'product.create_with_initial_sku')
         <> 'product.create_with_initial_sku' then
        raise exception 'global_sales_code_child_command_type_invalid' using errcode = '22023';
      end if;
      if v_mode = 'sequence' then
        v_reservation := v_reservations -> v_index;
        v_item_payload := jsonb_set(v_item_payload, '{sales_code}', to_jsonb(v_reservation ->> 'code'), true);
      elsif v_mode = 'reserved_batch' then
        v_reservation := v_reservations -> v_index;
        v_item_payload := jsonb_set(v_item_payload, '{sku_code}', to_jsonb(v_reservation ->> 'code'), true);
        v_item_payload := jsonb_set(v_item_payload, '{sales_code}', to_jsonb(v_reservation ->> 'code'), true);
      elsif v_mode = 'same_as_sku' then
        v_item_payload := jsonb_set(v_item_payload, '{sales_code}', to_jsonb(upper(btrim(v_item_payload ->> 'sku_code'))), true);
      end if;
      if p_flow = 'rapid' and nullif(btrim(v_item_payload ->> 'sales_code'), '') is null then
        raise exception 'rapid_sales_code_required' using errcode = '23514';
      end if;
      v_child_hash := encode(extensions.digest(v_item_payload::text, 'sha256'), 'hex');
      v_creation_result := public.server_execute_product_creation_command(
        (v_item ->> 'command_id')::uuid, p_organization_id,
        'product.create_with_initial_sku', v_item_payload, v_child_hash,
        p_actor_user_id, v_occurred_at
      );
      if v_mode in ('sequence', 'reserved_batch') then
        perform private.confirm_global_sales_code_reservation(
          p_organization_id, v_batch_id, v_reservation ->> 'code',
          (v_creation_result ->> 'sku_id')::uuid, p_actor_user_id
        );
      end if;
      if v_mode = 'reserved_batch' then
        v_creation_result := v_creation_result || jsonb_build_object(
          'client_row_id', v_item ->> 'client_row_id',
          'sales_code', v_reservation ->> 'code',
          'sku_code', v_reservation ->> 'code',
          'handoff', v_item -> 'handoff'
        );
      end if;
      v_results := v_results || jsonb_build_array(v_creation_result);
      v_index := v_index + 1;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'command_id', p_command_id,
    'flow', p_flow,
    'sales_code_mode', v_mode,
    'created_count', jsonb_array_length(v_results),
    'sku_count', v_target_count,
    'results', v_results,
    'sales_code_batch_id', v_batch_id,
    'sales_codes', case when v_mode in ('sequence', 'reserved_batch') then (
      select coalesce(jsonb_agg(value ->> 'code' order by ordinality), '[]'::jsonb)
      from jsonb_array_elements(v_reservations) with ordinality
    ) else '[]'::jsonb end,
    'inventory_posted', false,
    'initial_stock_boundary', case when v_mode = 'reserved_batch'
      then 'rapid-be-05-pending' else 't5-pending' end
  );

  if v_mode = 'reserved_batch' then
    v_result := v_result || jsonb_build_object(
      'status', 'succeeded',
      'reservation_batch_id', v_batch_id,
      'items', v_results,
      'images_finalized', false,
      'image_boundary', 'rapid-be-04-pending'
    );
  end if;

  update public.global_sales_code_creation_commands
  set status = 'completed', result = v_result, completed_at = now()
  where organization_id = p_organization_id and id = p_command_id;

  perform private.append_organization_audit_log(
    p_organization_id, 'product', 'product.global_sales_codes.created',
    p_actor_user_id, 'global_sales_code_creation', p_command_id,
    p_flow || ' · ' || v_target_count::text || ' SKU',
    'Atomic Product/SKU creation with Global Sales Code V1',
    v_result - 'results' - 'items',
    'global_sales_code_creation_command', p_command_id,
    'product.global_sales_codes.created', v_occurred_at
  );
  return v_result;
exception when no_data_found then
  raise exception 'entity_not_found' using errcode = 'P0002';
end;
$$;

revoke all on function public.server_execute_global_sales_code_creation(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.server_execute_global_sales_code_creation(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) to service_role;

comment on function public.server_execute_global_sales_code_creation(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) is 'GSC-05 plus Rapid-BE-03B: service-only all-or-nothing Product/SKU creation, including selected rows from an actor-owned unexpired Rapid reservation batch. Images and Initial Stock remain explicit pending boundaries.';

commit;
