-- Phase 2.0.3.4: immutable inventory ledger, derived balances, and
-- idempotent atomic posting primitive. Production apply is not authorized.

alter table public.locations
  add constraint locations_organization_id_id_unique
  unique (organization_id, id);

alter table public.locations
  add constraint locations_scope_id_unique
  unique (organization_id, branch_id, warehouse_id, id);

create table public.inventory_commands (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  command_type text not null,
  sku_id uuid not null,
  source_location_id uuid,
  destination_location_id uuid,
  quantity numeric(20,6) not null,
  reason_code text not null,
  reason_note text,
  request_hash text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'processing',
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint inventory_commands_organization_id_id_unique unique (organization_id, id),
  constraint inventory_commands_sku_tenant_fk foreign key (organization_id, sku_id)
    references public.skus (organization_id, id) on delete restrict,
  constraint inventory_commands_source_location_tenant_fk
    foreign key (organization_id, source_location_id)
    references public.locations (organization_id, id) on delete restrict,
  constraint inventory_commands_destination_location_tenant_fk
    foreign key (organization_id, destination_location_id)
    references public.locations (organization_id, id) on delete restrict,
  constraint inventory_commands_type_check check (
    command_type in ('receive', 'adjustment_in', 'adjustment_out', 'transfer')
  ),
  constraint inventory_commands_quantity_check check (quantity > 0),
  constraint inventory_commands_reason_code_check check (
    reason_code = lower(btrim(reason_code))
    and reason_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint inventory_commands_reason_note_check check (
    reason_note is null or reason_note = btrim(reason_note)
  ),
  constraint inventory_commands_request_hash_check check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint inventory_commands_status_check check (status in ('processing', 'completed')),
  constraint inventory_commands_completion_check check (
    (status = 'processing' and result is null and completed_at is null)
    or (status = 'completed' and result is not null and completed_at is not null)
  ),
  constraint inventory_commands_location_shape_check check (
    (command_type = 'receive' and source_location_id is null and destination_location_id is not null)
    or (
      command_type = 'adjustment_in'
      and source_location_id is null
      and destination_location_id is not null
    )
    or (
      command_type = 'adjustment_out'
      and source_location_id is not null
      and destination_location_id is null
    )
    or (
      command_type = 'transfer'
      and source_location_id is not null
      and destination_location_id is not null
      and source_location_id <> destination_location_id
    )
  )
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  warehouse_id uuid not null,
  location_id uuid not null,
  sku_id uuid not null,
  movement_type text not null,
  quantity_delta numeric(20,6) not null,
  base_unit_code text not null,
  reason_code text not null,
  reason_note text,
  command_id uuid not null,
  sequence_no smallint not null,
  correlation_id uuid,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint stock_movements_organization_id_id_unique unique (organization_id, id),
  constraint stock_movements_location_scope_fk
    foreign key (organization_id, branch_id, warehouse_id, location_id)
    references public.locations (organization_id, branch_id, warehouse_id, id)
    on delete restrict,
  constraint stock_movements_sku_tenant_fk foreign key (organization_id, sku_id)
    references public.skus (organization_id, id) on delete restrict,
  constraint stock_movements_command_tenant_fk foreign key (organization_id, command_id)
    references public.inventory_commands (organization_id, id) on delete restrict,
  constraint stock_movements_command_sequence_unique
    unique (organization_id, command_id, sequence_no),
  constraint stock_movements_type_check check (
    movement_type in (
      'receive', 'adjustment_in', 'adjustment_out', 'transfer_out', 'transfer_in'
    )
  ),
  constraint stock_movements_quantity_delta_check check (
    (movement_type in ('receive', 'adjustment_in', 'transfer_in') and quantity_delta > 0)
    or (movement_type in ('adjustment_out', 'transfer_out') and quantity_delta < 0)
  ),
  constraint stock_movements_base_unit_code_check check (
    base_unit_code = lower(btrim(base_unit_code))
    and base_unit_code ~ '^[a-z][a-z0-9_]{0,31}$'
  ),
  constraint stock_movements_reason_code_check check (
    reason_code = lower(btrim(reason_code))
    and reason_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint stock_movements_reason_note_check check (
    reason_note is null or reason_note = btrim(reason_note)
  ),
  constraint stock_movements_transfer_shape_check check (
    (
      movement_type in ('transfer_out', 'transfer_in')
      and correlation_id is not null
      and sequence_no in (1, 2)
    )
    or (
      movement_type not in ('transfer_out', 'transfer_in')
      and correlation_id is null
      and sequence_no = 1
    )
  )
);

create table public.inventory_balances (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  warehouse_id uuid not null,
  location_id uuid not null,
  sku_id uuid not null,
  on_hand numeric(20,6) not null default 0,
  allocated numeric(20,6) generated always as (0::numeric(20,6)) stored,
  available numeric(20,6) generated always as (on_hand) stored,
  version bigint not null default 0,
  last_movement_id uuid,
  updated_at timestamptz not null default now(),
  primary key (organization_id, sku_id, location_id),
  constraint inventory_balances_location_scope_fk
    foreign key (organization_id, branch_id, warehouse_id, location_id)
    references public.locations (organization_id, branch_id, warehouse_id, id)
    on delete restrict,
  constraint inventory_balances_sku_tenant_fk foreign key (organization_id, sku_id)
    references public.skus (organization_id, id) on delete restrict,
  constraint inventory_balances_last_movement_tenant_fk
    foreign key (organization_id, last_movement_id)
    references public.stock_movements (organization_id, id) on delete restrict,
  constraint inventory_balances_on_hand_check check (on_hand >= 0),
  constraint inventory_balances_version_check check (version >= 0),
  constraint inventory_balances_movement_version_check check (
    (version = 0 and last_movement_id is null)
    or (version > 0 and last_movement_id is not null)
  )
);

create table public.inventory_domain_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid,
  event_name text not null,
  command_id uuid not null,
  sku_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint inventory_domain_events_command_unique unique (organization_id, command_id),
  constraint inventory_domain_events_command_tenant_fk
    foreign key (organization_id, command_id)
    references public.inventory_commands (organization_id, id) on delete restrict,
  constraint inventory_domain_events_sku_tenant_fk foreign key (organization_id, sku_id)
    references public.skus (organization_id, id) on delete restrict,
  constraint inventory_domain_events_name_check check (
    event_name in ('stock.received', 'stock.adjusted', 'stock.transferred')
  ),
  constraint inventory_domain_events_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index inventory_commands_org_created_idx
  on public.inventory_commands (organization_id, created_at desc, id);
create index inventory_commands_sku_idx on public.inventory_commands (organization_id, sku_id);
create index inventory_commands_source_location_idx
  on public.inventory_commands (organization_id, source_location_id)
  where source_location_id is not null;
create index inventory_commands_destination_location_idx
  on public.inventory_commands (organization_id, destination_location_id)
  where destination_location_id is not null;
create index inventory_commands_actor_idx on public.inventory_commands (actor_user_id);

create index stock_movements_ledger_idx
  on public.stock_movements (
    organization_id, location_id, sku_id, occurred_at desc, id desc
  );
create index stock_movements_sku_time_idx
  on public.stock_movements (organization_id, sku_id, occurred_at desc, id desc);
create index stock_movements_scope_time_idx
  on public.stock_movements (
    organization_id, branch_id, warehouse_id, occurred_at desc, id desc
  );
create index stock_movements_location_scope_idx
  on public.stock_movements (
    organization_id, branch_id, warehouse_id, location_id
  );
create index stock_movements_command_idx
  on public.stock_movements (organization_id, command_id);
create index stock_movements_actor_idx on public.stock_movements (actor_user_id);
create index stock_movements_correlation_idx
  on public.stock_movements (organization_id, correlation_id)
  where correlation_id is not null;

create index inventory_balances_scope_idx
  on public.inventory_balances (organization_id, branch_id, warehouse_id, location_id, sku_id);
create index inventory_balances_location_scope_idx
  on public.inventory_balances (organization_id, branch_id, warehouse_id, location_id);
create index inventory_balances_last_movement_idx
  on public.inventory_balances (organization_id, last_movement_id)
  where last_movement_id is not null;

create index inventory_domain_events_time_idx
  on public.inventory_domain_events (organization_id, occurred_at desc, id desc);
create index inventory_domain_events_sku_idx
  on public.inventory_domain_events (organization_id, sku_id);
create index inventory_domain_events_actor_idx
  on public.inventory_domain_events (actor_user_id);

create or replace function private.require_inventory_write_context(
  p_organization_id uuid,
  p_command_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_context text;
begin
  v_context := current_setting('avenzo.inventory_command_id', true);
  if v_context is null or v_context = '' or v_context::uuid <> p_command_id then
    raise exception 'inventory_command_context_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.inventory_commands c
    where c.organization_id = p_organization_id
      and c.id = p_command_id
      and c.status = 'processing'
  ) then
    raise exception 'inventory_processing_command_required' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.guard_inventory_movement_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_inventory_write_context(new.organization_id, new.command_id);
  return new;
end;
$$;

create or replace function private.guard_inventory_balance_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_command_id uuid;
begin
  v_command_id := nullif(current_setting('avenzo.inventory_command_id', true), '')::uuid;
  perform private.require_inventory_write_context(new.organization_id, v_command_id);
  return new;
end;
$$;

create or replace function private.guard_inventory_command_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_inventory_write_context(old.organization_id, old.id);

  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.command_type is distinct from old.command_type
     or new.sku_id is distinct from old.sku_id
     or new.source_location_id is distinct from old.source_location_id
     or new.destination_location_id is distinct from old.destination_location_id
     or new.quantity is distinct from old.quantity
     or new.reason_code is distinct from old.reason_code
     or new.reason_note is distinct from old.reason_note
     or new.request_hash is distinct from old.request_hash
     or new.actor_user_id is distinct from old.actor_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'inventory_command_envelope_is_immutable' using errcode = '22023';
  end if;

  if old.status <> 'processing' or new.status <> 'completed' then
    raise exception 'invalid_inventory_command_transition' using errcode = '22023';
  end if;

  return new;
end;
$$;

create or replace function private.guard_inventory_event_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_inventory_write_context(new.organization_id, new.command_id);
  return new;
end;
$$;

create or replace function private.prevent_inventory_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '%_is_immutable', tg_table_name using errcode = '22023';
end;
$$;

create trigger guard_inventory_movement_insert
before insert on public.stock_movements
for each row execute function private.guard_inventory_movement_insert();
create trigger prevent_stock_movement_update_delete
before update or delete on public.stock_movements
for each row execute function private.prevent_inventory_mutation();

create trigger guard_inventory_balance_write
before insert or update on public.inventory_balances
for each row execute function private.guard_inventory_balance_write();
create trigger prevent_inventory_balance_delete
before delete on public.inventory_balances
for each row execute function private.prevent_inventory_mutation();

create trigger guard_inventory_command_update
before update on public.inventory_commands
for each row execute function private.guard_inventory_command_update();
create trigger prevent_inventory_command_delete
before delete on public.inventory_commands
for each row execute function private.prevent_inventory_mutation();

create trigger guard_inventory_event_insert
before insert on public.inventory_domain_events
for each row execute function private.guard_inventory_event_insert();
create trigger prevent_inventory_event_update_delete
before update or delete on public.inventory_domain_events
for each row execute function private.prevent_inventory_mutation();

create or replace function private.post_inventory_command(
  p_command_id uuid,
  p_organization_id uuid,
  p_command_type text,
  p_sku_id uuid,
  p_source_location_id uuid,
  p_destination_location_id uuid,
  p_quantity numeric,
  p_reason_code text,
  p_reason_note text,
  p_request_hash text,
  p_actor_user_id uuid,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_command public.inventory_commands%rowtype;
  v_sku public.skus%rowtype;
  v_source public.locations%rowtype;
  v_destination public.locations%rowtype;
  v_source_warehouse_status text;
  v_destination_warehouse_status text;
  v_source_branch_status text;
  v_destination_branch_status text;
  v_source_on_hand numeric(20,6);
  v_source_movement_id uuid;
  v_destination_movement_id uuid;
  v_correlation_id uuid;
  v_event_name text;
  v_result jsonb;
  v_reason_code text := lower(btrim(p_reason_code));
  v_reason_note text := nullif(btrim(p_reason_note), '');
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_command_id is null or p_organization_id is null or p_sku_id is null
     or p_actor_user_id is null then
    raise exception 'inventory_command_identity_required' using errcode = '22023';
  end if;
  if p_command_type not in ('receive', 'adjustment_in', 'adjustment_out', 'transfer') then
    raise exception 'inventory_command_type_invalid' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 99999999999999.999999 then
    raise exception 'inventory_quantity_invalid' using errcode = '22023';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'inventory_request_hash_invalid' using errcode = '22023';
  end if;
  if v_reason_code is null or v_reason_code !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception 'inventory_reason_code_invalid' using errcode = '22023';
  end if;
  if p_command_type in ('adjustment_in', 'adjustment_out')
     and char_length(coalesce(v_reason_note, '')) < 3 then
    raise exception 'inventory_adjustment_reason_note_required' using errcode = '22023';
  end if;

  insert into public.inventory_commands (
    id, organization_id, command_type, sku_id,
    source_location_id, destination_location_id, quantity,
    reason_code, reason_note, request_hash, actor_user_id
  ) values (
    p_command_id, p_organization_id, p_command_type, p_sku_id,
    p_source_location_id, p_destination_location_id, p_quantity,
    v_reason_code, v_reason_note, p_request_hash, p_actor_user_id
  )
  on conflict (id) do nothing;

  select c.* into strict v_command
  from public.inventory_commands c
  where c.id = p_command_id
  for update;

  if v_command.organization_id <> p_organization_id
     or v_command.request_hash <> p_request_hash then
    raise exception 'inventory_command_payload_conflict' using errcode = '23505';
  end if;
  if v_command.status = 'completed' then
    return v_command.result;
  end if;

  perform set_config('avenzo.inventory_command_id', p_command_id::text, true);

  select s.* into strict v_sku
  from public.skus s
  where s.organization_id = p_organization_id and s.id = p_sku_id;
  if v_sku.status <> 'active' then
    raise exception 'active_sku_required' using errcode = '23514';
  end if;

  if p_command_type in ('adjustment_out', 'transfer') then
    select l.* into strict v_source
    from public.locations l
    where l.organization_id = p_organization_id and l.id = p_source_location_id;
    select w.status, b.status
    into strict v_source_warehouse_status, v_source_branch_status
    from public.warehouses w
    join public.branches b
      on b.organization_id = w.organization_id and b.id = w.branch_id
    where w.organization_id = v_source.organization_id
      and w.id = v_source.warehouse_id;
    if v_source.status <> 'active'
       or v_source_warehouse_status <> 'active'
       or v_source_branch_status <> 'active' then
      raise exception 'active_source_location_required' using errcode = '23514';
    end if;
  elsif p_source_location_id is not null then
    raise exception 'inventory_source_location_invalid' using errcode = '22023';
  end if;

  if p_command_type in ('receive', 'adjustment_in', 'transfer') then
    select l.* into strict v_destination
    from public.locations l
    where l.organization_id = p_organization_id and l.id = p_destination_location_id;
    select w.status, b.status
    into strict v_destination_warehouse_status, v_destination_branch_status
    from public.warehouses w
    join public.branches b
      on b.organization_id = w.organization_id and b.id = w.branch_id
    where w.organization_id = v_destination.organization_id
      and w.id = v_destination.warehouse_id;
    if v_destination.status <> 'active'
       or v_destination_warehouse_status <> 'active'
       or v_destination_branch_status <> 'active' then
      raise exception 'active_destination_location_required' using errcode = '23514';
    end if;
  elsif p_destination_location_id is not null then
    raise exception 'inventory_destination_location_invalid' using errcode = '22023';
  end if;

  if p_command_type = 'transfer' and p_source_location_id = p_destination_location_id then
    raise exception 'inventory_transfer_locations_must_differ' using errcode = '22023';
  end if;

  if p_command_type in ('adjustment_out', 'transfer') then
    insert into public.inventory_balances (
      organization_id, branch_id, warehouse_id, location_id, sku_id
    ) values (
      p_organization_id, v_source.branch_id, v_source.warehouse_id,
      v_source.id, p_sku_id
    ) on conflict (organization_id, sku_id, location_id) do nothing;
  end if;
  if p_command_type in ('receive', 'adjustment_in', 'transfer') then
    insert into public.inventory_balances (
      organization_id, branch_id, warehouse_id, location_id, sku_id
    ) values (
      p_organization_id, v_destination.branch_id, v_destination.warehouse_id,
      v_destination.id, p_sku_id
    ) on conflict (organization_id, sku_id, location_id) do nothing;
  end if;

  perform 1
  from public.inventory_balances b
  where b.organization_id = p_organization_id
    and b.sku_id = p_sku_id
    and b.location_id in (p_source_location_id, p_destination_location_id)
  order by b.location_id
  for update;

  if p_command_type in ('adjustment_out', 'transfer') then
    select b.on_hand into strict v_source_on_hand
    from public.inventory_balances b
    where b.organization_id = p_organization_id
      and b.sku_id = p_sku_id
      and b.location_id = p_source_location_id;
    if v_source_on_hand < p_quantity then
      raise exception 'inventory_negative_stock_forbidden' using errcode = '23514';
    end if;
  end if;

  if p_command_type in ('receive', 'adjustment_in') then
    v_destination_movement_id := gen_random_uuid();
    insert into public.stock_movements (
      id, organization_id, branch_id, warehouse_id, location_id, sku_id,
      movement_type, quantity_delta, base_unit_code, reason_code, reason_note,
      command_id, sequence_no, actor_user_id, occurred_at
    ) values (
      v_destination_movement_id, p_organization_id, v_destination.branch_id,
      v_destination.warehouse_id, v_destination.id, p_sku_id,
      p_command_type, p_quantity, v_sku.base_unit_code, v_reason_code, v_reason_note,
      p_command_id, 1, p_actor_user_id, v_occurred_at
    );
    update public.inventory_balances
    set on_hand = on_hand + p_quantity,
        version = version + 1,
        last_movement_id = v_destination_movement_id,
        updated_at = v_occurred_at
    where organization_id = p_organization_id
      and sku_id = p_sku_id
      and location_id = v_destination.id;
    v_event_name := case when p_command_type = 'receive'
      then 'stock.received' else 'stock.adjusted' end;
    v_result := jsonb_build_object(
      'command_id', p_command_id,
      'movement_ids', jsonb_build_array(v_destination_movement_id),
      'destination_location_id', v_destination.id
    );
  elsif p_command_type = 'adjustment_out' then
    v_source_movement_id := gen_random_uuid();
    insert into public.stock_movements (
      id, organization_id, branch_id, warehouse_id, location_id, sku_id,
      movement_type, quantity_delta, base_unit_code, reason_code, reason_note,
      command_id, sequence_no, actor_user_id, occurred_at
    ) values (
      v_source_movement_id, p_organization_id, v_source.branch_id,
      v_source.warehouse_id, v_source.id, p_sku_id,
      'adjustment_out', -p_quantity, v_sku.base_unit_code,
      v_reason_code, v_reason_note, p_command_id, 1, p_actor_user_id, v_occurred_at
    );
    update public.inventory_balances
    set on_hand = on_hand - p_quantity,
        version = version + 1,
        last_movement_id = v_source_movement_id,
        updated_at = v_occurred_at
    where organization_id = p_organization_id
      and sku_id = p_sku_id
      and location_id = v_source.id;
    v_event_name := 'stock.adjusted';
    v_result := jsonb_build_object(
      'command_id', p_command_id,
      'movement_ids', jsonb_build_array(v_source_movement_id),
      'source_location_id', v_source.id
    );
  else
    v_correlation_id := gen_random_uuid();
    v_source_movement_id := gen_random_uuid();
    v_destination_movement_id := gen_random_uuid();
    insert into public.stock_movements (
      id, organization_id, branch_id, warehouse_id, location_id, sku_id,
      movement_type, quantity_delta, base_unit_code, reason_code, reason_note,
      command_id, sequence_no, correlation_id, actor_user_id, occurred_at
    ) values
      (
        v_source_movement_id, p_organization_id, v_source.branch_id,
        v_source.warehouse_id, v_source.id, p_sku_id,
        'transfer_out', -p_quantity, v_sku.base_unit_code,
        v_reason_code, v_reason_note, p_command_id, 1, v_correlation_id,
        p_actor_user_id, v_occurred_at
      ),
      (
        v_destination_movement_id, p_organization_id, v_destination.branch_id,
        v_destination.warehouse_id, v_destination.id, p_sku_id,
        'transfer_in', p_quantity, v_sku.base_unit_code,
        v_reason_code, v_reason_note, p_command_id, 2, v_correlation_id,
        p_actor_user_id, v_occurred_at
      );
    update public.inventory_balances
    set on_hand = on_hand - p_quantity,
        version = version + 1,
        last_movement_id = v_source_movement_id,
        updated_at = v_occurred_at
    where organization_id = p_organization_id
      and sku_id = p_sku_id
      and location_id = v_source.id;
    update public.inventory_balances
    set on_hand = on_hand + p_quantity,
        version = version + 1,
        last_movement_id = v_destination_movement_id,
        updated_at = v_occurred_at
    where organization_id = p_organization_id
      and sku_id = p_sku_id
      and location_id = v_destination.id;
    v_event_name := 'stock.transferred';
    v_result := jsonb_build_object(
      'command_id', p_command_id,
      'movement_ids', jsonb_build_array(v_source_movement_id, v_destination_movement_id),
      'correlation_id', v_correlation_id,
      'source_location_id', v_source.id,
      'destination_location_id', v_destination.id
    );
  end if;

  insert into public.inventory_domain_events (
    organization_id, branch_id, event_name, command_id, sku_id,
    actor_user_id, metadata, occurred_at
  ) values (
    p_organization_id,
    coalesce(v_source.branch_id, v_destination.branch_id),
    v_event_name,
    p_command_id,
    p_sku_id,
    p_actor_user_id,
    v_result - 'command_id',
    v_occurred_at
  );

  update public.inventory_commands
  set status = 'completed', result = v_result, completed_at = now()
  where organization_id = p_organization_id and id = p_command_id;

  perform set_config('avenzo.inventory_command_id', '', true);
  return v_result;
end;
$$;

create or replace function private.prevent_nonzero_inventory_archive()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_on_hand numeric(20,6);
begin
  if new.status = 'archived' and old.status <> 'archived' then
    if tg_table_name = 'skus' then
      select coalesce(sum(b.on_hand), 0) into v_on_hand
      from public.inventory_balances b
      where b.organization_id = new.organization_id and b.sku_id = new.id;
    elsif tg_table_name = 'warehouses' then
      select coalesce(sum(b.on_hand), 0) into v_on_hand
      from public.inventory_balances b
      where b.organization_id = new.organization_id and b.warehouse_id = new.id;
    else
      select coalesce(sum(b.on_hand), 0) into v_on_hand
      from public.inventory_balances b
      where b.organization_id = new.organization_id and b.location_id = new.id;
    end if;
    if v_on_hand <> 0 then
      raise exception 'nonzero_inventory_prevents_archive' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger prevent_nonzero_sku_archive
before update on public.skus
for each row execute function private.prevent_nonzero_inventory_archive();
create trigger prevent_nonzero_warehouse_archive
before update on public.warehouses
for each row execute function private.prevent_nonzero_inventory_archive();
create trigger prevent_nonzero_location_archive
before update on public.locations
for each row execute function private.prevent_nonzero_inventory_archive();

revoke all on function private.require_inventory_write_context(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.guard_inventory_movement_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_inventory_balance_write()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_inventory_command_update()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_inventory_event_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.prevent_inventory_mutation()
  from public, anon, authenticated, service_role;
revoke all on function private.post_inventory_command(
  uuid, uuid, text, uuid, uuid, uuid, numeric, text, text, text, uuid, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function private.prevent_nonzero_inventory_archive()
  from public, anon, authenticated, service_role;

alter table public.inventory_commands enable row level security;
alter table public.stock_movements enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_domain_events enable row level security;

revoke all privileges on table
  public.inventory_commands,
  public.stock_movements,
  public.inventory_balances,
  public.inventory_domain_events
from public, anon, authenticated;

comment on table public.stock_movements is
  'Immutable source-of-truth inventory ledger. Corrections require compensating movements.';
comment on table public.inventory_balances is
  'Derived current balance; writable only inside the private inventory command transaction.';
comment on function private.post_inventory_command(
  uuid, uuid, text, uuid, uuid, uuid, numeric, text, text, text, uuid, timestamptz
) is 'Internal atomic posting primitive. Phase 2.0.4 will add the authorized server boundary.';
