begin;

create table public.global_sales_code_creation_commands (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  flow text not null check (flow in ('normal', 'variant', 'rapid')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid not null references auth.users(id),
  status text not null default 'processing' check (status in ('processing', 'completed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint global_sales_code_creation_commands_org_id_unique
    unique (organization_id, id)
);

create index global_sales_code_creation_commands_org_created_idx
  on public.global_sales_code_creation_commands (organization_id, created_at desc);

alter table public.global_sales_code_creation_commands enable row level security;
alter table public.global_sales_code_creation_commands force row level security;
revoke all on table public.global_sales_code_creation_commands
  from public, anon, authenticated;

create or replace function private.confirm_global_sales_code_reservation(
  p_organization_id uuid,
  p_batch_id uuid,
  p_code text,
  p_sku_id uuid,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.sales_code_reservations%rowtype;
  v_sku public.skus%rowtype;
begin
  select s.* into strict v_sku
  from public.skus s
  where s.organization_id = p_organization_id and s.id = p_sku_id
  for update;

  if v_sku.status = 'archived'
     or v_sku.sales_code is distinct from upper(btrim(p_code)) then
    raise exception 'sales_code_creation_assignment_mismatch' using errcode = '23514';
  end if;

  select r.* into strict v_reservation
  from public.sales_code_reservations r
  where r.organization_id = p_organization_id
    and r.batch_id = p_batch_id
    and r.code = upper(btrim(p_code))
  for update;

  if v_reservation.status = 'assigned' and v_reservation.sku_id = p_sku_id then
    return v_reservation.id;
  end if;
  if v_reservation.status <> 'reserved'
     or v_reservation.expires_at <= now()
     or v_reservation.purpose <> 'permanent_sales'
     or v_reservation.sku_id is not null then
    raise exception 'identifier_reservation_conflict' using errcode = '23514';
  end if;

  update public.sales_code_reservations
  set status = 'assigned', sku_id = p_sku_id, assigned_by = p_actor_user_id,
      assigned_at = now(), expires_at = null
  where organization_id = p_organization_id and id = v_reservation.id;

  update public.sales_code_reservation_batches b
  set status = 'exhausted'
  where b.organization_id = p_organization_id and b.id = p_batch_id
    and not exists (
      select 1 from public.sales_code_reservations r
      where r.organization_id = b.organization_id
        and r.batch_id = b.id and r.status = 'reserved'
    );

  return v_reservation.id;
exception when no_data_found then
  raise exception 'identifier_reservation_not_found' using errcode = 'P0002';
end;
$$;

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
  if v_mode not in ('sequence', 'manual', 'same_as_sku', 'deferred') then
    raise exception 'global_sales_code_creation_mode_invalid' using errcode = '22023';
  end if;
  if p_flow = 'rapid' and v_mode = 'deferred' then
    raise exception 'rapid_sales_code_required' using errcode = '23514';
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
      if v_mode = 'sequence' then
        perform private.confirm_global_sales_code_reservation(
          p_organization_id, v_batch_id, v_reservation ->> 'code',
          (v_creation_result ->> 'sku_id')::uuid, p_actor_user_id
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
    'sales_codes', case when v_mode = 'sequence' then (
      select coalesce(jsonb_agg(value ->> 'code'), '[]'::jsonb)
      from jsonb_array_elements(v_reservations)
    ) else '[]'::jsonb end,
    'inventory_posted', false,
    'initial_stock_boundary', 't5-pending'
  );

  update public.global_sales_code_creation_commands
  set status = 'completed', result = v_result, completed_at = now()
  where organization_id = p_organization_id and id = p_command_id;

  perform private.append_organization_audit_log(
    p_organization_id, 'product', 'product.global_sales_codes.created',
    p_actor_user_id, 'global_sales_code_creation', p_command_id,
    p_flow || ' · ' || v_target_count::text || ' SKU',
    'Atomic Product/SKU creation with Global Sales Code V1',
    v_result - 'results', 'global_sales_code_creation_command', p_command_id,
    'product.global_sales_codes.created', v_occurred_at
  );
  return v_result;
exception when no_data_found then
  raise exception 'entity_not_found' using errcode = 'P0002';
end;
$$;

revoke all on function private.confirm_global_sales_code_reservation(
  uuid, uuid, text, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.server_execute_global_sales_code_creation(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.server_execute_global_sales_code_creation(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) to service_role;

comment on table public.global_sales_code_creation_commands is
  'GSC-05 trusted idempotency boundary for atomic Normal, Variant and Rapid Product creation.';
comment on function public.server_execute_global_sales_code_creation(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) is 'GSC-05 service-only all-or-nothing Product/SKU and Global Sales Code creation command. Initial Stock remains at the T5 boundary.';

commit;
