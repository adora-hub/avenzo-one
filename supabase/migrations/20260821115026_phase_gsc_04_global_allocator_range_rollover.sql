-- GSC-04: extend the existing A4 authority with Global V1 range discovery,
-- three-hour reservation, Prefix rollover and deterministic idempotency.

begin;

-- GSC-01 approved the granular create authority. This compatibility seed is
-- idempotent with T4.3B and removes GSC runtime dependence on product.manage.
insert into public.permissions (code, resource, action, description)
values ('product.create', 'product', 'create', 'Create Product and SKU master data through trusted server commands')
on conflict (code) do update set
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_code)
select r.id, 'product.create'
from public.organization_roles r
where r.code in ('owner', 'admin')
on conflict (role_id, permission_code) do nothing;

create or replace function private.seed_foundation_domain_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.code in ('owner', 'admin') then
    insert into public.role_permissions (role_id, permission_code)
    select new.id, p.code
    from public.permissions p
    where p.code in (
      'product.read', 'product.manage', 'product.create',
      'warehouse.read', 'warehouse.manage',
      'inventory.read', 'inventory.receive', 'inventory.adjust', 'inventory.transfer'
    )
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.seed_foundation_domain_role_permissions()
  from public, anon, authenticated, service_role;

-- Legacy and Global V1 definitions may share a Prefix while historical rows
-- remain readable. Allocation always selects standard_version = global_v1.
alter table public.sales_code_sequences
  drop constraint sales_code_sequences_scope_unique;

alter table public.sales_code_sequences
  add constraint sales_code_sequences_version_scope_unique
  unique (organization_id, purpose, prefix, standard_version);

-- A never-assigned reservation may return to the pool after release/expiry.
-- Assigned and currently reserved codes remain exclusive across sequences.
alter table public.sales_code_reservations
  drop constraint sales_code_reservations_sequence_number_unique;

create unique index sales_code_reservations_live_sequence_number_unique
  on public.sales_code_reservations (organization_id, sequence_id, sequence_number)
  where status in ('reserved', 'assigned');

create unique index sales_code_reservations_live_code_unique
  on public.sales_code_reservations (organization_id, code)
  where status in ('reserved', 'assigned');

alter table public.sales_code_allocator_commands
  drop constraint sales_code_allocator_commands_type_check;

alter table public.sales_code_allocator_commands
  add constraint sales_code_allocator_commands_type_check check (command_type in (
    'sequence.create', 'permanent.allocate', 'batch.reserve',
    'reservation.assign', 'batch.release', 'global_v1.range.reserve'
  ));

create or replace function private.next_global_sales_code_prefix(p_prefix text)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_prefix text := upper(btrim(p_prefix));
  v_chars text[];
  v_index integer;
  v_char text;
begin
  if v_prefix !~ '^[A-Z]{1,3}$' then
    raise exception 'global_sales_code_prefix_invalid' using errcode = '22023';
  end if;

  v_chars := string_to_array(v_prefix, null);
  v_index := array_length(v_chars, 1);
  while v_index >= 1 loop
    v_char := v_chars[v_index];
    if v_char <> 'Z' then
      v_chars[v_index] := chr(ascii(v_char) + 1);
      return array_to_string(v_chars, '');
    end if;
    v_chars[v_index] := 'A';
    v_index := v_index - 1;
  end loop;

  if array_length(v_chars, 1) = 3 then return null; end if;
  return 'A' || array_to_string(v_chars, '');
end;
$$;

create or replace function private.find_global_sales_code_range(
  p_organization_id uuid,
  p_requested_prefix text,
  p_quantity integer
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_requested_prefix text := upper(btrim(p_requested_prefix));
  v_prefix text;
  v_high_water integer;
  v_candidate integer;
  v_end_number integer;
  v_result jsonb;
begin
  if p_organization_id is null
     or v_requested_prefix !~ '^[A-Z]{1,3}$'
     or p_quantity not between 1 and 50 then
    raise exception 'global_sales_code_range_input_invalid' using errcode = '22023';
  end if;

  v_prefix := v_requested_prefix;
  loop
    -- Cross-field identifier authority defines the Organization high-water
    -- mark. An assigned reservation is included as defense in depth.
    select greatest(
      coalesce((
        select max(right(r.normalized_identifier, 3)::integer)
        from public.sku_identifier_registry r
        where r.organization_id = p_organization_id
          and r.normalized_identifier >= v_prefix || '001'
          and r.normalized_identifier <= v_prefix || '999'
          and private.is_global_sales_code_v1(r.normalized_identifier)
      ), 0),
      coalesce((
        select max(r.sequence_number)::integer
        from public.sales_code_reservations r
        where r.organization_id = p_organization_id
          and r.status = 'assigned'
          and r.code >= v_prefix || '001'
          and r.code <= v_prefix || '999'
          and private.is_global_sales_code_v1(r.code)
      ), 0)
    ) into v_high_water;

    v_candidate := greatest(1, v_high_water + 1);
    while v_candidate + p_quantity - 1 <= 999 loop
      v_end_number := v_candidate + p_quantity - 1;
      if not exists (
        select 1
        from generate_series(v_candidate, v_end_number) n
        join public.sku_identifier_registry r
          on r.organization_id = p_organization_id
         and r.normalized_identifier = private.format_sales_code(v_prefix, n::bigint, 3::smallint)
      ) and not exists (
        select 1
        from generate_series(v_candidate, v_end_number) n
        join public.sales_code_reservations r
          on r.organization_id = p_organization_id
         and r.code = private.format_sales_code(v_prefix, n::bigint, 3::smallint)
         and (
           r.status = 'assigned'
           or (r.status = 'reserved' and r.expires_at > now())
         )
      ) then
        v_result := jsonb_build_object(
          'requested_prefix', v_requested_prefix,
          'prefix', v_prefix,
          'start_number', v_candidate,
          'end_number', v_end_number,
          'first_code', private.format_sales_code(v_prefix, v_candidate::bigint, 3::smallint),
          'last_code', private.format_sales_code(v_prefix, v_end_number::bigint, 3::smallint),
          'quantity', p_quantity,
          'moved_to_next_prefix', v_prefix <> v_requested_prefix
        );
        return v_result;
      end if;
      v_candidate := v_candidate + 1;
    end loop;

    v_prefix := private.next_global_sales_code_prefix(v_prefix);
    if v_prefix is null then
      raise exception 'global_sales_code_prefix_exhausted' using errcode = '22003';
    end if;
  end loop;
end;
$$;

create or replace function private.expire_global_sales_code_reservations(
  p_organization_id uuid
)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.sales_code_reservations r
    set status = 'expired', released_at = now()
    where r.organization_id = p_organization_id
      and r.purpose = 'permanent_sales'
      and r.status = 'reserved'
      and r.expires_at <= now()
      and exists (
        select 1 from public.sales_code_sequences s
        where s.organization_id = r.organization_id
          and s.id = r.sequence_id
          and s.standard_version = 'global_v1'
      )
    returning r.batch_id
  )
  select count(*) into v_count from expired;

  update public.sales_code_reservation_batches b
  set status = 'expired'
  where b.organization_id = p_organization_id
    and b.purpose = 'permanent_sales'
    and b.status = 'active'
    and b.expires_at <= now()
    and not exists (
      select 1 from public.sales_code_reservations r
      where r.organization_id = b.organization_id
        and r.batch_id = b.id and r.status = 'reserved'
    );
  return v_count;
end;
$$;

create or replace function public.server_preview_global_sales_code_range(
  p_organization_id uuid,
  p_requested_prefix text,
  p_quantity integer,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_range jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'sales_code_preview_identity_required' using errcode = '22023';
  end if;
  if not private.server_actor_has_org_permission(
    p_actor_user_id, p_organization_id, 'product.create', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  v_range := private.find_global_sales_code_range(
    p_organization_id, p_requested_prefix, p_quantity
  );
  return v_range || jsonb_build_object(
    'state', 'preview', 'authoritative', true, 'reserved', false
  );
end;
$$;

create or replace function public.server_reserve_global_sales_code_range(
  p_command_id uuid,
  p_organization_id uuid,
  p_requested_prefix text,
  p_quantity integer,
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
  v_prefix text := upper(btrim(p_requested_prefix));
  v_payload jsonb;
  v_expected_hash text;
  v_command public.sales_code_allocator_commands%rowtype;
  v_sequence public.sales_code_sequences%rowtype;
  v_batch public.sales_code_reservation_batches%rowtype;
  v_range jsonb;
  v_result jsonb;
  v_expired_count integer;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_command_id is null or p_organization_id is null or p_actor_user_id is null
     or v_prefix !~ '^[A-Z]{1,3}$' or p_quantity not between 1 and 50 then
    raise exception 'global_sales_code_reserve_input_invalid' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'prefix', v_prefix, 'quantity', p_quantity, 'ttl_hours', 3
  );
  v_expected_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');
  if p_request_hash is null or p_request_hash <> v_expected_hash then
    raise exception 'sales_code_request_hash_invalid' using errcode = '22023';
  end if;

  insert into public.sales_code_allocator_commands (
    id, organization_id, command_type, payload, request_hash, actor_user_id
  ) values (
    p_command_id, p_organization_id, 'global_v1.range.reserve',
    v_payload, p_request_hash, p_actor_user_id
  ) on conflict (id) do nothing;

  select c.* into strict v_command
  from public.sales_code_allocator_commands c
  where c.id = p_command_id
  for update;

  if v_command.organization_id <> p_organization_id
     or v_command.command_type <> 'global_v1.range.reserve'
     or v_command.payload <> v_payload
     or v_command.request_hash <> p_request_hash
     or v_command.actor_user_id <> p_actor_user_id then
    raise exception 'command_payload_conflict' using errcode = '23505';
  end if;
  if v_command.status = 'completed' then return v_command.result; end if;

  if not private.server_actor_has_org_permission(
    p_actor_user_id, p_organization_id, 'product.create', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  -- One Organization/purpose lock gives every GSC-04 caller the same lock
  -- order. The command row lock above preserves stable idempotent replay.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'gsc04:' || p_organization_id::text || ':permanent_sales', 0
  ));

  v_expired_count := private.expire_global_sales_code_reservations(
    p_organization_id
  );
  v_range := private.find_global_sales_code_range(
    p_organization_id, v_prefix, p_quantity
  );

  select s.* into v_sequence
  from public.sales_code_sequences s
  where s.organization_id = p_organization_id
    and s.purpose = 'permanent_sales'
    and s.prefix = v_range ->> 'prefix'
    and s.standard_version = 'global_v1'
  for update;

  if not found then
    insert into public.sales_code_sequences (
      organization_id, name, purpose, prefix, start_number, next_number,
      digit_count, status, standard_version, created_by, updated_by
    ) values (
      p_organization_id, 'Global V1 ' || (v_range ->> 'prefix'),
      'permanent_sales', v_range ->> 'prefix', 1, 1, 3, 'active',
      'global_v1', p_actor_user_id, p_actor_user_id
    ) returning * into v_sequence;
  end if;

  insert into public.sales_code_reservation_batches (
    organization_id, sequence_id, purpose, start_number, end_number,
    quantity, expires_at, created_by
  ) values (
    p_organization_id, v_sequence.id, 'permanent_sales',
    (v_range ->> 'start_number')::bigint,
    (v_range ->> 'end_number')::bigint,
    p_quantity, now() + interval '3 hours', p_actor_user_id
  ) returning * into v_batch;

  insert into public.sales_code_reservations (
    organization_id, sequence_id, batch_id, purpose, sequence_number,
    code, status, expires_at, created_by
  )
  select p_organization_id, v_sequence.id, v_batch.id, 'permanent_sales',
    n, private.format_sales_code(v_sequence.prefix, n::bigint, 3::smallint),
    'reserved', v_batch.expires_at, p_actor_user_id
  from generate_series(v_batch.start_number, v_batch.end_number) n;

  update public.sales_code_sequences
  set next_number = greatest(next_number, v_batch.end_number + 1),
      version = version + 1,
      updated_by = p_actor_user_id,
      updated_at = now()
  where organization_id = p_organization_id and id = v_sequence.id;

  v_result := v_range || jsonb_build_object(
    'state', 'reserved',
    'authoritative', true,
    'reserved', true,
    'batch_id', v_batch.id,
    'sequence_id', v_sequence.id,
    'expires_at', v_batch.expires_at,
    'expired_reservations', v_expired_count
  );

  insert into public.sales_code_allocator_events (
    organization_id, command_id, event_name, entity_type, entity_id,
    actor_user_id, metadata, occurred_at
  ) values (
    p_organization_id, p_command_id, 'sales_code.batch.reserved',
    'batch', v_batch.id, p_actor_user_id, v_result, v_occurred_at
  );

  perform private.append_organization_audit_log(
    p_organization_id, 'product', 'sales_code.batch.reserved', p_actor_user_id,
    'batch', v_batch.id,
    (v_result ->> 'first_code') || '–' || (v_result ->> 'last_code'),
    'global v1 sales code range reserved', v_result,
    'sales_code_allocator_command', p_command_id,
    'sales_code.batch.reserved', v_occurred_at
  );

  update public.sales_code_allocator_commands
  set status = 'completed', result = v_result, completed_at = now()
  where organization_id = p_organization_id and id = p_command_id;
  return v_result;
exception when no_data_found then
  raise exception 'entity_not_found' using errcode = 'P0002';
end;
$$;

revoke all on function private.next_global_sales_code_prefix(text)
  from public, anon, authenticated, service_role;
revoke all on function private.find_global_sales_code_range(uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.expire_global_sales_code_reservations(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.server_preview_global_sales_code_range(
  uuid, text, integer, uuid
) from public, anon, authenticated;
grant execute on function public.server_preview_global_sales_code_range(
  uuid, text, integer, uuid
) to service_role;

revoke all on function public.server_reserve_global_sales_code_range(
  uuid, uuid, text, integer, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.server_reserve_global_sales_code_range(
  uuid, uuid, text, integer, text, uuid, timestamptz
) to service_role;

comment on function public.server_preview_global_sales_code_range(
  uuid, text, integer, uuid
) is 'GSC-04 server-only authoritative availability preview; it never reserves or assigns a code.';
comment on function public.server_reserve_global_sales_code_range(
  uuid, uuid, text, integer, text, uuid, timestamptz
) is 'GSC-04 idempotent server-only reservation of one contiguous Global V1 range (1-50) with three-hour expiry and Prefix rollover.';

commit;
