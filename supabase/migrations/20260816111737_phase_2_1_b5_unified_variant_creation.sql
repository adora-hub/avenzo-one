-- Phase 2.1 B5: trusted unified Product Variant creation.
-- The core Product/Variant/SKU/Identifier/Profile write is one Postgres transaction.
-- Binary image upload remains the existing recoverable R6 workflow; once files are
-- ready, product.variant_images.assign links the selected Product images to SKUs.

alter table public.foundation_commands
  drop constraint foundation_commands_type_check;

alter table public.foundation_commands
  add constraint foundation_commands_type_check check (command_type in (
    'product.create', 'product.create_with_initial_sku', 'product.create_with_variants',
    'product.variant_images.assign',
    'product.update', 'product.activate', 'product.archive',
    'sku.create', 'sku.update', 'sku.activate', 'sku.archive',
    'warehouse.create', 'warehouse.update', 'warehouse.inactivate', 'warehouse.archive',
    'location.create', 'location.update', 'location.inactivate', 'location.archive'
  ));

alter table public.foundation_domain_events
  drop constraint foundation_domain_events_name_check;

alter table public.foundation_domain_events
  add constraint foundation_domain_events_name_check check (event_name in (
    'product.created', 'product.created_with_initial_sku', 'product.created_with_variants',
    'product.variant_images.assigned',
    'product.updated', 'product.activated', 'product.archived',
    'sku.created', 'sku.updated', 'sku.activated', 'sku.archived',
    'warehouse.created', 'warehouse.updated', 'warehouse.inactivated', 'warehouse.archived',
    'location.created', 'location.updated', 'location.inactivated', 'location.archived'
  ));

create or replace function public.server_execute_variant_creation_command(
  p_command_id uuid,
  p_organization_id uuid,
  p_command_type text,
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
  v_command public.foundation_commands%rowtype;
  v_product public.products%rowtype;
  v_sku public.skus%rowtype;
  v_group public.product_option_groups%rowtype;
  v_value public.product_option_values%rowtype;
  v_group_item jsonb;
  v_value_item jsonb;
  v_variant_item jsonb;
  v_unit_item jsonb;
  v_assignment_item jsonb;
  v_group_index bigint;
  v_value_index bigint;
  v_group_count integer;
  v_variant_count integer;
  v_assignment_count integer;
  v_tag_count integer := 0;
  v_image_assignment_count integer := 0;
  v_currency_code text;
  v_tax_category text;
  v_quantity_behavior text;
  v_base_unit_code text;
  v_tax_rate numeric;
  v_sale_price numeric;
  v_result_variants jsonb := '[]'::jsonb;
  v_result jsonb;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_command_id is null or p_organization_id is null or p_actor_user_id is null then
    raise exception 'variant_creation_command_identity_required' using errcode = '22023';
  end if;
  if p_command_type not in ('product.create_with_variants', 'product.variant_images.assign') then
    raise exception 'variant_creation_command_type_invalid' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'variant_creation_payload_invalid' using errcode = '22023';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'variant_creation_request_hash_invalid' using errcode = '22023';
  end if;
  if not private.server_actor_has_org_permission(
    p_actor_user_id, p_organization_id, 'product.manage', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  insert into public.foundation_commands (
    id, organization_id, command_type, payload, request_hash, actor_user_id
  ) values (
    p_command_id, p_organization_id, p_command_type,
    p_payload, p_request_hash, p_actor_user_id
  ) on conflict (id) do nothing;

  select c.* into strict v_command
  from public.foundation_commands c
  where c.id = p_command_id
  for update;

  if v_command.organization_id <> p_organization_id
     or v_command.command_type <> p_command_type
     or v_command.payload <> p_payload
     or v_command.request_hash <> p_request_hash
     or v_command.actor_user_id <> p_actor_user_id then
    raise exception 'command_payload_conflict' using errcode = '23505';
  end if;
  if v_command.status = 'completed' then
    return v_command.result;
  end if;

  perform set_config('avenzo.foundation_command_id', p_command_id::text, true);
  perform set_config('avenzo.foundation_organization_id', p_organization_id::text, true);

  if p_command_type = 'product.variant_images.assign' then
    if nullif(p_payload ->> 'product_id', '') is null
       or jsonb_typeof(coalesce(p_payload -> 'assignments', 'null'::jsonb)) <> 'array'
       or jsonb_array_length(p_payload -> 'assignments') > 100 then
      raise exception 'variant_image_assignment_payload_invalid' using errcode = '22023';
    end if;
    select p.* into strict v_product
    from public.products p
    where p.organization_id = p_organization_id
      and p.id = (p_payload ->> 'product_id')::uuid
      and p.structure_type = 'variant';

    for v_assignment_item in
      select value from jsonb_array_elements(p_payload -> 'assignments')
    loop
      if nullif(v_assignment_item ->> 'sku_id', '') is null
         or nullif(v_assignment_item ->> 'product_image_id', '') is null then
        raise exception 'variant_image_assignment_required_field_missing' using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.skus s
        where s.organization_id = p_organization_id
          and s.product_id = v_product.id
          and s.id = (v_assignment_item ->> 'sku_id')::uuid
      ) or not exists (
        select 1 from public.product_images i
        where i.organization_id = p_organization_id
          and i.product_id = v_product.id
          and i.id = (v_assignment_item ->> 'product_image_id')::uuid
          and i.status = 'ready'
      ) then
        raise exception 'variant_image_assignment_reference_invalid' using errcode = 'P0002';
      end if;
      insert into public.sku_variant_images (
        organization_id, product_id, sku_id, product_image_id,
        sort_order, is_primary, created_by
      ) values (
        p_organization_id, v_product.id,
        (v_assignment_item ->> 'sku_id')::uuid,
        (v_assignment_item ->> 'product_image_id')::uuid,
        1, true, p_actor_user_id
      ) on conflict (organization_id, sku_id, product_image_id) do nothing;
      v_image_assignment_count := v_image_assignment_count + 1;
    end loop;

    v_result := jsonb_build_object(
      'entity_id', v_product.id,
      'entity_type', 'product',
      'product_id', v_product.id,
      'image_assignment_count', v_image_assignment_count
    );

    insert into public.foundation_domain_events (
      organization_id, branch_id, event_name, command_id,
      entity_type, entity_id, actor_user_id, metadata, occurred_at
    ) values (
      p_organization_id, null, 'product.variant_images.assigned', p_command_id,
      'product', v_product.id, p_actor_user_id,
      v_result - 'entity_id' - 'entity_type', v_occurred_at
    );
    perform private.append_organization_audit_log(
      p_organization_id, 'product', 'product.variant_images.assigned', p_actor_user_id,
      'product', v_product.id, v_product.name,
      'Assigned ready Product images to Variant SKUs',
      v_result - 'entity_id' - 'entity_type',
      'foundation_command', p_command_id,
      'product.variant_images.assigned', v_occurred_at
    );
  else
    if nullif(btrim(p_payload ->> 'name'), '') is null
       or nullif(p_payload ->> 'category_id', '') is null
       or jsonb_typeof(coalesce(p_payload -> 'option_groups', 'null'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(p_payload -> 'variants', 'null'::jsonb)) <> 'array' then
      raise exception 'variant_creation_required_field_missing' using errcode = '22023';
    end if;
    v_group_count := jsonb_array_length(p_payload -> 'option_groups');
    v_variant_count := jsonb_array_length(p_payload -> 'variants');
    if v_group_count < 1 or v_group_count > 3
       or v_variant_count < 1 or v_variant_count > 100 then
      raise exception 'variant_creation_collection_limit_invalid' using errcode = '22023';
    end if;
    if p_payload ? 'tag_ids' and jsonb_typeof(p_payload -> 'tag_ids') <> 'array' then
      raise exception 'variant_creation_tag_ids_invalid' using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(p_payload -> 'tag_ids', '[]'::jsonb)) > 12 then
      raise exception 'variant_creation_tag_limit_exceeded' using errcode = '22023';
    end if;
    if p_payload ? 'sell_units' and jsonb_typeof(p_payload -> 'sell_units') <> 'array' then
      raise exception 'variant_creation_sell_units_invalid' using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(p_payload -> 'sell_units', '[]'::jsonb)) > 50 then
      raise exception 'variant_creation_sell_unit_limit_exceeded' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.product_categories c
      where c.organization_id = p_organization_id
        and c.id = (p_payload ->> 'category_id')::uuid
        and c.status = 'active'
    ) then
      raise exception 'product_category_not_found_or_inactive' using errcode = 'P0002';
    end if;
    if nullif(p_payload ->> 'brand_id', '') is not null and not exists (
      select 1 from public.product_brands b
      where b.organization_id = p_organization_id
        and b.id = (p_payload ->> 'brand_id')::uuid
        and b.status = 'active'
    ) then
      raise exception 'product_brand_not_found_or_inactive' using errcode = 'P0002';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(coalesce(p_payload -> 'tag_ids', '[]'::jsonb)) t(tag_id)
      where not exists (
        select 1 from public.product_tags pt
        where pt.organization_id = p_organization_id
          and pt.id = t.tag_id::uuid
          and pt.status = 'active'
      )
    ) then
      raise exception 'product_tag_not_found_or_inactive' using errcode = 'P0002';
    end if;

    v_currency_code := coalesce(nullif(p_payload ->> 'currency_code', ''), 'THB');
    v_tax_category := coalesce(nullif(p_payload ->> 'tax_category', ''), 'standard');
    v_quantity_behavior := coalesce(nullif(p_payload ->> 'quantity_behavior', ''), 'discrete');
    v_base_unit_code := nullif(p_payload ->> 'base_unit_code', '');
    v_tax_rate := coalesce(
      nullif(p_payload ->> 'tax_rate', '')::numeric,
      case when v_tax_category = 'standard' then 7 else 0 end
    );
    if v_currency_code !~ '^[A-Z]{3}$'
       or v_tax_category not in ('standard', 'zero', 'exempt', 'out_of_scope')
       or v_quantity_behavior not in ('discrete', 'weight', 'volume')
       or v_base_unit_code !~ '^[a-z][a-z0-9_]{0,31}$'
       or v_tax_rate < 0 or v_tax_rate > 100
       or (v_tax_category <> 'standard' and v_tax_rate <> 0) then
      raise exception 'variant_creation_profile_invalid' using errcode = '22023';
    end if;
    if nullif(p_payload ->> 'reorder_min', '') is not null
       and nullif(p_payload ->> 'reorder_max', '') is not null
       and (p_payload ->> 'reorder_max')::numeric < (p_payload ->> 'reorder_min')::numeric then
      raise exception 'variant_creation_reorder_range_invalid' using errcode = '23514';
    end if;

    insert into public.products (
      organization_id, name, description, category_id, brand_id,
      structure_type, internal_note, status, created_by, updated_by
    ) values (
      p_organization_id, btrim(p_payload ->> 'name'), nullif(p_payload ->> 'description', ''),
      (p_payload ->> 'category_id')::uuid, nullif(p_payload ->> 'brand_id', '')::uuid,
      'variant', nullif(p_payload ->> 'internal_note', ''),
      'draft', p_actor_user_id, p_actor_user_id
    ) returning * into v_product;

    insert into public.product_tag_assignments (
      organization_id, product_id, tag_id, created_by
    )
    select p_organization_id, v_product.id, value::uuid, p_actor_user_id
    from jsonb_array_elements_text(coalesce(p_payload -> 'tag_ids', '[]'::jsonb))
    on conflict do nothing;
    get diagnostics v_tag_count = row_count;

    for v_group_item, v_group_index in
      select value, ordinality
      from jsonb_array_elements(p_payload -> 'option_groups') with ordinality
    loop
      if nullif(btrim(v_group_item ->> 'name'), '') is null
         or jsonb_typeof(coalesce(v_group_item -> 'values', 'null'::jsonb)) <> 'array'
         or jsonb_array_length(v_group_item -> 'values') < 1
         or jsonb_array_length(v_group_item -> 'values') > 12
         or coalesce(v_group_item ->> 'kind', 'custom') not in ('color', 'size', 'custom') then
        raise exception 'variant_option_group_invalid' using errcode = '22023';
      end if;
      insert into public.product_option_groups (
        organization_id, product_id, name, option_kind, display_order,
        status, created_by, updated_by
      ) values (
        p_organization_id, v_product.id, btrim(v_group_item ->> 'name'),
        coalesce(v_group_item ->> 'kind', 'custom'), v_group_index,
        'active', p_actor_user_id, p_actor_user_id
      ) returning * into v_group;

      for v_value_item, v_value_index in
        select value, ordinality
        from jsonb_array_elements(v_group_item -> 'values') with ordinality
      loop
        if nullif(btrim(v_value_item ->> 'name'), '') is null
           or nullif(btrim(v_value_item ->> 'code'), '') is null then
          raise exception 'variant_option_value_invalid' using errcode = '22023';
        end if;
        insert into public.product_option_values (
          organization_id, option_group_id, name, code, color_hex,
          display_order, status, created_by, updated_by
        ) values (
          p_organization_id, v_group.id, btrim(v_value_item ->> 'name'),
          upper(btrim(v_value_item ->> 'code')), nullif(v_value_item ->> 'color_hex', ''),
          v_value_index, 'active', p_actor_user_id, p_actor_user_id
        ) returning * into v_value;

        if v_value_item ? 'aliases' then
          if jsonb_typeof(v_value_item -> 'aliases') <> 'array'
             or jsonb_array_length(v_value_item -> 'aliases') > 12 then
            raise exception 'variant_option_aliases_invalid' using errcode = '22023';
          end if;
          insert into public.product_option_value_aliases (
            organization_id, option_group_id, option_value_id, alias,
            status, created_by, updated_by
          )
          select p_organization_id, v_group.id, v_value.id, btrim(alias),
            'active', p_actor_user_id, p_actor_user_id
          from jsonb_array_elements_text(v_value_item -> 'aliases') a(alias)
          where nullif(btrim(alias), '') is not null;
        end if;
      end loop;
    end loop;

    for v_variant_item in
      select value from jsonb_array_elements(p_payload -> 'variants')
    loop
      if nullif(btrim(v_variant_item ->> 'name'), '') is null
         or nullif(btrim(v_variant_item ->> 'sku_code'), '') is null
         or jsonb_typeof(coalesce(v_variant_item -> 'option_codes', 'null'::jsonb)) <> 'array'
         or jsonb_array_length(v_variant_item -> 'option_codes') <> v_group_count
         or coalesce(v_variant_item ->> 'status', 'draft') not in ('draft', 'active') then
        raise exception 'variant_sku_payload_invalid' using errcode = '22023';
      end if;
      v_sale_price := coalesce(
        nullif(v_variant_item ->> 'sale_price', '')::numeric,
        nullif(p_payload ->> 'sale_price', '')::numeric
      );
      if v_sale_price is null or v_sale_price < 0 then
        raise exception 'variant_sale_price_invalid' using errcode = '22023';
      end if;
      insert into public.skus (
        organization_id, product_id, sku_code, name, barcode, sales_code,
        base_unit_code, status, created_by, updated_by
      ) values (
        p_organization_id, v_product.id, upper(btrim(v_variant_item ->> 'sku_code')),
        btrim(v_variant_item ->> 'name'), nullif(v_variant_item ->> 'barcode', ''),
        nullif(v_variant_item ->> 'sales_code', ''),
        coalesce(nullif(v_variant_item ->> 'base_unit_code', ''), v_base_unit_code),
        coalesce(v_variant_item ->> 'status', 'draft'), p_actor_user_id, p_actor_user_id
      ) returning * into v_sku;

      insert into public.sku_product_profiles (
        sku_id, organization_id, quantity_behavior, sale_price, currency_code,
        tax_category, tax_rate, product_weight_kg, product_length_cm,
        product_width_cm, product_height_cm, package_weight_kg, package_length_cm,
        package_width_cm, package_height_cm, safety_stock, reorder_min, reorder_max,
        created_by, updated_by
      ) values (
        v_sku.id, p_organization_id, v_quantity_behavior, v_sale_price, v_currency_code,
        v_tax_category, v_tax_rate,
        nullif(p_payload ->> 'product_weight_kg', '')::numeric,
        nullif(p_payload ->> 'product_length_cm', '')::numeric,
        nullif(p_payload ->> 'product_width_cm', '')::numeric,
        nullif(p_payload ->> 'product_height_cm', '')::numeric,
        nullif(p_payload ->> 'package_weight_kg', '')::numeric,
        nullif(p_payload ->> 'package_length_cm', '')::numeric,
        nullif(p_payload ->> 'package_width_cm', '')::numeric,
        nullif(p_payload ->> 'package_height_cm', '')::numeric,
        nullif(p_payload ->> 'safety_stock', '')::numeric,
        nullif(p_payload ->> 'reorder_min', '')::numeric,
        nullif(p_payload ->> 'reorder_max', '')::numeric,
        p_actor_user_id, p_actor_user_id
      );

      if nullif(v_variant_item ->> 'cost_price', '') is not null
         or nullif(p_payload ->> 'cost_price', '') is not null then
        insert into public.sku_cost_profiles (
          sku_id, organization_id, cost_price, currency_code, created_by, updated_by
        ) values (
          v_sku.id, p_organization_id,
          coalesce(
            nullif(v_variant_item ->> 'cost_price', '')::numeric,
            nullif(p_payload ->> 'cost_price', '')::numeric
          ),
          v_currency_code, p_actor_user_id, p_actor_user_id
        );
      end if;

      for v_unit_item in
        select value from jsonb_array_elements(coalesce(p_payload -> 'sell_units', '[]'::jsonb))
      loop
        insert into public.sku_sell_units (
          organization_id, sku_id, unit_code, name, base_quantity, barcode,
          created_by, updated_by
        ) values (
          p_organization_id, v_sku.id, v_unit_item ->> 'unit_code', v_unit_item ->> 'name',
          (v_unit_item ->> 'base_quantity')::numeric, nullif(v_unit_item ->> 'barcode', ''),
          p_actor_user_id, p_actor_user_id
        );
      end loop;

      insert into public.sku_option_assignments (
        organization_id, product_id, sku_id, option_group_id, option_value_id,
        status, created_by, updated_by
      )
      select p_organization_id, v_product.id, v_sku.id, g.id, ov.id,
        'active', p_actor_user_id, p_actor_user_id
      from jsonb_array_elements_text(v_variant_item -> 'option_codes') with ordinality c(code, position)
      join public.product_option_groups g
        on g.organization_id = p_organization_id
       and g.product_id = v_product.id
       and g.display_order = c.position
       and g.status = 'active'
      join public.product_option_values ov
        on ov.organization_id = p_organization_id
       and ov.option_group_id = g.id
       and ov.code = upper(btrim(c.code))
       and ov.status = 'active';
      get diagnostics v_assignment_count = row_count;
      if v_assignment_count <> v_group_count then
        raise exception 'variant_option_combination_invalid' using errcode = '22023';
      end if;

      v_result_variants := v_result_variants || jsonb_build_array(jsonb_build_object(
        'key', coalesce(v_variant_item ->> 'key', v_sku.sku_code),
        'sku_id', v_sku.id,
        'sku_code', v_sku.sku_code,
        'sku_status', v_sku.status,
        'sku_version', v_sku.version,
        'image_client_id', nullif(v_variant_item ->> 'image_client_id', '')
      ));
    end loop;

    v_result := jsonb_build_object(
      'entity_id', v_product.id,
      'entity_type', 'product',
      'product_id', v_product.id,
      'product_status', v_product.status,
      'product_version', v_product.version,
      'variant_count', v_variant_count,
      'option_group_count', v_group_count,
      'tag_count', v_tag_count,
      'variants', v_result_variants,
      'image_upload_required', true,
      'image_recovery_contract', 'product-core-committed-images-resumable',
      'inventory_posted', false
    );

    insert into public.foundation_domain_events (
      organization_id, branch_id, event_name, command_id,
      entity_type, entity_id, actor_user_id, metadata, occurred_at
    ) values (
      p_organization_id, null, 'product.created_with_variants', p_command_id,
      'product', v_product.id, p_actor_user_id,
      v_result - 'entity_id' - 'entity_type' - 'variants', v_occurred_at
    );
    perform private.append_organization_audit_log(
      p_organization_id, 'product', 'product.created_with_variants', p_actor_user_id,
      'product', v_product.id, v_product.name,
      'Created draft Product with structured Variant combinations',
      (v_result - 'entity_id' - 'entity_type') || jsonb_build_object(
        'variant_sku_ids', (
          select coalesce(jsonb_agg(value ->> 'sku_id'), '[]'::jsonb)
          from jsonb_array_elements(v_result_variants)
        )
      ),
      'foundation_command', p_command_id,
      'product.created_with_variants', v_occurred_at
    );
  end if;

  update public.foundation_commands
  set status = 'completed', result = v_result, completed_at = now()
  where organization_id = p_organization_id and id = p_command_id;

  perform set_config('avenzo.foundation_command_id', '', true);
  perform set_config('avenzo.foundation_organization_id', '', true);
  return v_result;
exception
  when no_data_found then
    raise exception 'entity_not_found' using errcode = 'P0002';
end;
$$;

revoke all on function public.server_execute_variant_creation_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.server_execute_variant_creation_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) to service_role;

comment on function public.server_execute_variant_creation_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) is 'B5 service-role-only idempotent Product Variant creation and recoverable ready-image assignment command. Core Product, option groups/values, SKUs, permanent identifiers and profiles are atomic.';
