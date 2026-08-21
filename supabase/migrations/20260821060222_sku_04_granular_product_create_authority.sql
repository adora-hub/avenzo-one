-- T5.3 / SKU-04 corrective cutover.
-- Keep the approved SKU-04 schema and service-only surface unchanged while
-- replacing the legacy product.manage compatibility precheck with exact
-- granular authorities from T4.3B. This migration is forward-only and creates
-- no tables, policies, triggers, permission aliases, or browser grants.

do $preflight$
begin
  if to_regclass('public.sku_product_sequences') is null
     or to_regprocedure(
       'public.server_preview_variant_sku_sequence(uuid,text,uuid,smallint)'
     ) is null
     or to_regprocedure(
       'public.server_execute_variant_sku_sequence_command(uuid,uuid,text,jsonb,text,uuid,timestamp with time zone)'
     ) is null
     or to_regprocedure(
       'private.server_actor_has_org_permission(uuid,uuid,text,uuid)'
     ) is null then
    raise exception 'sku_04_granular_authority_baseline_missing';
  end if;

  if not exists (
    select 1
    from public.permissions p
    where p.code = 'product.create'
      and p.scope_kind = 'organization'
  ) or not exists (
    select 1
    from public.permissions p
    where p.code = 'product.update'
      and p.scope_kind = 'organization'
  ) then
    raise exception 'sku_04_granular_authority_catalog_mismatch';
  end if;
end
$preflight$;

create or replace function public.server_preview_variant_sku_sequence(
  p_organization_id uuid,
  p_prefix text,
  p_actor_user_id uuid,
  p_digit_count smallint default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prefix text := upper(btrim(p_prefix));
  v_tracked bigint := 0;
  v_existing bigint := 0;
  v_next bigint;
begin
  if p_organization_id is null or p_actor_user_id is null
     or v_prefix !~ '^[A-Z0-9]{2,12}$'
     or p_digit_count not between 3 and 8 then
    raise exception 'variant_sku_sequence_preview_input_invalid' using errcode = '22023';
  end if;
  if not private.server_actor_has_org_permission(
    p_actor_user_id, p_organization_id, 'product.create', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select coalesce(max(q.last_sequence), 0) into v_tracked
  from public.sku_product_sequences q
  where q.organization_id = p_organization_id and q.prefix = v_prefix;

  select coalesce(max((substring(
    s.sku_code from ('^' || v_prefix || '-([0-9]+)(-|$)')
  ))::bigint), 0) into v_existing
  from public.skus s
  where s.organization_id = p_organization_id
    and s.sku_code ~ ('^' || v_prefix || '-[0-9]+(-|$)');

  v_next := greatest(v_tracked, v_existing) + 1;
  if v_next > 99999999 then
    raise exception 'variant_sku_sequence_exhausted' using errcode = '22003';
  end if;

  return jsonb_build_object(
    'prefix', v_prefix,
    'next_sequence', v_next,
    'formatted_sequence', lpad(v_next::text, p_digit_count, '0'),
    'digit_count', p_digit_count,
    'preview_only', true,
    'reserved', false
  );
end;
$$;

create or replace function public.server_execute_variant_sku_sequence_command(
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
  v_prefix text;
  v_requested bigint;
  v_digit_count smallint;
  v_tracked public.sku_product_sequences%rowtype;
  v_existing bigint := 0;
  v_next bigint;
  v_base text;
  v_result jsonb;
begin
  if p_command_type = 'product.variant_images.assign' then
    if p_command_id is null or p_organization_id is null
       or p_actor_user_id is null then
      raise exception 'variant_sku_sequence_payload_invalid' using errcode = '22023';
    end if;
    if not private.server_actor_has_org_permission(
      p_actor_user_id, p_organization_id, 'product.update', null
    ) then
      raise exception 'permission_denied' using errcode = '42501';
    end if;
    return public.server_execute_variant_creation_command(
      p_command_id, p_organization_id, p_command_type, p_payload,
      p_request_hash, p_actor_user_id, p_occurred_at
    );
  end if;
  if p_command_type <> 'product.create_with_variants' then
    raise exception 'variant_sku_sequence_command_type_invalid' using errcode = '22023';
  end if;

  v_prefix := upper(btrim(p_payload ->> 'sku_prefix'));
  v_requested := nullif(p_payload ->> 'sku_product_sequence', '')::bigint;
  v_digit_count := coalesce(nullif(p_payload ->> 'sku_sequence_digits', '')::smallint, 3);
  if p_command_id is null or p_organization_id is null or p_actor_user_id is null
     or v_prefix !~ '^[A-Z0-9]{2,12}$'
     or v_requested not between 1 and 99999999
     or v_digit_count not between 3 and 8
     or jsonb_typeof(coalesce(p_payload -> 'variants', 'null'::jsonb)) <> 'array' then
    raise exception 'variant_sku_sequence_payload_invalid' using errcode = '22023';
  end if;
  if not private.server_actor_has_org_permission(
    p_actor_user_id, p_organization_id, 'product.create', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  -- Authorize before replay lookup so a later Individual Deny also blocks
  -- replay and cannot be bypassed through an existing command result.
  if exists (
    select 1 from public.foundation_commands c where c.id = p_command_id
  ) then
    return public.server_execute_variant_creation_command(
      p_command_id, p_organization_id, p_command_type, p_payload,
      p_request_hash, p_actor_user_id, p_occurred_at
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'sku-product-sequence:' || p_organization_id::text || ':' || v_prefix, 0
  ));

  insert into public.sku_product_sequences (
    organization_id, prefix, last_sequence, digit_count,
    created_by, updated_by
  ) values (
    p_organization_id, v_prefix, 0, v_digit_count,
    p_actor_user_id, p_actor_user_id
  ) on conflict (organization_id, prefix) do nothing;

  select q.* into strict v_tracked
  from public.sku_product_sequences q
  where q.organization_id = p_organization_id and q.prefix = v_prefix
  for update;

  select coalesce(max((substring(
    s.sku_code from ('^' || v_prefix || '-([0-9]+)(-|$)')
  ))::bigint), 0) into v_existing
  from public.skus s
  where s.organization_id = p_organization_id
    and s.sku_code ~ ('^' || v_prefix || '-[0-9]+(-|$)');

  v_next := greatest(v_tracked.last_sequence, v_existing) + 1;
  if v_requested < v_next then
    raise exception 'sku_product_sequence_conflict'
      using errcode = '23505',
      detail = jsonb_build_object(
        'prefix', v_prefix,
        'requested_sequence', v_requested,
        'suggested_sequence', v_next,
        'digit_count', v_digit_count
      )::text;
  end if;

  v_base := v_prefix || '-' || lpad(v_requested::text, v_digit_count, '0');
  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'variants') item
    where nullif(btrim(item ->> 'sku_code'), '') is null
       or upper(btrim(item ->> 'sku_code')) not like v_base || '-%'
  ) then
    raise exception 'variant_sku_sequence_format_mismatch' using errcode = '22023';
  end if;

  v_result := public.server_execute_variant_creation_command(
    p_command_id, p_organization_id, p_command_type, p_payload,
    p_request_hash, p_actor_user_id, p_occurred_at
  );

  update public.sku_product_sequences
  set last_sequence = v_requested,
      digit_count = v_digit_count,
      version = version + 1,
      updated_by = p_actor_user_id,
      updated_at = now()
  where organization_id = p_organization_id and prefix = v_prefix;

  return v_result;
end;
$$;

revoke all on function public.server_preview_variant_sku_sequence(
  uuid, text, uuid, smallint
) from public, anon, authenticated, service_role;
revoke all on function public.server_execute_variant_sku_sequence_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.server_preview_variant_sku_sequence(
  uuid, text, uuid, smallint
) to service_role;
grant execute on function public.server_execute_variant_sku_sequence_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) to service_role;

comment on function public.server_preview_variant_sku_sequence(
  uuid, text, uuid, smallint
) is 'SKU-04 advisory Product Sequence preview. Trusted server only; exact product.create authority and T4.3B effective Deny apply.';
comment on function public.server_execute_variant_sku_sequence_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) is 'SKU-04 service-only atomic Variant boundary. product.create is required for creation/replay and product.update for image assignment; Individual Deny remains authoritative.';
