-- Phase 2.1 A4: permanent identifier registry and atomic Sales Code allocator.
-- Additive, tenant-scoped, service-role command boundary only.

create table public.sku_identifier_registry (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  normalized_identifier text not null,
  sku_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, normalized_identifier),
  constraint sku_identifier_registry_sku_fk foreign key (organization_id, sku_id)
    references public.skus (organization_id, id) on delete restrict,
  constraint sku_identifier_registry_key_check check (
    normalized_identifier = upper(btrim(normalized_identifier))
    and char_length(normalized_identifier) between 1 and 128
    and normalized_identifier !~ '[[:cntrl:]]'
  )
);

create index sku_identifier_registry_sku_idx
  on public.sku_identifier_registry (organization_id, sku_id, normalized_identifier);

create table public.sku_identifier_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sku_id uuid not null,
  identifier_kind text not null,
  raw_value text not null,
  normalized_identifier text not null,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete restrict,
  released_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  constraint sku_identifier_bindings_sku_fk foreign key (organization_id, sku_id)
    references public.skus (organization_id, id) on delete restrict,
  constraint sku_identifier_bindings_kind_check check (
    identifier_kind in ('sku_code', 'sales_code', 'barcode')
  ),
  constraint sku_identifier_bindings_raw_check check (
    raw_value = btrim(raw_value) and char_length(raw_value) between 1 and 128
    and raw_value !~ '[[:cntrl:]]'
  ),
  constraint sku_identifier_bindings_key_check check (
    normalized_identifier = upper(btrim(normalized_identifier))
    and char_length(normalized_identifier) between 1 and 128
  ),
  constraint sku_identifier_bindings_status_check check (status in ('active', 'released')),
  constraint sku_identifier_bindings_release_check check (
    (status = 'active' and released_by is null and released_at is null)
    or (status = 'released' and released_at is not null)
  )
);

create unique index sku_identifier_bindings_active_kind_unique
  on public.sku_identifier_bindings (organization_id, sku_id, identifier_kind)
  where status = 'active';
create index sku_identifier_bindings_lookup_idx
  on public.sku_identifier_bindings (
    organization_id, normalized_identifier, status, identifier_kind, sku_id
  );
create index sku_identifier_bindings_sku_history_idx
  on public.sku_identifier_bindings (
    organization_id, sku_id, identifier_kind, created_at desc, id desc
  );

do $$
begin
  if exists (
    with identifiers as (
      select organization_id, id as sku_id, upper(btrim(sku_code)) as lookup_key
      from public.skus
      union all
      select organization_id, id, upper(btrim(sales_code))
      from public.skus where sales_code is not null
      union all
      select organization_id, id, upper(btrim(barcode))
      from public.skus where barcode is not null
    )
    select 1 from identifiers
    group by organization_id, lookup_key
    having count(distinct sku_id) > 1
  ) then
    raise exception 'identifier_cross_field_collision_existing_data'
      using errcode = '23505';
  end if;
end;
$$;

insert into public.sku_identifier_registry (
  organization_id, normalized_identifier, sku_id
)
select organization_id, lookup_key, min(sku_id::text)::uuid
from (
  select organization_id, id as sku_id, upper(btrim(sku_code)) as lookup_key
  from public.skus
  union all
  select organization_id, id, upper(btrim(sales_code))
  from public.skus where sales_code is not null
  union all
  select organization_id, id, upper(btrim(barcode))
  from public.skus where barcode is not null
) identifiers
group by organization_id, lookup_key;

insert into public.sku_identifier_bindings (
  organization_id, sku_id, identifier_kind, raw_value,
  normalized_identifier, created_by, created_at
)
select organization_id, id, 'sku_code', sku_code, upper(btrim(sku_code)), created_by, created_at
from public.skus
union all
select organization_id, id, 'sales_code', sales_code, upper(btrim(sales_code)), created_by, created_at
from public.skus where sales_code is not null
union all
select organization_id, id, 'barcode', barcode, upper(btrim(barcode)), created_by, created_at
from public.skus where barcode is not null;

create or replace function private.bind_sku_identifier(
  p_organization_id uuid,
  p_sku_id uuid,
  p_identifier_kind text,
  p_raw_value text,
  p_actor_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text := upper(btrim(p_raw_value));
  v_registry_sku_id uuid;
begin
  if p_raw_value is null then return; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'sku-identifier:' || p_organization_id::text || ':' || v_key, 0
  ));

  insert into public.sku_identifier_registry (
    organization_id, normalized_identifier, sku_id
  ) values (p_organization_id, v_key, p_sku_id)
  on conflict (organization_id, normalized_identifier) do nothing;

  select r.sku_id into strict v_registry_sku_id
  from public.sku_identifier_registry r
  where r.organization_id = p_organization_id
    and r.normalized_identifier = v_key
  for update;

  if v_registry_sku_id <> p_sku_id then
    raise exception 'identifier_cross_field_collision' using errcode = '23505';
  end if;

  if not exists (
    select 1 from public.sku_identifier_bindings b
    where b.organization_id = p_organization_id
      and b.sku_id = p_sku_id
      and b.identifier_kind = p_identifier_kind
      and b.normalized_identifier = v_key
      and b.status = 'active'
  ) then
    insert into public.sku_identifier_bindings (
      organization_id, sku_id, identifier_kind, raw_value,
      normalized_identifier, created_by
    ) values (
      p_organization_id, p_sku_id, p_identifier_kind, btrim(p_raw_value),
      v_key, p_actor_user_id
    );
  end if;
end;
$$;

create or replace function private.release_sku_identifier(
  p_organization_id uuid,
  p_sku_id uuid,
  p_identifier_kind text,
  p_raw_value text,
  p_actor_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text := upper(btrim(p_raw_value));
begin
  if p_raw_value is null then return; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'sku-identifier:' || p_organization_id::text || ':' || v_key, 0
  ));

  update public.sku_identifier_bindings b
  set status = 'released', released_by = p_actor_user_id, released_at = now()
  where b.organization_id = p_organization_id
    and b.sku_id = p_sku_id
    and b.identifier_kind = p_identifier_kind
    and b.normalized_identifier = v_key
    and b.status = 'active';

  if not exists (
    select 1 from public.sku_identifier_bindings b
    where b.organization_id = p_organization_id
      and b.normalized_identifier = v_key
      and b.status = 'active'
  ) then
    delete from public.sku_identifier_registry r
    where r.organization_id = p_organization_id
      and r.normalized_identifier = v_key
      and r.sku_id = p_sku_id;
  end if;
end;
$$;

create or replace function private.sync_sku_identifier_registry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.bind_sku_identifier(
      new.organization_id, new.id, 'sku_code', new.sku_code, new.created_by
    );
    if new.sales_code is not null then
      perform private.bind_sku_identifier(
        new.organization_id, new.id, 'sales_code', new.sales_code, new.created_by
      );
    end if;
    if new.barcode is not null then
      perform private.bind_sku_identifier(
        new.organization_id, new.id, 'barcode', new.barcode, new.created_by
      );
    end if;
    return new;
  end if;

  if new.sales_code is distinct from old.sales_code and new.sales_code is not null then
    perform private.bind_sku_identifier(
      new.organization_id, new.id, 'sales_code', new.sales_code, new.updated_by
    );
  end if;

  if new.barcode is distinct from old.barcode then
    if old.barcode is not null then
      perform private.release_sku_identifier(
        old.organization_id, old.id, 'barcode', old.barcode, new.updated_by
      );
    end if;
    if new.barcode is not null then
      perform private.bind_sku_identifier(
        new.organization_id, new.id, 'barcode', new.barcode, new.updated_by
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.enforce_sku_code_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.sku_code is distinct from old.sku_code then
    raise exception 'sku_code_is_immutable' using errcode = '22023';
  end if;
  if old.sales_code is not null and new.sales_code is distinct from old.sales_code then
    raise exception 'sales_code_is_permanent' using errcode = '22023';
  end if;
  if old.status = 'archived' and new.barcode is distinct from old.barcode then
    raise exception 'archived_sku_barcode_is_immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.bind_sku_identifier(uuid, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.release_sku_identifier(uuid, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.sync_sku_identifier_registry()
  from public, anon, authenticated, service_role;
revoke all on function private.enforce_sku_code_immutable()
  from public, anon, authenticated, service_role;

create trigger sync_sku_identifier_registry
after insert or update of sales_code, barcode on public.skus
for each row execute function private.sync_sku_identifier_registry();

create table public.sales_code_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  purpose text not null,
  prefix text not null,
  start_number bigint not null,
  next_number bigint not null,
  digit_count smallint not null,
  status text not null default 'active',
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_code_sequences_tenant_id_unique unique (organization_id, id),
  constraint sales_code_sequences_scope_unique unique (organization_id, purpose, prefix),
  constraint sales_code_sequences_name_check check (
    name = btrim(name) and char_length(name) between 1 and 80 and name !~ '[[:cntrl:]]'
  ),
  constraint sales_code_sequences_purpose_check check (
    purpose in ('permanent_sales', 'live_code')
  ),
  constraint sales_code_sequences_prefix_check check (
    prefix = upper(btrim(prefix)) and prefix ~ '^[A-Z][A-Z0-9_-]{0,11}$'
  ),
  constraint sales_code_sequences_numbers_check check (
    start_number >= 0 and next_number >= start_number
  ),
  constraint sales_code_sequences_digits_check check (digit_count between 1 and 12),
  constraint sales_code_sequences_status_check check (status in ('active', 'inactive', 'exhausted')),
  constraint sales_code_sequences_version_check check (version >= 1)
);

create index sales_code_sequences_read_idx
  on public.sales_code_sequences (organization_id, purpose, status, prefix, id);

create table public.sales_code_reservation_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sequence_id uuid not null,
  purpose text not null,
  start_number bigint not null,
  end_number bigint not null,
  quantity integer not null,
  status text not null default 'active',
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  released_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  constraint sales_code_reservation_batches_tenant_id_unique unique (organization_id, id),
  constraint sales_code_reservation_batches_sequence_fk foreign key (organization_id, sequence_id)
    references public.sales_code_sequences (organization_id, id) on delete restrict,
  constraint sales_code_reservation_batches_purpose_check check (
    purpose in ('permanent_sales', 'live_code')
  ),
  constraint sales_code_reservation_batches_range_check check (
    start_number >= 0 and end_number >= start_number
    and quantity = (end_number - start_number + 1)
    and quantity between 1 and 400
  ),
  constraint sales_code_reservation_batches_status_check check (
    status in ('active', 'exhausted', 'released', 'expired')
  ),
  constraint sales_code_reservation_batches_release_check check (
    (status in ('active', 'exhausted', 'expired') and released_by is null and released_at is null)
    or (status = 'released' and released_at is not null)
  )
);

create index sales_code_reservation_batches_read_idx
  on public.sales_code_reservation_batches (
    organization_id, sequence_id, status, created_at desc, id desc
  );
create index sales_code_reservation_batches_expiry_idx
  on public.sales_code_reservation_batches (expires_at, organization_id, id)
  where status = 'active';

create table public.sales_code_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sequence_id uuid not null,
  batch_id uuid,
  purpose text not null,
  sequence_number bigint not null,
  code text not null,
  status text not null,
  sku_id uuid,
  expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete restrict,
  released_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  released_at timestamptz,
  constraint sales_code_reservations_tenant_id_unique unique (organization_id, id),
  constraint sales_code_reservations_sequence_number_unique unique (
    organization_id, sequence_id, sequence_number
  ),
  constraint sales_code_reservations_sequence_fk foreign key (organization_id, sequence_id)
    references public.sales_code_sequences (organization_id, id) on delete restrict,
  constraint sales_code_reservations_batch_fk foreign key (organization_id, batch_id)
    references public.sales_code_reservation_batches (organization_id, id) on delete restrict,
  constraint sales_code_reservations_sku_fk foreign key (organization_id, sku_id)
    references public.skus (organization_id, id) on delete restrict,
  constraint sales_code_reservations_purpose_check check (
    purpose in ('permanent_sales', 'live_code')
  ),
  constraint sales_code_reservations_code_check check (
    code = upper(btrim(code)) and char_length(code) between 2 and 80
    and code ~ '^[A-Z0-9_-]+$'
  ),
  constraint sales_code_reservations_status_check check (
    status in ('reserved', 'assigned', 'released', 'expired')
  ),
  constraint sales_code_reservations_state_check check (
    (status = 'reserved' and sku_id is null and expires_at is not null
      and assigned_by is null and assigned_at is null and released_at is null)
    or (status = 'assigned' and purpose = 'permanent_sales' and sku_id is not null
      and assigned_by is not null and assigned_at is not null and released_at is null)
    or (status in ('released', 'expired') and sku_id is null and released_at is not null)
  )
);

create unique index sales_code_reservations_assigned_sku_unique
  on public.sales_code_reservations (organization_id, sku_id)
  where status = 'assigned';
create index sales_code_reservations_batch_read_idx
  on public.sales_code_reservations (
    organization_id, batch_id, status, sequence_number, id
  );
create index sales_code_reservations_code_idx
  on public.sales_code_reservations (organization_id, code, status, id);
create index sales_code_reservations_expiry_idx
  on public.sales_code_reservations (expires_at, organization_id, id)
  where status = 'reserved';

create table public.sales_code_allocator_commands (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  command_type text not null,
  payload jsonb not null,
  request_hash text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'processing',
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint sales_code_allocator_commands_tenant_id_unique unique (organization_id, id),
  constraint sales_code_allocator_commands_type_check check (command_type in (
    'sequence.create', 'permanent.allocate', 'batch.reserve',
    'reservation.assign', 'batch.release'
  )),
  constraint sales_code_allocator_commands_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint sales_code_allocator_commands_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint sales_code_allocator_commands_status_check check (status in ('processing', 'completed')),
  constraint sales_code_allocator_commands_completion_check check (
    (status = 'processing' and result is null and completed_at is null)
    or (status = 'completed' and result is not null and completed_at is not null)
  )
);

create table public.sales_code_allocator_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  command_id uuid not null,
  event_name text not null,
  entity_type text not null,
  entity_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sales_code_allocator_events_command_unique unique (organization_id, command_id),
  constraint sales_code_allocator_events_command_fk foreign key (organization_id, command_id)
    references public.sales_code_allocator_commands (organization_id, id) on delete restrict,
  constraint sales_code_allocator_events_name_check check (event_name in (
    'sales_code.sequence.created', 'sales_code.permanent.assigned',
    'sales_code.batch.reserved', 'sales_code.reservation.assigned',
    'sales_code.batch.released'
  )),
  constraint sales_code_allocator_events_entity_type_check check (
    entity_type in ('sequence', 'batch', 'reservation', 'sku')
  ),
  constraint sales_code_allocator_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index sales_code_allocator_commands_org_time_idx
  on public.sales_code_allocator_commands (organization_id, created_at desc, id desc);
create index sales_code_allocator_commands_actor_idx
  on public.sales_code_allocator_commands (actor_user_id);
create index sales_code_allocator_events_org_time_idx
  on public.sales_code_allocator_events (organization_id, occurred_at desc, id desc);
create index sales_code_allocator_events_entity_idx
  on public.sales_code_allocator_events (organization_id, entity_type, entity_id);
create index sales_code_allocator_events_actor_idx
  on public.sales_code_allocator_events (actor_user_id);

create or replace function private.format_sales_code(
  p_prefix text,
  p_number bigint,
  p_digit_count smallint
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_number_text text := p_number::text;
begin
  if p_number < 0 or char_length(v_number_text) > p_digit_count then
    raise exception 'sales_code_sequence_exhausted' using errcode = '22003';
  end if;
  return p_prefix || lpad(v_number_text, p_digit_count, '0');
end;
$$;

create or replace function private.expire_sales_code_reservations(
  p_organization_id uuid,
  p_sequence_id uuid
)
returns integer
language plpgsql
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
      and r.sequence_id = p_sequence_id
      and r.status = 'reserved'
      and r.expires_at <= now()
    returning r.batch_id
  )
  select count(*) into v_count from expired;

  update public.sales_code_reservation_batches b
  set status = 'expired'
  where b.organization_id = p_organization_id
    and b.sequence_id = p_sequence_id
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

create or replace function public.server_preview_sales_code_sequence(
  p_organization_id uuid,
  p_sequence_id uuid,
  p_actor_user_id uuid,
  p_count integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sequence public.sales_code_sequences%rowtype;
  v_codes jsonb;
begin
  if p_organization_id is null or p_sequence_id is null or p_actor_user_id is null
     or p_count not between 1 and 20 then
    raise exception 'sales_code_preview_input_invalid' using errcode = '22023';
  end if;
  if not private.server_actor_has_org_permission(
    p_actor_user_id, p_organization_id, 'product.manage', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select s.* into strict v_sequence
  from public.sales_code_sequences s
  where s.organization_id = p_organization_id and s.id = p_sequence_id;

  select jsonb_agg(private.format_sales_code(
    v_sequence.prefix, v_sequence.next_number + n, v_sequence.digit_count
  ) order by n) into v_codes
  from generate_series(0, p_count - 1) n;

  return jsonb_build_object(
    'sequence_id', v_sequence.id,
    'codes', v_codes,
    'preview_only', true,
    'next_number', v_sequence.next_number
  );
exception when no_data_found then
  raise exception 'sales_code_sequence_not_found' using errcode = 'P0002';
end;
$$;

create or replace function public.resolve_permanent_sku_identifier(
  p_organization_id uuid,
  p_identifier text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_registry public.sku_identifier_registry%rowtype;
  v_kinds jsonb;
begin
  if p_organization_id is null or p_actor_user_id is null
     or p_identifier is null or btrim(p_identifier) = '' then
    raise exception 'identifier_lookup_input_invalid' using errcode = '22023';
  end if;
  if not private.server_actor_has_org_permission(
    p_actor_user_id, p_organization_id, 'product.read', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select r.* into strict v_registry
  from public.sku_identifier_registry r
  where r.organization_id = p_organization_id
    and r.normalized_identifier = upper(btrim(p_identifier));

  select jsonb_agg(b.identifier_kind order by b.identifier_kind) into v_kinds
  from public.sku_identifier_bindings b
  where b.organization_id = p_organization_id
    and b.normalized_identifier = v_registry.normalized_identifier
    and b.sku_id = v_registry.sku_id and b.status = 'active';

  return jsonb_build_object(
    'sku_id', v_registry.sku_id,
    'normalized_identifier', v_registry.normalized_identifier,
    'identifier_kinds', coalesce(v_kinds, '[]'::jsonb)
  );
exception when no_data_found then
  raise exception 'identifier_not_found' using errcode = 'P0002';
end;
$$;

create or replace function public.server_execute_sales_code_command(
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
  v_command public.sales_code_allocator_commands%rowtype;
  v_sequence public.sales_code_sequences%rowtype;
  v_batch public.sales_code_reservation_batches%rowtype;
  v_reservation public.sales_code_reservations%rowtype;
  v_sku public.skus%rowtype;
  v_entity_id uuid;
  v_entity_type text;
  v_event_name text;
  v_target_label text;
  v_result jsonb;
  v_candidate text;
  v_candidate_number bigint;
  v_quantity integer;
  v_expires_at timestamptz;
  v_expired_count integer := 0;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_command_id is null or p_organization_id is null or p_actor_user_id is null then
    raise exception 'sales_code_command_identity_required' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'sales_code_command_payload_invalid' using errcode = '22023';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'sales_code_request_hash_invalid' using errcode = '22023';
  end if;
  if p_command_type not in (
    'sequence.create', 'permanent.allocate', 'batch.reserve',
    'reservation.assign', 'batch.release'
  ) then
    raise exception 'sales_code_command_type_invalid' using errcode = '22023';
  end if;

  insert into public.sales_code_allocator_commands (
    id, organization_id, command_type, payload, request_hash, actor_user_id
  ) values (
    p_command_id, p_organization_id, p_command_type,
    p_payload, p_request_hash, p_actor_user_id
  ) on conflict (id) do nothing;

  select c.* into strict v_command
  from public.sales_code_allocator_commands c
  where c.id = p_command_id
  for update;

  if v_command.organization_id <> p_organization_id
     or v_command.command_type <> p_command_type
     or v_command.payload <> p_payload
     or v_command.request_hash <> p_request_hash
     or v_command.actor_user_id <> p_actor_user_id then
    raise exception 'command_payload_conflict' using errcode = '23505';
  end if;
  if v_command.status = 'completed' then return v_command.result; end if;

  if not private.server_actor_has_org_permission(
    p_actor_user_id, p_organization_id, 'product.manage', null
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_command_type = 'sequence.create' then
    insert into public.sales_code_sequences (
      organization_id, name, purpose, prefix, start_number, next_number,
      digit_count, created_by, updated_by
    ) values (
      p_organization_id, p_payload ->> 'name', p_payload ->> 'purpose',
      upper(btrim(p_payload ->> 'prefix')),
      (p_payload ->> 'start_number')::bigint,
      (p_payload ->> 'start_number')::bigint,
      (p_payload ->> 'digit_count')::smallint,
      p_actor_user_id, p_actor_user_id
    ) returning * into v_sequence;
    v_entity_id := v_sequence.id;
    v_entity_type := 'sequence';
    v_event_name := 'sales_code.sequence.created';
    v_target_label := v_sequence.name;
    v_result := jsonb_build_object(
      'sequence_id', v_sequence.id,
      'purpose', v_sequence.purpose,
      'next_code', private.format_sales_code(
        v_sequence.prefix, v_sequence.next_number, v_sequence.digit_count
      )
    );
  elsif p_command_type in ('permanent.allocate', 'batch.reserve') then
    select s.* into strict v_sequence
    from public.sales_code_sequences s
    where s.organization_id = p_organization_id
      and s.id = (p_payload ->> 'sequence_id')::uuid
    for update;
    if v_sequence.status <> 'active' then
      raise exception 'sales_code_sequence_inactive' using errcode = '23514';
    end if;
    v_expired_count := private.expire_sales_code_reservations(
      p_organization_id, v_sequence.id
    );

    if p_command_type = 'permanent.allocate' then
      if v_sequence.purpose <> 'permanent_sales' then
        raise exception 'sales_code_sequence_purpose_mismatch' using errcode = '23514';
      end if;
      select s.* into strict v_sku from public.skus s
      where s.organization_id = p_organization_id
        and s.id = (p_payload ->> 'sku_id')::uuid
      for update;
      if v_sku.status = 'archived' then
        raise exception 'entity_inactive' using errcode = '23514';
      end if;
      if v_sku.sales_code is not null then
        raise exception 'sales_code_already_assigned' using errcode = '23514';
      end if;

      v_candidate_number := v_sequence.next_number;
      loop
        v_candidate := private.format_sales_code(
          v_sequence.prefix, v_candidate_number, v_sequence.digit_count
        );
        exit when not exists (
          select 1 from public.sku_identifier_registry r
          where r.organization_id = p_organization_id
            and r.normalized_identifier = v_candidate
        ) and not exists (
          select 1 from public.sales_code_reservations r
          where r.organization_id = p_organization_id
            and r.purpose = 'permanent_sales'
            and r.code = v_candidate and r.status in ('reserved', 'assigned')
        );
        v_candidate_number := v_candidate_number + 1;
      end loop;

      update public.sales_code_sequences set
        next_number = v_candidate_number + 1,
        version = version + 1,
        updated_by = p_actor_user_id,
        updated_at = now()
      where organization_id = p_organization_id and id = v_sequence.id;

      update public.skus set sales_code = v_candidate, updated_by = p_actor_user_id
      where organization_id = p_organization_id and id = v_sku.id
      returning * into v_sku;

      insert into public.sales_code_reservations (
        organization_id, sequence_id, purpose, sequence_number, code,
        status, sku_id, created_by, assigned_by, assigned_at
      ) values (
        p_organization_id, v_sequence.id, 'permanent_sales',
        v_candidate_number, v_candidate, 'assigned', v_sku.id,
        p_actor_user_id, p_actor_user_id, now()
      ) returning * into v_reservation;

      v_entity_id := v_sku.id;
      v_entity_type := 'sku';
      v_event_name := 'sales_code.permanent.assigned';
      v_target_label := v_candidate || ' · ' || v_sku.sku_code;
      v_result := jsonb_build_object(
        'sku_id', v_sku.id, 'sales_code', v_candidate,
        'reservation_id', v_reservation.id,
        'expired_reservations', v_expired_count
      );
    else
      v_quantity := (p_payload ->> 'quantity')::integer;
      if v_quantity not between 1 and 400 then
        raise exception 'sales_code_batch_quantity_invalid' using errcode = '22023';
      end if;
      v_expires_at := now() + make_interval(
        mins => coalesce((p_payload ->> 'expires_in_minutes')::integer, 60)
      );
      if v_expires_at <= now() or v_expires_at > now() + interval '7 days' then
        raise exception 'sales_code_reservation_expiry_invalid' using errcode = '22023';
      end if;

      v_candidate_number := v_sequence.next_number;
      loop
        perform private.format_sales_code(
          v_sequence.prefix, v_candidate_number + v_quantity - 1,
          v_sequence.digit_count
        );
        exit when v_sequence.purpose = 'live_code' or not exists (
          select 1
          from generate_series(v_candidate_number, v_candidate_number + v_quantity - 1) n
          join public.sku_identifier_registry r
            on r.organization_id = p_organization_id
           and r.normalized_identifier = private.format_sales_code(
             v_sequence.prefix, n, v_sequence.digit_count
           )
        );
        v_candidate_number := v_candidate_number + 1;
      end loop;

      insert into public.sales_code_reservation_batches (
        organization_id, sequence_id, purpose, start_number, end_number,
        quantity, expires_at, created_by
      ) values (
        p_organization_id, v_sequence.id, v_sequence.purpose,
        v_candidate_number, v_candidate_number + v_quantity - 1,
        v_quantity, v_expires_at, p_actor_user_id
      ) returning * into v_batch;

      insert into public.sales_code_reservations (
        organization_id, sequence_id, batch_id, purpose, sequence_number,
        code, status, expires_at, created_by
      )
      select p_organization_id, v_sequence.id, v_batch.id, v_sequence.purpose,
        n, private.format_sales_code(v_sequence.prefix, n, v_sequence.digit_count),
        'reserved', v_expires_at, p_actor_user_id
      from generate_series(v_batch.start_number, v_batch.end_number) n;

      update public.sales_code_sequences set
        next_number = v_batch.end_number + 1,
        version = version + 1,
        updated_by = p_actor_user_id,
        updated_at = now()
      where organization_id = p_organization_id and id = v_sequence.id;

      v_entity_id := v_batch.id;
      v_entity_type := 'batch';
      v_event_name := 'sales_code.batch.reserved';
      v_target_label := private.format_sales_code(
        v_sequence.prefix, v_batch.start_number, v_sequence.digit_count
      ) || '–' || private.format_sales_code(
        v_sequence.prefix, v_batch.end_number, v_sequence.digit_count
      );
      v_result := jsonb_build_object(
        'batch_id', v_batch.id,
        'first_code', private.format_sales_code(
          v_sequence.prefix, v_batch.start_number, v_sequence.digit_count
        ),
        'last_code', private.format_sales_code(
          v_sequence.prefix, v_batch.end_number, v_sequence.digit_count
        ),
        'quantity', v_batch.quantity,
        'expires_at', v_batch.expires_at,
        'expired_reservations', v_expired_count
      );
    end if;
  elsif p_command_type = 'reservation.assign' then
    select r.* into strict v_reservation
    from public.sales_code_reservations r
    where r.organization_id = p_organization_id
      and r.id = (p_payload ->> 'reservation_id')::uuid
    for update;
    if v_reservation.status <> 'reserved' then
      raise exception 'identifier_reservation_conflict' using errcode = '23514';
    end if;
    if v_reservation.expires_at <= now() then
      update public.sales_code_reservations set
        status = 'expired', released_at = now()
      where organization_id = p_organization_id and id = v_reservation.id;
      raise exception 'identifier_reservation_expired' using errcode = '23514';
    end if;
    if v_reservation.purpose <> 'permanent_sales' then
      raise exception 'sales_code_sequence_purpose_mismatch' using errcode = '23514';
    end if;

    select s.* into strict v_sku from public.skus s
    where s.organization_id = p_organization_id
      and s.id = (p_payload ->> 'sku_id')::uuid
    for update;
    if v_sku.status = 'archived' or v_sku.sales_code is not null then
      raise exception 'sales_code_assignment_forbidden' using errcode = '23514';
    end if;

    update public.skus set sales_code = v_reservation.code, updated_by = p_actor_user_id
    where organization_id = p_organization_id and id = v_sku.id;
    update public.sales_code_reservations set
      status = 'assigned', sku_id = v_sku.id,
      assigned_by = p_actor_user_id, assigned_at = now(), expires_at = null
    where organization_id = p_organization_id and id = v_reservation.id
    returning * into v_reservation;

    update public.sales_code_reservation_batches b set status = 'exhausted'
    where b.organization_id = p_organization_id and b.id = v_reservation.batch_id
      and not exists (
        select 1 from public.sales_code_reservations r
        where r.organization_id = b.organization_id
          and r.batch_id = b.id and r.status = 'reserved'
      );

    v_entity_id := v_reservation.id;
    v_entity_type := 'reservation';
    v_event_name := 'sales_code.reservation.assigned';
    v_target_label := v_reservation.code || ' · ' || v_sku.sku_code;
    v_result := jsonb_build_object(
      'reservation_id', v_reservation.id,
      'sku_id', v_sku.id,
      'sales_code', v_reservation.code
    );
  else
    select b.* into strict v_batch
    from public.sales_code_reservation_batches b
    where b.organization_id = p_organization_id
      and b.id = (p_payload ->> 'batch_id')::uuid
    for update;
    if v_batch.status <> 'active' then
      raise exception 'identifier_reservation_conflict' using errcode = '23514';
    end if;

    update public.sales_code_reservations set
      status = 'released', released_by = p_actor_user_id,
      released_at = now(), expires_at = null
    where organization_id = p_organization_id and batch_id = v_batch.id
      and status = 'reserved';
    update public.sales_code_reservation_batches set
      status = 'released', released_by = p_actor_user_id, released_at = now()
    where organization_id = p_organization_id and id = v_batch.id
    returning * into v_batch;

    v_entity_id := v_batch.id;
    v_entity_type := 'batch';
    v_event_name := 'sales_code.batch.released';
    v_target_label := 'Released batch ' || v_batch.id::text;
    v_result := jsonb_build_object('batch_id', v_batch.id, 'status', v_batch.status);
  end if;

  insert into public.sales_code_allocator_events (
    organization_id, command_id, event_name, entity_type, entity_id,
    actor_user_id, metadata, occurred_at
  ) values (
    p_organization_id, p_command_id, v_event_name, v_entity_type, v_entity_id,
    p_actor_user_id, v_result, v_occurred_at
  );

  perform private.append_organization_audit_log(
    p_organization_id, 'product', v_event_name, p_actor_user_id,
    v_entity_type, v_entity_id, v_target_label,
    replace(v_event_name, '.', ' '), v_result,
    'sales_code_allocator_command', p_command_id, v_event_name, v_occurred_at
  );

  update public.sales_code_allocator_commands
  set status = 'completed', result = v_result, completed_at = now()
  where organization_id = p_organization_id and id = p_command_id;
  return v_result;
exception when no_data_found then
  raise exception 'entity_not_found' using errcode = 'P0002';
end;
$$;

revoke all on function private.format_sales_code(text, bigint, smallint)
  from public, anon, authenticated, service_role;
revoke all on function private.expire_sales_code_reservations(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.server_preview_sales_code_sequence(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.server_preview_sales_code_sequence(uuid, uuid, uuid, integer)
  to service_role;
revoke all on function public.resolve_permanent_sku_identifier(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_permanent_sku_identifier(uuid, text, uuid)
  to service_role;
revoke all on function public.server_execute_sales_code_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.server_execute_sales_code_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) to service_role;

alter table public.sku_identifier_registry enable row level security;
alter table public.sku_identifier_bindings enable row level security;
alter table public.sales_code_sequences enable row level security;
alter table public.sales_code_reservation_batches enable row level security;
alter table public.sales_code_reservations enable row level security;
alter table public.sales_code_allocator_commands enable row level security;
alter table public.sales_code_allocator_events enable row level security;

revoke all privileges on table
  public.sku_identifier_registry, public.sku_identifier_bindings,
  public.sales_code_sequences, public.sales_code_reservation_batches,
  public.sales_code_reservations, public.sales_code_allocator_commands,
  public.sales_code_allocator_events
from public, anon, authenticated, service_role;

grant select on table
  public.sku_identifier_registry, public.sku_identifier_bindings,
  public.sales_code_sequences, public.sales_code_reservation_batches,
  public.sales_code_reservations, public.sales_code_allocator_events
to authenticated;

create policy sku_identifier_registry_read
on public.sku_identifier_registry for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy sku_identifier_bindings_read
on public.sku_identifier_bindings for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy sales_code_sequences_read
on public.sales_code_sequences for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy sales_code_reservation_batches_read
on public.sales_code_reservation_batches for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy sales_code_reservations_read
on public.sales_code_reservations for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));
create policy sales_code_allocator_events_read
on public.sales_code_allocator_events for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));

comment on table public.sku_identifier_registry is
  'A4 authoritative tenant-scoped permanent identifier lookup. One normalized code always resolves to one SKU.';
comment on table public.sku_identifier_bindings is
  'A4 identifier lifecycle history for SKU Code, permanent Sales Code, and Barcode.';
comment on table public.sales_code_sequences is
  'A4 database-authoritative permanent Sales Code or future Live Code sequence definitions.';
comment on table public.sales_code_reservation_batches is
  'A4 bounded expiring Sales/Live Code reservation batches; maximum 400 codes and seven days.';
comment on table public.sales_code_reservations is
  'A4 individual reserved or permanently assigned codes allocated under row lock.';
comment on function public.server_execute_sales_code_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) is 'Service-role-only, permission-checked and idempotent A4 allocator. Sequence rows are locked before allocation.';
