-- SKU-04: organization-scoped Product Sequence allocation for Variant SKU codes.
-- Existing SKU/identifier uniqueness and atomic Product Variant creation remain
-- authoritative. This migration adds only the missing Prefix + Product Sequence
-- coordination boundary.

create table public.sku_product_sequences (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  prefix text not null,
  last_sequence bigint not null default 0,
  digit_count smallint not null default 3,
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, prefix),
  constraint sku_product_sequences_prefix_check check (
    prefix = upper(btrim(prefix)) and prefix ~ '^[A-Z0-9]{2,12}$'
  ),
  constraint sku_product_sequences_number_check check (
    last_sequence between 0 and 99999999
  ),
  constraint sku_product_sequences_digits_check check (digit_count between 3 and 8),
  constraint sku_product_sequences_version_check check (version >= 1)
);

create index sku_product_sequences_updated_idx
  on public.sku_product_sequences (organization_id, updated_at desc, prefix);

alter table public.sku_product_sequences enable row level security;
revoke all privileges on table public.sku_product_sequences
  from public, anon, authenticated, service_role;

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
    p_actor_user_id, p_organization_id, 'product.manage', null
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
    return public.server_execute_variant_creation_command(
      p_command_id, p_organization_id, p_command_type, p_payload,
      p_request_hash, p_actor_user_id, p_occurred_at
    );
  end if;
  if p_command_type <> 'product.create_with_variants' then
    raise exception 'variant_sku_sequence_command_type_invalid' using errcode = '22023';
  end if;

  -- Idempotent replay must return the original result even after the sequence
  -- has advanced for later Products. The existing command validates payload/hash.
  if exists (
    select 1 from public.foundation_commands c where c.id = p_command_id
  ) then
    return public.server_execute_variant_creation_command(
      p_command_id, p_organization_id, p_command_type, p_payload,
      p_request_hash, p_actor_user_id, p_occurred_at
    );
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
    p_actor_user_id, p_organization_id, 'product.manage', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
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

comment on table public.sku_product_sequences is
  'SKU-04 organization-scoped high-water mark per Product Prefix. Gaps are never reused automatically.';
comment on function public.server_preview_variant_sku_sequence(
  uuid, text, uuid, smallint
) is 'SKU-04 advisory next Product Sequence preview. It does not reserve a number.';
comment on function public.server_execute_variant_sku_sequence_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) is 'SKU-04 service-role-only atomic Variant creation wrapper. It serializes Prefix allocation and reserves Product Sequence only when the existing Product+SKU transaction succeeds.';
