-- Phase 2.1.R7.1: atomic Product + first SKU creation contract.
-- Images remain in the R6 Storage pipeline and inventory balances remain behind
-- inventory commands. This command deliberately creates draft entities only.

alter table public.foundation_commands
  drop constraint foundation_commands_type_check;

alter table public.foundation_commands
  add constraint foundation_commands_type_check check (command_type in (
    'product.create', 'product.create_with_initial_sku',
    'product.update', 'product.activate', 'product.archive',
    'sku.create', 'sku.update', 'sku.activate', 'sku.archive',
    'warehouse.create', 'warehouse.update', 'warehouse.inactivate', 'warehouse.archive',
    'location.create', 'location.update', 'location.inactivate', 'location.archive'
  ));

alter table public.foundation_domain_events
  drop constraint foundation_domain_events_name_check;

alter table public.foundation_domain_events
  add constraint foundation_domain_events_name_check check (event_name in (
    'product.created', 'product.created_with_initial_sku',
    'product.updated', 'product.activated', 'product.archived',
    'sku.created', 'sku.updated', 'sku.activated', 'sku.archived',
    'warehouse.created', 'warehouse.updated', 'warehouse.inactivated', 'warehouse.archived',
    'location.created', 'location.updated', 'location.inactivated', 'location.archived'
  ));

create or replace function public.server_execute_product_creation_command(
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
  v_item jsonb;
  v_structure_type text;
  v_quantity_behavior text;
  v_currency_code text;
  v_tax_category text;
  v_tax_rate numeric;
  v_tag_count integer := 0;
  v_sell_unit_count integer := 0;
  v_bundle_component_count integer := 0;
  v_result jsonb;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_command_id is null or p_organization_id is null or p_actor_user_id is null then
    raise exception 'product_creation_command_identity_required' using errcode = '22023';
  end if;
  if p_command_type <> 'product.create_with_initial_sku' then
    raise exception 'product_creation_command_type_invalid' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'product_creation_payload_invalid' using errcode = '22023';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'product_creation_request_hash_invalid' using errcode = '22023';
  end if;
  if nullif(btrim(p_payload ->> 'name'), '') is null
     or nullif(btrim(p_payload ->> 'sku_name'), '') is null
     or nullif(btrim(p_payload ->> 'sku_code'), '') is null
     or nullif(btrim(p_payload ->> 'base_unit_code'), '') is null
     or nullif(p_payload ->> 'category_id', '') is null then
    raise exception 'product_creation_required_field_missing' using errcode = '22023';
  end if;
  if p_payload ? 'tag_ids' and jsonb_typeof(p_payload -> 'tag_ids') <> 'array' then
    raise exception 'product_creation_tag_ids_invalid' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_payload -> 'tag_ids', '[]'::jsonb)) > 12 then
    raise exception 'product_creation_tag_limit_exceeded' using errcode = '22023';
  end if;
  if p_payload ? 'sell_units' and jsonb_typeof(p_payload -> 'sell_units') <> 'array' then
    raise exception 'product_creation_sell_units_invalid' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_payload -> 'sell_units', '[]'::jsonb)) > 50 then
    raise exception 'product_creation_sell_unit_limit_exceeded' using errcode = '22023';
  end if;
  if p_payload ? 'bundle_components'
     and jsonb_typeof(p_payload -> 'bundle_components') <> 'array' then
    raise exception 'product_creation_bundle_components_invalid' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_payload -> 'bundle_components', '[]'::jsonb)) > 100 then
    raise exception 'product_creation_bundle_component_limit_exceeded' using errcode = '22023';
  end if;

  v_structure_type := coalesce(nullif(p_payload ->> 'structure_type', ''), 'standard');
  v_quantity_behavior := coalesce(nullif(p_payload ->> 'quantity_behavior', ''), 'discrete');
  v_currency_code := coalesce(nullif(p_payload ->> 'currency_code', ''), 'THB');
  v_tax_category := coalesce(nullif(p_payload ->> 'tax_category', ''), 'standard');
  v_tax_rate := coalesce(
    nullif(p_payload ->> 'tax_rate', '')::numeric,
    case when v_tax_category = 'standard' then 7 else 0 end
  );

  if v_structure_type not in ('standard', 'variant', 'bundle')
     or v_quantity_behavior not in ('discrete', 'weight', 'volume')
     or v_currency_code !~ '^[A-Z]{3}$'
     or v_tax_category not in ('standard', 'zero', 'exempt', 'out_of_scope')
     or v_tax_rate < 0 or v_tax_rate > 100
     or (v_tax_category <> 'standard' and v_tax_rate <> 0) then
    raise exception 'product_creation_profile_invalid' using errcode = '22023';
  end if;
  if v_structure_type <> 'bundle'
     and jsonb_array_length(coalesce(p_payload -> 'bundle_components', '[]'::jsonb)) > 0 then
    raise exception 'product_creation_bundle_structure_required' using errcode = '23514';
  end if;
  if nullif(p_payload ->> 'reorder_min', '') is not null
     and nullif(p_payload ->> 'reorder_max', '') is not null
     and (p_payload ->> 'reorder_max')::numeric < (p_payload ->> 'reorder_min')::numeric then
    raise exception 'product_creation_reorder_range_invalid' using errcode = '23514';
  end if;

  if not private.server_actor_has_org_permission(
    p_actor_user_id, p_organization_id, 'product.manage', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
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

  insert into public.products (
    organization_id, name, description, category_id, brand_id,
    structure_type, internal_note, status, created_by, updated_by
  ) values (
    p_organization_id, p_payload ->> 'name', nullif(p_payload ->> 'description', ''),
    (p_payload ->> 'category_id')::uuid,
    nullif(p_payload ->> 'brand_id', '')::uuid,
    v_structure_type, nullif(p_payload ->> 'internal_note', ''),
    'draft', p_actor_user_id, p_actor_user_id
  ) returning * into v_product;

  insert into public.skus (
    organization_id, product_id, sku_code, name, barcode, sales_code,
    base_unit_code, status, created_by, updated_by
  ) values (
    p_organization_id, v_product.id, p_payload ->> 'sku_code', p_payload ->> 'sku_name',
    nullif(p_payload ->> 'barcode', ''), nullif(p_payload ->> 'sales_code', ''),
    p_payload ->> 'base_unit_code', 'draft', p_actor_user_id, p_actor_user_id
  ) returning * into v_sku;

  insert into public.product_tag_assignments (
    organization_id, product_id, tag_id, created_by
  )
  select p_organization_id, v_product.id, value::uuid, p_actor_user_id
  from jsonb_array_elements_text(coalesce(p_payload -> 'tag_ids', '[]'::jsonb))
  on conflict do nothing;
  get diagnostics v_tag_count = row_count;

  insert into public.sku_product_profiles (
    sku_id, organization_id, quantity_behavior, sale_price, currency_code,
    tax_category, tax_rate, product_weight_kg, product_length_cm,
    product_width_cm, product_height_cm, package_weight_kg, package_length_cm,
    package_width_cm, package_height_cm, safety_stock, reorder_min, reorder_max,
    created_by, updated_by
  ) values (
    v_sku.id, p_organization_id, v_quantity_behavior,
    nullif(p_payload ->> 'sale_price', '')::numeric, v_currency_code,
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

  if p_payload ? 'cost_price' then
    insert into public.sku_cost_profiles (
      sku_id, organization_id, cost_price, currency_code, created_by, updated_by
    ) values (
      v_sku.id, p_organization_id, nullif(p_payload ->> 'cost_price', '')::numeric,
      v_currency_code, p_actor_user_id, p_actor_user_id
    );
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_payload -> 'sell_units', '[]'::jsonb))
  loop
    insert into public.sku_sell_units (
      organization_id, sku_id, unit_code, name, base_quantity, barcode,
      created_by, updated_by
    ) values (
      p_organization_id, v_sku.id, v_item ->> 'unit_code', v_item ->> 'name',
      (v_item ->> 'base_quantity')::numeric, nullif(v_item ->> 'barcode', ''),
      p_actor_user_id, p_actor_user_id
    );
    v_sell_unit_count := v_sell_unit_count + 1;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_payload -> 'bundle_components', '[]'::jsonb))
  loop
    insert into public.sku_bundle_components (
      organization_id, bundle_sku_id, component_sku_id, component_quantity, created_by
    ) values (
      p_organization_id, v_sku.id, (v_item ->> 'sku_id')::uuid,
      (v_item ->> 'quantity')::numeric, p_actor_user_id
    );
    v_bundle_component_count := v_bundle_component_count + 1;
  end loop;

  v_result := jsonb_build_object(
    'entity_id', v_product.id,
    'entity_type', 'product',
    'product_id', v_product.id,
    'product_status', v_product.status,
    'product_version', v_product.version,
    'sku_id', v_sku.id,
    'sku_status', v_sku.status,
    'sku_version', v_sku.version,
    'tag_count', v_tag_count,
    'sell_unit_count', v_sell_unit_count,
    'bundle_component_count', v_bundle_component_count,
    'image_upload_required', true,
    'inventory_posted', false
  );

  insert into public.foundation_domain_events (
    organization_id, branch_id, event_name, command_id,
    entity_type, entity_id, actor_user_id, metadata, occurred_at
  ) values (
    p_organization_id, null, 'product.created_with_initial_sku', p_command_id,
    'product', v_product.id, p_actor_user_id,
    v_result - 'entity_id' - 'entity_type', v_occurred_at
  );

  perform private.append_organization_audit_log(
    p_organization_id, 'product', 'product.created_with_initial_sku', p_actor_user_id,
    'product', v_product.id, v_product.name,
    'Created draft product with initial draft SKU',
    v_result - 'entity_id' - 'entity_type',
    'foundation_command', p_command_id,
    'product.created_with_initial_sku', v_occurred_at
  );

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

revoke all on function public.server_execute_product_creation_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.server_execute_product_creation_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) to service_role;

comment on function public.server_execute_product_creation_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) is 'Service-role-only idempotent transaction for a draft Product, its first draft SKU, product metadata, SKU profile/cost, sell units and bundle components. Images and inventory remain separate governed workflows.';
