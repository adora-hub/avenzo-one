-- Phase 2.0.6: deferred default-location validation must retain the trusted
-- function owner's table privileges when a service-role command commits.
-- Production apply is not authorized by this phase.

alter function private.enforce_warehouse_default_location() security definer;
alter function private.enforce_warehouse_default_location() set search_path = '';

revoke all on function private.enforce_warehouse_default_location()
from public, anon, authenticated, service_role;

comment on function private.enforce_warehouse_default_location() is
  'Deferred Warehouse default-location invariant. SECURITY DEFINER is required because service-role command transactions intentionally have no direct Warehouse/Location table access.';

create or replace function public.server_resolve_foundation_branch_ids(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_ids uuid[]
)
returns table (branch_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested_count integer;
  v_found_count integer;
begin
  if p_organization_id is null
     or p_entity_type not in ('warehouse', 'location')
     or p_entity_ids is null
     or cardinality(p_entity_ids) = 0
     or exists (select 1 from unnest(p_entity_ids) id where id is null) then
    raise exception 'foundation_scope_input_invalid' using errcode = '22023';
  end if;

  select count(distinct id) into v_requested_count from unnest(p_entity_ids) id;
  if p_entity_type = 'warehouse' then
    select count(distinct w.id) into v_found_count
    from public.warehouses w
    where w.organization_id = p_organization_id and w.id = any(p_entity_ids);
    if v_found_count <> v_requested_count then
      raise exception 'entity_not_found' using errcode = 'P0002';
    end if;
    return query select distinct w.branch_id from public.warehouses w
      where w.organization_id = p_organization_id and w.id = any(p_entity_ids);
  else
    select count(distinct l.id) into v_found_count
    from public.locations l
    where l.organization_id = p_organization_id and l.id = any(p_entity_ids);
    if v_found_count <> v_requested_count then
      raise exception 'entity_not_found' using errcode = 'P0002';
    end if;
    return query select distinct l.branch_id from public.locations l
      where l.organization_id = p_organization_id and l.id = any(p_entity_ids);
  end if;
end;
$$;

revoke all on function public.server_resolve_foundation_branch_ids(uuid, text, uuid[])
from public, anon, authenticated;
grant execute on function public.server_resolve_foundation_branch_ids(uuid, text, uuid[])
to service_role;

comment on function public.server_resolve_foundation_branch_ids(uuid, text, uuid[]) is
  'Service-role-only fail-closed branch scope resolver without direct table SELECT grants.';

create or replace function private.audit_inventory_domain_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sku_label text;
begin
  select s.sku_code || ' - ' || s.name into v_sku_label
  from public.skus s
  where s.organization_id = new.organization_id and s.id = new.sku_id;

  perform private.append_organization_audit_log(
    new.organization_id,
    'inventory',
    new.event_name,
    new.actor_user_id,
    'sku',
    new.sku_id,
    v_sku_label,
    replace(new.event_name, '.', ' '),
    new.metadata || jsonb_build_object('branch_id', new.branch_id, 'command_id', new.command_id),
    'inventory_domain_event',
    new.id,
    new.event_name,
    new.occurred_at
  );
  return new;
end;
$$;

revoke all on function private.audit_inventory_domain_event()
from public, anon, authenticated, service_role;

drop trigger if exists audit_inventory_domain_event on public.inventory_domain_events;
create trigger audit_inventory_domain_event
after insert on public.inventory_domain_events
for each row execute function private.audit_inventory_domain_event();

comment on function private.audit_inventory_domain_event() is
  'Appends one immutable human-readable Organization audit row for each committed inventory domain event.';
