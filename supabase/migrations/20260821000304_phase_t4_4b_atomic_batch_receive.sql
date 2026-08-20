-- Phase T4.4B: atomic 1-100 SKU/Location initial-stock receive.
-- Forward-only local draft. Remote apply and deployment are not authorized.

begin;

do $preflight$
declare
  v_relation text;
begin
  foreach v_relation in array array[
    'public.organizations', 'public.branches', 'public.products', 'public.skus',
    'public.warehouses', 'public.locations', 'public.inventory_commands',
    'public.stock_movements', 'public.inventory_balances',
    'public.inventory_domain_events', 'public.permissions'
  ] loop
    if to_regclass(v_relation) is null then
      raise exception 't4_4b_missing_baseline_relation:%', v_relation;
    end if;
  end loop;

  if to_regprocedure(
       'private.post_inventory_command(uuid,uuid,text,uuid,uuid,uuid,numeric,text,text,text,uuid,timestamp with time zone)'
     ) is null
     or to_regprocedure(
       'private.server_actor_has_org_permission(uuid,uuid,text,uuid)'
     ) is null
     or to_regprocedure(
       'private.has_org_permission(uuid,text,uuid)'
     ) is null
     or to_regprocedure(
       'public.server_post_inventory_command(uuid,uuid,text,uuid,uuid,uuid,numeric,text,text,text,uuid,timestamp with time zone)'
     ) is null then
    raise exception 't4_4b_missing_inventory_or_permission_boundary';
  end if;

  if not exists (
    select 1 from public.permissions
    where code = 'inventory.receive' and scope_kind = 'branch'
  ) or not exists (
    select 1 from public.permissions
    where code = 'inventory_batch.read' and scope_kind = 'branch'
  ) then
    raise exception 't4_4b_permission_contract_missing';
  end if;

  if to_regclass('public.inventory_receive_batches') is not null
     or to_regclass('public.inventory_receive_batch_items') is not null
     or to_regprocedure(
       'public.server_receive_inventory_batch(jsonb,uuid)'
     ) is not null then
    raise exception 't4_4b_batch_surface_already_exists';
  end if;

  if to_regclass('public.inventory_locations') is not null
     or to_regclass('public.inventory_movements') is not null then
    raise exception 't4_4b_duplicate_inventory_alias_detected';
  end if;
end
$preflight$;

-- Preserve the approved Owner-only inventory_batch.read baseline for both
-- existing and future Organizations. Admin receives no automatic Batch read.
insert into public.role_permissions (role_id, permission_code)
select r.id, 'inventory_batch.read'
from public.organization_roles r
where r.code = 'owner'
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
      'product.read', 'product.manage',
      'product.create', 'product.update', 'product.archive',
      'sku.read', 'warehouse.read', 'warehouse.manage', 'location.read',
      'inventory.read', 'inventory.receive', 'inventory.adjust',
      'inventory.transfer', 'inventory_movement.read', 'inventory_audit.read'
    )
    on conflict (role_id, permission_code) do nothing;
  end if;

  if new.code = 'owner' then
    insert into public.role_permissions (role_id, permission_code)
    select new.id, permission.permission_code
    from (values
      ('permission_override.manage'),
      ('inventory_batch.read')
    ) permission(permission_code)
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.seed_foundation_domain_role_permissions()
  from public, anon, authenticated, service_role;

create table public.inventory_receive_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  batch_type text not null default 'initial_receive',
  idempotency_key uuid not null,
  request_hash_version smallint not null default 1,
  request_hash text not null,
  reference text,
  reason_code text not null,
  reason_note text,
  item_count smallint not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'processing',
  result jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint inventory_receive_batches_tenant_id_unique
    unique (organization_id, id),
  constraint inventory_receive_batches_scope_id_unique
    unique (organization_id, branch_id, id),
  constraint inventory_receive_batches_idempotency_unique
    unique (organization_id, batch_type, idempotency_key),
  constraint inventory_receive_batches_branch_fk
    foreign key (organization_id, branch_id)
    references public.branches (organization_id, id) on delete restrict,
  constraint inventory_receive_batches_type_check
    check (batch_type = 'initial_receive'),
  constraint inventory_receive_batches_hash_version_check
    check (request_hash_version = 1),
  constraint inventory_receive_batches_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint inventory_receive_batches_reference_check
    check (
      reference is null
      or (
        reference = btrim(reference)
        and char_length(reference) between 1 and 255
        and reference !~ '[[:cntrl:]]'
      )
    ),
  constraint inventory_receive_batches_reason_code_check
    check (
      reason_code = lower(btrim(reason_code))
      and reason_code ~ '^[a-z][a-z0-9_]{0,63}$'
    ),
  constraint inventory_receive_batches_reason_note_check
    check (
      reason_note is null
      or (
        reason_note = btrim(reason_note)
        and char_length(reason_note) between 1 and 1000
        and reason_note !~ '[[:cntrl:]]'
      )
    ),
  constraint inventory_receive_batches_item_count_check
    check (item_count between 1 and 100),
  constraint inventory_receive_batches_status_check
    check (status in ('processing', 'completed')),
  constraint inventory_receive_batches_completion_check
    check (
      (status = 'processing' and result is null and completed_at is null)
      or (
        status = 'completed'
        and result is not null
        and jsonb_typeof(result) = 'object'
        and completed_at is not null
      )
    )
);

create table public.inventory_receive_batch_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  batch_id uuid not null,
  line_no smallint not null,
  sku_id uuid not null,
  warehouse_id uuid not null,
  location_id uuid not null,
  quantity numeric(20,6) not null,
  base_unit_code text not null,
  inventory_command_id uuid not null,
  created_at timestamptz not null default now(),
  constraint inventory_receive_batch_items_tenant_id_unique
    unique (organization_id, id),
  constraint inventory_receive_batch_items_batch_fk
    foreign key (organization_id, branch_id, batch_id)
    references public.inventory_receive_batches (organization_id, branch_id, id)
    on delete restrict,
  constraint inventory_receive_batch_items_sku_fk
    foreign key (organization_id, sku_id)
    references public.skus (organization_id, id) on delete restrict,
  constraint inventory_receive_batch_items_location_fk
    foreign key (organization_id, branch_id, warehouse_id, location_id)
    references public.locations (organization_id, branch_id, warehouse_id, id)
    on delete restrict,
  constraint inventory_receive_batch_items_command_fk
    foreign key (organization_id, inventory_command_id)
    references public.inventory_commands (organization_id, id) on delete restrict,
  constraint inventory_receive_batch_items_line_unique
    unique (organization_id, batch_id, line_no),
  constraint inventory_receive_batch_items_pair_unique
    unique (organization_id, batch_id, sku_id, location_id),
  constraint inventory_receive_batch_items_command_unique
    unique (organization_id, inventory_command_id),
  constraint inventory_receive_batch_items_line_check
    check (line_no between 1 and 100),
  constraint inventory_receive_batch_items_quantity_check
    check (quantity > 0 and quantity <= 99999999999999.999999),
  constraint inventory_receive_batch_items_base_unit_check
    check (
      base_unit_code = lower(btrim(base_unit_code))
      and base_unit_code ~ '^[a-z][a-z0-9_]{0,31}$'
    )
);

create index inventory_receive_batches_scope_time_idx
  on public.inventory_receive_batches (
    organization_id, branch_id, created_at desc, id desc
  );
create index inventory_receive_batches_actor_idx
  on public.inventory_receive_batches (actor_user_id);
create index inventory_receive_batch_items_batch_idx
  on public.inventory_receive_batch_items (
    organization_id, branch_id, batch_id, line_no
  );
create index inventory_receive_batch_items_sku_location_idx
  on public.inventory_receive_batch_items (
    organization_id, sku_id, location_id, created_at desc
  );
create index inventory_receive_batch_items_location_scope_idx
  on public.inventory_receive_batch_items (
    organization_id, branch_id, warehouse_id, location_id
  );

create or replace function private.require_inventory_receive_batch_context(
  p_organization_id uuid,
  p_batch_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_context text;
begin
  v_context := current_setting('avenzo.inventory_receive_batch_id', true);
  if v_context is null or v_context = '' or v_context::uuid <> p_batch_id then
    raise exception 'inventory_receive_batch_context_required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.inventory_receive_batches b
    where b.organization_id = p_organization_id
      and b.id = p_batch_id
      and b.status = 'processing'
  ) then
    raise exception 'processing_inventory_receive_batch_required'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.guard_inventory_receive_batch_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_inventory_receive_batch_context(
    old.organization_id, old.id
  );

  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.branch_id is distinct from old.branch_id
     or new.batch_type is distinct from old.batch_type
     or new.idempotency_key is distinct from old.idempotency_key
     or new.request_hash_version is distinct from old.request_hash_version
     or new.request_hash is distinct from old.request_hash
     or new.reference is distinct from old.reference
     or new.reason_code is distinct from old.reason_code
     or new.reason_note is distinct from old.reason_note
     or new.item_count is distinct from old.item_count
     or new.actor_user_id is distinct from old.actor_user_id
     or new.occurred_at is distinct from old.occurred_at
     or new.created_at is distinct from old.created_at then
    raise exception 'inventory_receive_batch_envelope_is_immutable'
      using errcode = '22023';
  end if;

  if old.status <> 'processing' or new.status <> 'completed'
     or new.result is null or new.completed_at is null then
    raise exception 'invalid_inventory_receive_batch_transition'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create or replace function private.guard_inventory_receive_batch_item_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_inventory_receive_batch_context(
    new.organization_id, new.batch_id
  );
  return new;
end;
$$;

create trigger guard_inventory_receive_batch_update
before update on public.inventory_receive_batches
for each row execute function private.guard_inventory_receive_batch_update();
create trigger prevent_inventory_receive_batch_delete
before delete on public.inventory_receive_batches
for each row execute function private.prevent_inventory_mutation();
create trigger guard_inventory_receive_batch_item_insert
before insert on public.inventory_receive_batch_items
for each row execute function private.guard_inventory_receive_batch_item_insert();
create trigger prevent_inventory_receive_batch_item_update_delete
before update or delete on public.inventory_receive_batch_items
for each row execute function private.prevent_inventory_mutation();

revoke all on function private.require_inventory_receive_batch_context(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.guard_inventory_receive_batch_update()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_inventory_receive_batch_item_insert()
  from public, anon, authenticated, service_role;

alter table public.inventory_receive_batches enable row level security;
alter table public.inventory_receive_batch_items enable row level security;

create policy inventory_receive_batches_permission_select
on public.inventory_receive_batches for select to authenticated
using ((select private.has_org_permission(
  organization_id, 'inventory_batch.read', branch_id
)));

create policy inventory_receive_batch_items_permission_select
on public.inventory_receive_batch_items for select to authenticated
using ((select private.has_org_permission(
  organization_id, 'inventory_batch.read', branch_id
)));

revoke all privileges on table
  public.inventory_receive_batches,
  public.inventory_receive_batch_items
from public, anon, authenticated, service_role;
grant select on table
  public.inventory_receive_batches,
  public.inventory_receive_batch_items
to authenticated;

-- Harden the existing trusted single-SKU receive boundary without editing its
-- historical migration. Completed idempotent replays remain valid even after a
-- later lifecycle change; every new receive requires an active non-Bundle
-- Product and active SKU.
create or replace function public.server_post_inventory_command(
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
security definer
set search_path = ''
as $$
declare
  v_source_branch_id uuid;
  v_destination_branch_id uuid;
  v_existing_organization_id uuid;
  v_existing_request_hash text;
  v_existing_status text;
  v_existing_found boolean := false;
begin
  if p_actor_user_id is null then
    raise exception 'inventory_actor_required' using errcode = '42501';
  end if;

  if p_source_location_id is not null then
    select l.branch_id into v_source_branch_id
    from public.locations l
    where l.organization_id = p_organization_id
      and l.id = p_source_location_id;
    if not found then
      raise exception 'inventory_source_location_not_found' using errcode = '22023';
    end if;
  end if;

  if p_destination_location_id is not null then
    select l.branch_id into v_destination_branch_id
    from public.locations l
    where l.organization_id = p_organization_id
      and l.id = p_destination_location_id;
    if not found then
      raise exception 'inventory_destination_location_not_found' using errcode = '22023';
    end if;
  end if;

  if p_command_type = 'receive' then
    if v_destination_branch_id is null
       or not private.server_actor_has_org_permission(
         p_actor_user_id, p_organization_id, 'inventory.receive', v_destination_branch_id
       ) then
      raise exception 'inventory_receive_permission_required' using errcode = '42501';
    end if;
  elsif p_command_type in ('adjustment_in', 'adjustment_out') then
    if not private.server_actor_has_org_permission(
      p_actor_user_id,
      p_organization_id,
      'inventory.adjust',
      coalesce(v_source_branch_id, v_destination_branch_id)
    ) then
      raise exception 'inventory_adjust_permission_required' using errcode = '42501';
    end if;
  elsif p_command_type = 'transfer' then
    if v_source_branch_id is null or v_destination_branch_id is null
       or not private.server_actor_has_org_permission(
         p_actor_user_id, p_organization_id, 'inventory.transfer', v_source_branch_id
       )
       or not private.server_actor_has_org_permission(
         p_actor_user_id, p_organization_id, 'inventory.transfer', v_destination_branch_id
       ) then
      raise exception 'inventory_transfer_permission_required_for_both_branches'
        using errcode = '42501';
    end if;
  else
    raise exception 'inventory_command_type_invalid' using errcode = '22023';
  end if;

  select c.organization_id, c.request_hash, c.status
  into v_existing_organization_id, v_existing_request_hash, v_existing_status
  from public.inventory_commands c
  where c.id = p_command_id;
  v_existing_found := found;

  if v_existing_found
     and (
       v_existing_organization_id <> p_organization_id
       or v_existing_request_hash <> p_request_hash
     ) then
    raise exception 'inventory_command_payload_conflict' using errcode = '23505';
  end if;

  if p_command_type = 'receive'
     and (not v_existing_found or v_existing_status <> 'completed')
     and not exists (
       select 1
       from public.skus s
       join public.products p
         on p.organization_id = s.organization_id
        and p.id = s.product_id
       where s.organization_id = p_organization_id
         and s.id = p_sku_id
         and s.status = 'active'
         and p.status = 'active'
         and p.structure_type in ('standard', 'variant')
     ) then
    raise exception 'inventory_receive_item_not_receivable' using errcode = '23514';
  end if;

  return private.post_inventory_command(
    p_command_id,
    p_organization_id,
    p_command_type,
    p_sku_id,
    p_source_location_id,
    p_destination_location_id,
    p_quantity,
    p_reason_code,
    p_reason_note,
    p_request_hash,
    p_actor_user_id,
    p_occurred_at
  );
end;
$$;

revoke all on function public.server_post_inventory_command(
  uuid, uuid, text, uuid, uuid, uuid, numeric, text, text, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.server_post_inventory_command(
  uuid, uuid, text, uuid, uuid, uuid, numeric, text, text, text, uuid, timestamptz
) to service_role;

create or replace function public.server_receive_inventory_batch(
  p_request jsonb,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract_version integer;
  v_organization_id uuid;
  v_branch_id uuid;
  v_idempotency_key uuid;
  v_reference text;
  v_reason_code text;
  v_reason_note text;
  v_requested_occurred_at timestamptz;
  v_canonical_occurred_at text;
  v_occurred_at timestamptz;
  v_item_count integer;
  v_canonical_items jsonb;
  v_canonical_request jsonb;
  v_request_hash text;
  v_new_batch_id uuid := gen_random_uuid();
  v_batch public.inventory_receive_batches%rowtype;
  v_validated_items jsonb := '[]'::jsonb;
  v_result_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_line_no integer := 0;
  v_sku_id uuid;
  v_location_id uuid;
  v_warehouse_id uuid;
  v_quantity numeric;
  v_base_unit_code text;
  v_quantity_scale smallint;
  v_requested_unit_code text;
  v_command_id uuid;
  v_batch_item_id uuid;
  v_command_hash text;
  v_post_result jsonb;
  v_movement_id uuid;
  v_balance_version bigint;
  v_on_hand numeric(20,6);
  v_completed_at timestamptz;
  v_result jsonb;
  v_lineage_count integer;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object'
     or p_actor_user_id is null then
    raise exception 'batch_receive_request_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_request) as request_key(key)
    where request_key.key not in (
      'contract_version', 'organization_id', 'branch_id', 'idempotency_key',
      'reference', 'reason_code', 'reason_note', 'occurred_at', 'items'
    )
  ) or not (p_request ?& array[
    'contract_version', 'organization_id', 'branch_id',
    'idempotency_key', 'reason_code', 'items'
  ]) then
    raise exception 'batch_receive_request_invalid' using errcode = '22023';
  end if;

  if jsonb_typeof(p_request -> 'contract_version') <> 'number'
     or jsonb_typeof(p_request -> 'organization_id') <> 'string'
     or jsonb_typeof(p_request -> 'branch_id') <> 'string'
     or jsonb_typeof(p_request -> 'idempotency_key') <> 'string'
     or jsonb_typeof(p_request -> 'reason_code') <> 'string'
     or jsonb_typeof(p_request -> 'items') <> 'array'
     or (
       p_request ? 'reference'
       and jsonb_typeof(p_request -> 'reference') not in ('string', 'null')
     )
     or (
       p_request ? 'reason_note'
       and jsonb_typeof(p_request -> 'reason_note') not in ('string', 'null')
     )
     or (
       p_request ? 'occurred_at'
       and jsonb_typeof(p_request -> 'occurred_at') not in ('string', 'null')
     ) then
    raise exception 'batch_receive_request_invalid' using errcode = '22023';
  end if;

  v_item_count := jsonb_array_length(p_request -> 'items');
  if v_item_count < 1 or v_item_count > 100 then
    raise exception 'batch_receive_item_count_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_request -> 'items') as input_item(value)
    where jsonb_typeof(input_item.value) <> 'object'
       or not (input_item.value ?& array[
         'sku_id', 'location_id', 'quantity', 'unit_code'
       ])
       or exists (
         select 1
         from jsonb_object_keys(input_item.value) as item_key(key)
         where item_key.key not in (
           'sku_id', 'location_id', 'quantity', 'unit_code'
         )
       )
       or jsonb_typeof(input_item.value -> 'sku_id') <> 'string'
       or jsonb_typeof(input_item.value -> 'location_id') <> 'string'
       or jsonb_typeof(input_item.value -> 'quantity') <> 'number'
       or jsonb_typeof(input_item.value -> 'unit_code') <> 'string'
  ) then
    raise exception 'batch_receive_request_invalid' using errcode = '22023';
  end if;

  begin
    v_contract_version := (p_request ->> 'contract_version')::integer;
    v_organization_id := (p_request ->> 'organization_id')::uuid;
    v_branch_id := (p_request ->> 'branch_id')::uuid;
    v_idempotency_key := (p_request ->> 'idempotency_key')::uuid;
    v_reference := nullif(btrim(p_request ->> 'reference'), '');
    v_reason_code := lower(btrim(p_request ->> 'reason_code'));
    v_reason_note := nullif(btrim(p_request ->> 'reason_note'), '');

    if p_request ? 'occurred_at'
       and jsonb_typeof(p_request -> 'occurred_at') <> 'null' then
      if (p_request ->> 'occurred_at')
         !~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$' then
        raise exception 'batch_receive_request_invalid' using errcode = '22023';
      end if;
      v_requested_occurred_at := (p_request ->> 'occurred_at')::timestamptz;
    end if;

    if exists (
      select 1
      from jsonb_array_elements(p_request -> 'items') as input_item(value)
      where (input_item.value ->> 'quantity')::numeric <= 0
         or (input_item.value ->> 'quantity')::numeric
            > 99999999999999.999999
         or (input_item.value ->> 'quantity')::numeric
            <> round((input_item.value ->> 'quantity')::numeric, 6)
    ) then
      raise exception 'batch_receive_quantity_invalid' using errcode = '22023';
    end if;

    select jsonb_agg(
      jsonb_build_object(
        'sku_id', (input_item.value ->> 'sku_id')::uuid,
        'location_id', (input_item.value ->> 'location_id')::uuid,
        'quantity', round((input_item.value ->> 'quantity')::numeric, 6),
        'unit_code', lower(btrim(input_item.value ->> 'unit_code'))
      )
      order by
        (input_item.value ->> 'sku_id')::uuid,
        (input_item.value ->> 'location_id')::uuid
    )
    into strict v_canonical_items
    from jsonb_array_elements(p_request -> 'items') as input_item(value);
  exception
    when invalid_text_representation
      or numeric_value_out_of_range
      or datetime_field_overflow then
      raise exception 'batch_receive_request_invalid' using errcode = '22023';
  end;

  if v_contract_version <> 1
     or v_organization_id is null
     or v_branch_id is null
     or v_idempotency_key is null
     or v_reason_code is null
     or v_reason_code !~ '^[a-z][a-z0-9_]{0,63}$'
     or char_length(coalesce(v_reference, '')) > 255
     or char_length(coalesce(v_reason_note, '')) > 1000
     or coalesce(v_reference, '') ~ '[[:cntrl:]]'
     or coalesce(v_reason_note, '') ~ '[[:cntrl:]]' then
    raise exception 'batch_receive_request_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_canonical_items) as item(value)
    where (item.value ->> 'quantity')::numeric <= 0
       or (item.value ->> 'quantity')::numeric > 99999999999999.999999
  ) then
    raise exception 'batch_receive_quantity_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_canonical_items) as item(value)
    where lower(btrim(item.value ->> 'unit_code'))
          !~ '^[a-z][a-z0-9_]{0,31}$'
  ) then
    raise exception 'batch_receive_unit_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select
        (item.value ->> 'sku_id')::uuid as sku_id,
        (item.value ->> 'location_id')::uuid as location_id,
        count(*) as duplicate_count
      from jsonb_array_elements(v_canonical_items) as item(value)
      group by 1, 2
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'batch_receive_duplicate_sku_location' using errcode = '22023';
  end if;

  v_canonical_occurred_at := case
    when v_requested_occurred_at is null then null
    else to_char(
      v_requested_occurred_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  end;
  v_occurred_at := coalesce(v_requested_occurred_at, statement_timestamp());

  v_canonical_request := jsonb_build_object(
    'contract_version', 1,
    'request_hash_version', 1,
    'batch_type', 'initial_receive',
    'organization_id', v_organization_id,
    'branch_id', v_branch_id,
    'actor_user_id', p_actor_user_id,
    'reference', v_reference,
    'reason_code', v_reason_code,
    'reason_note', v_reason_note,
    'occurred_at', v_canonical_occurred_at,
    'items', v_canonical_items
  );
  v_request_hash := encode(extensions.digest(
    convert_to(v_canonical_request::text, 'UTF8'), 'sha256'
  ), 'hex');

  perform 1
  from public.organizations o
  where o.id = v_organization_id and o.status = 'active'
  for key share;
  if not found then
    raise exception 'batch_receive_scope_not_accessible' using errcode = '42501';
  end if;

  perform 1
  from public.branches b
  where b.organization_id = v_organization_id
    and b.id = v_branch_id
    and b.status = 'active'
  for key share;
  if not found then
    raise exception 'batch_receive_scope_not_accessible' using errcode = '42501';
  end if;

  if not private.server_actor_has_org_permission(
    p_actor_user_id, v_organization_id, 'inventory.receive', v_branch_id
  ) then
    raise exception 'batch_receive_permission_required' using errcode = '42501';
  end if;

  insert into public.inventory_receive_batches (
    id, organization_id, branch_id, batch_type, idempotency_key,
    request_hash_version, request_hash, reference, reason_code, reason_note,
    item_count, actor_user_id, occurred_at
  ) values (
    v_new_batch_id, v_organization_id, v_branch_id, 'initial_receive',
    v_idempotency_key, 1, v_request_hash, v_reference, v_reason_code,
    v_reason_note, v_item_count, p_actor_user_id, v_occurred_at
  )
  on conflict (organization_id, batch_type, idempotency_key) do nothing;

  select b.* into strict v_batch
  from public.inventory_receive_batches b
  where b.organization_id = v_organization_id
    and b.batch_type = 'initial_receive'
    and b.idempotency_key = v_idempotency_key
  for update;

  if v_batch.request_hash <> v_request_hash then
    raise exception 'batch_receive_idempotency_conflict' using errcode = '23505';
  end if;
  if v_batch.status = 'completed' then
    return v_batch.result;
  end if;
  if v_batch.id <> v_new_batch_id then
    raise exception 'batch_receive_incomplete_state' using errcode = 'P0001';
  end if;

  perform set_config(
    'avenzo.inventory_receive_batch_id', v_batch.id::text, true
  );

  -- Validate and lock the complete graph before the first Movement/Balance write.
  v_line_no := 0;
  for v_item in
    select item.value
    from jsonb_array_elements(v_canonical_items) as item(value)
  loop
    v_line_no := v_line_no + 1;
    v_sku_id := (v_item ->> 'sku_id')::uuid;
    v_location_id := (v_item ->> 'location_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_requested_unit_code := v_item ->> 'unit_code';

    select s.base_unit_code, s.quantity_scale
    into v_base_unit_code, v_quantity_scale
    from public.skus s
    join public.products p
      on p.organization_id = s.organization_id
     and p.id = s.product_id
    where s.organization_id = v_organization_id
      and s.id = v_sku_id
      and s.status = 'active'
      and p.status = 'active'
      and p.structure_type in ('standard', 'variant')
    for key share of s, p;
    if not found then
      raise exception 'batch_receive_item_not_receivable'
        using errcode = '23514',
          detail = jsonb_build_object('line_no', v_line_no)::text;
    end if;

    if v_requested_unit_code <> v_base_unit_code then
      raise exception 'batch_receive_unit_invalid'
        using errcode = '22023',
          detail = jsonb_build_object('line_no', v_line_no)::text;
    end if;
    if v_quantity <= 0
       or v_quantity > 99999999999999.999999
       or v_quantity <> round(v_quantity, v_quantity_scale) then
      raise exception 'batch_receive_quantity_invalid'
        using errcode = '22023',
          detail = jsonb_build_object('line_no', v_line_no)::text;
    end if;

    select l.warehouse_id
    into v_warehouse_id
    from public.locations l
    join public.warehouses w
      on w.organization_id = l.organization_id
     and w.branch_id = l.branch_id
     and w.id = l.warehouse_id
    join public.branches b
      on b.organization_id = l.organization_id
     and b.id = l.branch_id
    where l.organization_id = v_organization_id
      and l.branch_id = v_branch_id
      and l.id = v_location_id
      and l.status = 'active'
      and w.status = 'active'
      and b.status = 'active'
    for key share of l, w, b;
    if not found then
      raise exception 'batch_receive_scope_not_accessible'
        using errcode = '42501',
          detail = jsonb_build_object('line_no', v_line_no)::text;
    end if;

    v_validated_items := v_validated_items || jsonb_build_array(
      jsonb_build_object(
        'line_no', v_line_no,
        'sku_id', v_sku_id,
        'warehouse_id', v_warehouse_id,
        'location_id', v_location_id,
        'quantity', v_quantity::numeric(20,6),
        'base_unit_code', v_base_unit_code
      )
    );
  end loop;

  if not private.server_actor_has_org_permission(
    p_actor_user_id, v_organization_id, 'inventory.receive', v_branch_id
  ) then
    raise exception 'batch_receive_permission_required' using errcode = '42501';
  end if;

  for v_item in
    select item.value
    from jsonb_array_elements(v_validated_items) as item(value)
    order by (item.value ->> 'line_no')::integer
  loop
    v_line_no := (v_item ->> 'line_no')::integer;
    v_sku_id := (v_item ->> 'sku_id')::uuid;
    v_warehouse_id := (v_item ->> 'warehouse_id')::uuid;
    v_location_id := (v_item ->> 'location_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_base_unit_code := v_item ->> 'base_unit_code';
    v_command_id := gen_random_uuid();
    v_command_hash := encode(extensions.digest(convert_to(
      jsonb_build_object(
        'batch_request_hash', v_request_hash,
        'line_no', v_line_no,
        'sku_id', v_sku_id,
        'location_id', v_location_id,
        'quantity', v_quantity,
        'base_unit_code', v_base_unit_code
      )::text,
      'UTF8'
    ), 'sha256'), 'hex');

    v_post_result := private.post_inventory_command(
      v_command_id,
      v_organization_id,
      'receive',
      v_sku_id,
      null,
      v_location_id,
      v_quantity,
      v_reason_code,
      v_reason_note,
      v_command_hash,
      p_actor_user_id,
      v_occurred_at
    );
    v_movement_id := (v_post_result -> 'movement_ids' ->> 0)::uuid;

    insert into public.inventory_receive_batch_items (
      organization_id, branch_id, batch_id, line_no, sku_id,
      warehouse_id, location_id, quantity, base_unit_code,
      inventory_command_id
    ) values (
      v_organization_id, v_branch_id, v_batch.id, v_line_no, v_sku_id,
      v_warehouse_id, v_location_id, v_quantity, v_base_unit_code,
      v_command_id
    )
    returning id into strict v_batch_item_id;

    select balance.version, balance.on_hand
    into strict v_balance_version, v_on_hand
    from public.inventory_balances balance
    where balance.organization_id = v_organization_id
      and balance.sku_id = (v_item ->> 'sku_id')::uuid
      and balance.location_id = v_location_id;

    v_result_items := v_result_items || jsonb_build_array(
      jsonb_build_object(
        'batch_item_id', v_batch_item_id,
        'sku_id', (v_item ->> 'sku_id')::uuid,
        'warehouse_id', v_warehouse_id,
        'location_id', v_location_id,
        'quantity', v_quantity::numeric(20,6),
        'base_unit_code', v_base_unit_code,
        'inventory_command_id', v_command_id,
        'movement_id', v_movement_id,
        'balance_version', v_balance_version,
        'on_hand', v_on_hand
      )
    );
  end loop;

  select count(*) into v_lineage_count
  from public.inventory_receive_batch_items bi
  join public.inventory_commands c
    on c.organization_id = bi.organization_id
   and c.id = bi.inventory_command_id
  join public.stock_movements m
    on m.organization_id = c.organization_id
   and m.command_id = c.id
   and m.sequence_no = 1
  join public.inventory_domain_events e
    on e.organization_id = c.organization_id
   and e.command_id = c.id
  where bi.organization_id = v_organization_id
    and bi.batch_id = v_batch.id
    and c.command_type = 'receive'
    and c.status = 'completed'
    and c.sku_id = bi.sku_id
    and c.destination_location_id = bi.location_id
    and c.quantity = bi.quantity
    and c.actor_user_id = p_actor_user_id
    and m.movement_type = 'receive'
    and m.sku_id = bi.sku_id
    and m.branch_id = bi.branch_id
    and m.warehouse_id = bi.warehouse_id
    and m.location_id = bi.location_id
    and m.quantity_delta = bi.quantity
    and m.base_unit_code = bi.base_unit_code
    and m.actor_user_id = p_actor_user_id
    and e.event_name = 'stock.received'
    and e.branch_id = bi.branch_id
    and e.sku_id = bi.sku_id
    and e.actor_user_id = p_actor_user_id;

  if v_lineage_count <> v_item_count
     or (select count(*) from public.inventory_receive_batch_items bi
         where bi.organization_id = v_organization_id
           and bi.batch_id = v_batch.id) <> v_item_count then
    raise exception 'batch_receive_incomplete_state' using errcode = 'P0001';
  end if;

  v_completed_at := clock_timestamp();
  v_result := jsonb_build_object(
    'contract_version', 1,
    'batch_id', v_batch.id,
    'batch_type', 'initial_receive',
    'organization_id', v_organization_id,
    'branch_id', v_branch_id,
    'idempotency_key', v_idempotency_key,
    'request_hash', v_request_hash,
    'status', 'completed',
    'item_count', v_item_count,
    'occurred_at', v_occurred_at,
    'committed_at', v_completed_at,
    'items', v_result_items
  );

  update public.inventory_receive_batches
  set status = 'completed', result = v_result, completed_at = v_completed_at
  where organization_id = v_organization_id and id = v_batch.id;

  perform set_config('avenzo.inventory_receive_batch_id', '', true);
  return v_result;
end;
$$;

revoke all on function public.server_receive_inventory_batch(jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.server_receive_inventory_batch(jsonb, uuid)
  to service_role;

comment on table public.inventory_receive_batches is
  'T4.4 immutable atomic 1-100 Item Initial Stock receive header and idempotency authority.';
comment on table public.inventory_receive_batch_items is
  'T4.4 immutable Batch Item linked one-to-one to an existing receive Inventory Command.';
comment on function public.server_receive_inventory_batch(jsonb, uuid) is
  'Service-role-only atomic Initial Stock Batch boundary. Explicit actor inventory.receive authority is required.';

do $postflight$
begin
  if to_regclass('public.inventory_receive_batches') is null
     or to_regclass('public.inventory_receive_batch_items') is null
     or to_regprocedure('public.server_receive_inventory_batch(jsonb,uuid)') is null then
    raise exception 't4_4b_batch_surface_incomplete';
  end if;

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'public.inventory_receive_batches'::regclass
  ) or not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'public.inventory_receive_batch_items'::regclass
  ) then
    raise exception 't4_4b_batch_rls_not_enabled';
  end if;

  if exists (
    select 1
    from public.organization_roles r
    where r.code = 'owner'
      and not exists (
        select 1 from public.role_permissions rp
        where rp.role_id = r.id
          and rp.permission_code = 'inventory_batch.read'
      )
  ) or exists (
    select 1
    from public.organization_roles r
    join public.role_permissions rp on rp.role_id = r.id
    where r.code = 'admin'
      and rp.permission_code = 'inventory_batch.read'
  ) then
    raise exception 't4_4b_owner_admin_batch_baseline_invalid';
  end if;

  if (select count(*) from pg_catalog.pg_policies p
      where p.schemaname = 'public'
        and p.tablename in (
          'inventory_receive_batches', 'inventory_receive_batch_items'
        )
        and p.cmd = 'SELECT'
        and p.roles = array['authenticated']::name[]
        and position('inventory_batch.read' in coalesce(p.qual, '')) > 0) <> 2 then
    raise exception 't4_4b_batch_read_policy_invalid';
  end if;

  if exists (
    select 1
    from (values
      ('public.inventory_receive_batches'),
      ('public.inventory_receive_batch_items')
    ) protected(relation_name)
    where has_table_privilege('anon', protected.relation_name, 'select')
       or has_table_privilege('anon', protected.relation_name, 'insert')
       or has_table_privilege('authenticated', protected.relation_name, 'insert')
       or has_table_privilege('authenticated', protected.relation_name, 'update')
       or has_table_privilege('authenticated', protected.relation_name, 'delete')
       or not has_table_privilege('authenticated', protected.relation_name, 'select')
       or has_table_privilege('service_role', protected.relation_name, 'select')
       or has_table_privilege('service_role', protected.relation_name, 'insert')
       or has_table_privilege('service_role', protected.relation_name, 'update')
       or has_table_privilege('service_role', protected.relation_name, 'delete')
  ) then
    raise exception 't4_4b_batch_table_grant_invalid';
  end if;

  if has_function_privilege(
       'anon', 'public.server_receive_inventory_batch(jsonb,uuid)', 'execute'
     )
     or has_function_privilege(
       'authenticated', 'public.server_receive_inventory_batch(jsonb,uuid)', 'execute'
     )
     or not has_function_privilege(
       'service_role', 'public.server_receive_inventory_batch(jsonb,uuid)', 'execute'
     ) then
    raise exception 't4_4b_batch_rpc_grant_invalid';
  end if;

  if position(
       'inventory.receive' in pg_get_functiondef(
         'public.server_receive_inventory_batch(jsonb,uuid)'::regprocedure
       )
     ) = 0
     or position(
       'private.post_inventory_command' in pg_get_functiondef(
         'public.server_receive_inventory_batch(jsonb,uuid)'::regprocedure
       )
     ) = 0
     or position(
       'structure_type in (''standard'', ''variant'')' in pg_get_functiondef(
         'public.server_post_inventory_command(uuid,uuid,text,uuid,uuid,uuid,numeric,text,text,text,uuid,timestamp with time zone)'::regprocedure
       )
     ) = 0 then
    raise exception 't4_4b_permission_ledger_or_product_guard_missing';
  end if;

  if to_regclass('public.inventory_locations') is not null
     or to_regclass('public.inventory_movements') is not null then
    raise exception 't4_4b_duplicate_inventory_schema_detected';
  end if;
end
$postflight$;

commit;
