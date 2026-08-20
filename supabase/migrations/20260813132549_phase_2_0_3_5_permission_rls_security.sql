-- Phase 2.0.3.5: permission catalog, tenant/branch RLS, and security boundaries.
-- Production apply is intentionally outside this phase's approval boundary.

insert into public.permissions (code, resource, action, description)
values
  ('product.read', 'product', 'read', 'View Product and SKU master data'),
  ('product.manage', 'product', 'manage', 'Manage Product and SKU master data through server commands'),
  ('warehouse.read', 'warehouse', 'read', 'View Warehouse and Location data in permitted branches'),
  ('warehouse.manage', 'warehouse', 'manage', 'Manage Warehouse and Location data in permitted branches through server commands'),
  ('inventory.read', 'inventory', 'read', 'View inventory balances, movements, commands, and events in permitted branches'),
  ('inventory.receive', 'inventory', 'receive', 'Receive stock into a permitted branch'),
  ('inventory.adjust', 'inventory', 'adjust', 'Adjust stock in a permitted branch'),
  ('inventory.transfer', 'inventory', 'transfer', 'Transfer stock between permitted branches')
on conflict (code) do update set
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description;

-- Owner/Admin are the only built-in roles receiving the new domain permissions.
-- Manager/Staff/Viewer remain deny-by-default until an owner assigns permissions.
insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.organization_roles r
join public.permissions p on p.code in (
  'product.read', 'product.manage',
  'warehouse.read', 'warehouse.manage',
  'inventory.read', 'inventory.receive', 'inventory.adjust', 'inventory.transfer'
)
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
      'product.read', 'product.manage',
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

drop trigger if exists seed_foundation_domain_permissions_after_role_insert
  on public.organization_roles;
create trigger seed_foundation_domain_permissions_after_role_insert
after insert on public.organization_roles
for each row execute function private.seed_foundation_domain_role_permissions();

-- Data API roles may read only through reviewed SELECT policies. All mutations
-- remain server-command-only, including master data manage permissions.
revoke all privileges on table
  public.products,
  public.skus,
  public.warehouses,
  public.locations,
  public.inventory_commands,
  public.stock_movements,
  public.inventory_balances,
  public.inventory_domain_events
from public, anon, authenticated;

grant select on table
  public.products,
  public.skus,
  public.warehouses,
  public.locations,
  public.inventory_commands,
  public.stock_movements,
  public.inventory_balances,
  public.inventory_domain_events
to authenticated;

drop policy if exists products_permission_select on public.products;
create policy products_permission_select
on public.products for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));

drop policy if exists skus_permission_select on public.skus;
create policy skus_permission_select
on public.skus for select to authenticated
using ((select private.has_org_permission(organization_id, 'product.read', null)));

drop policy if exists warehouses_permission_select on public.warehouses;
create policy warehouses_permission_select
on public.warehouses for select to authenticated
using ((select private.has_org_permission(organization_id, 'warehouse.read', branch_id)));

drop policy if exists locations_permission_select on public.locations;
create policy locations_permission_select
on public.locations for select to authenticated
using ((select private.has_org_permission(organization_id, 'warehouse.read', branch_id)));

drop policy if exists stock_movements_permission_select on public.stock_movements;
create policy stock_movements_permission_select
on public.stock_movements for select to authenticated
using ((select private.has_org_permission(organization_id, 'inventory.read', branch_id)));

drop policy if exists inventory_balances_permission_select on public.inventory_balances;
create policy inventory_balances_permission_select
on public.inventory_balances for select to authenticated
using ((select private.has_org_permission(organization_id, 'inventory.read', branch_id)));

drop policy if exists inventory_domain_events_permission_select on public.inventory_domain_events;
create policy inventory_domain_events_permission_select
on public.inventory_domain_events for select to authenticated
using (
  branch_id is not null
  and (select private.has_org_permission(organization_id, 'inventory.read', branch_id))
);

create or replace function private.has_inventory_command_read_permission(
  p_organization_id uuid,
  p_source_location_id uuid,
  p_destination_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (p_source_location_id is not null or p_destination_location_id is not null)
    and (
      p_source_location_id is null
      or exists (
        select 1
        from public.locations source_location
        where source_location.organization_id = p_organization_id
          and source_location.id = p_source_location_id
          and private.has_org_permission(
            p_organization_id, 'inventory.read', source_location.branch_id
          )
      )
    )
    and (
      p_destination_location_id is null
      or exists (
        select 1
        from public.locations destination_location
        where destination_location.organization_id = p_organization_id
          and destination_location.id = p_destination_location_id
          and private.has_org_permission(
            p_organization_id, 'inventory.read', destination_location.branch_id
          )
      )
    );
$$;

revoke all on function private.has_inventory_command_read_permission(uuid, uuid, uuid)
  from public, anon;
grant execute on function private.has_inventory_command_read_permission(uuid, uuid, uuid)
  to authenticated;

drop policy if exists inventory_commands_permission_select on public.inventory_commands;
create policy inventory_commands_permission_select
on public.inventory_commands for select to authenticated
using ((select private.has_inventory_command_read_permission(
  organization_id, source_location_id, destination_location_id
)));

-- Explicit-actor helper for the trusted server boundary. It does not use
-- auth.uid(), because service_role requests authenticate the actor in the API
-- before calling this function.
create or replace function private.server_actor_has_org_permission(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_permission_code text,
  p_branch_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members om
    join public.member_roles mr on mr.membership_id = om.id
    join public.organization_roles r
      on r.id = mr.role_id and r.organization_id = om.organization_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.organizations o on o.id = om.organization_id
    where om.organization_id = p_organization_id
      and om.user_id = p_actor_user_id
      and om.membership_status = 'active'
      and o.status = 'active'
      and rp.permission_code = p_permission_code
      and (
        p_branch_id is null
        or om.scope = 'organization'
        or exists (
          select 1
          from public.member_branches mb
          join public.branches b
            on b.id = mb.branch_id
           and b.organization_id = p_organization_id
           and b.status = 'active'
          where mb.membership_id = om.id
            and mb.branch_id = p_branch_id
        )
      )
  );
$$;

revoke all on function private.server_actor_has_org_permission(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;

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

-- Platform Admin evidence is deliberately separate from tenant RLS and is
-- read-only. private.is_platform_admin() also requires an active AAL2 session.
create or replace function public.platform_inventory_evidence(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_evidence jsonb;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'organization_id', p_organization_id,
    'product_count', (select count(*) from public.products p where p.organization_id = p_organization_id),
    'sku_count', (select count(*) from public.skus s where s.organization_id = p_organization_id),
    'warehouse_count', (select count(*) from public.warehouses w where w.organization_id = p_organization_id),
    'location_count', (select count(*) from public.locations l where l.organization_id = p_organization_id),
    'movement_count', (select count(*) from public.stock_movements m where m.organization_id = p_organization_id),
    'on_hand_total', (select coalesce(sum(b.on_hand), 0) from public.inventory_balances b where b.organization_id = p_organization_id),
    'ledger_total', (select coalesce(sum(m.quantity_delta), 0) from public.stock_movements m where m.organization_id = p_organization_id),
    'last_movement_at', (select max(m.occurred_at) from public.stock_movements m where m.organization_id = p_organization_id),
    'generated_at', now()
  ) into v_evidence;

  return v_evidence;
end;
$$;

revoke all on function public.platform_inventory_evidence(uuid)
  from public, anon, service_role;
grant execute on function public.platform_inventory_evidence(uuid) to authenticated;

comment on function public.server_post_inventory_command(
  uuid, uuid, text, uuid, uuid, uuid, numeric, text, text, text, uuid, timestamptz
) is 'Trusted server-only inventory boundary; validates actor, tenant, branch scope, and permission before atomic posting.';
comment on function public.platform_inventory_evidence(uuid) is
  'Read-only AAL2 Platform Admin evidence path; never grants tenant operator permissions.';
