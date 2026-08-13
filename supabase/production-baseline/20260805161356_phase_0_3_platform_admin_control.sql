-- AVENZO ONE Phase 0.3: Platform Admin Control
-- Platform moderation is explicit, auditable, and separate from tenant RBAC.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  status text not null default 'active',
  note text not null default '',
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_admins_status_check check (status in ('active', 'suspended'))
);

create table if not exists public.organization_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  action_type text not null,
  previous_status text not null,
  new_status text not null,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  performed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint moderation_action_type_check check (action_type in ('review', 'suspend', 'ban', 'restore')),
  constraint moderation_new_status_check check (new_status in ('active', 'review', 'suspended', 'banned', 'inactive')),
  constraint moderation_target_check check (
    (branch_id is null) or (branch_id is not null)
  ),
  constraint moderation_reason_not_blank check (length(btrim(reason)) > 0)
);

create index if not exists platform_admins_status_idx
  on public.platform_admins (status);

create index if not exists moderation_actions_organization_created_idx
  on public.organization_moderation_actions (organization_id, created_at desc);

create index if not exists moderation_actions_branch_created_idx
  on public.organization_moderation_actions (branch_id, created_at desc);

create index if not exists moderation_actions_performed_by_idx
  on public.organization_moderation_actions (performed_by);

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
      and pa.status = 'active'
  );
$$;

revoke all on function private.is_platform_admin() from public;
grant execute on function private.is_platform_admin() to authenticated;

alter table public.platform_admins enable row level security;
alter table public.organization_moderation_actions enable row level security;

revoke all on public.platform_admins, public.organization_moderation_actions from anon;
grant select on public.platform_admins to authenticated;
grant select, insert on public.organization_moderation_actions to authenticated;

create policy "platform admins can view their own platform access"
on public.platform_admins for select to authenticated
using (user_id = (select auth.uid()));

create policy "platform admins can view moderation history"
on public.organization_moderation_actions for select to authenticated
using (private.is_platform_admin());

create policy "platform admins can append moderation history"
on public.organization_moderation_actions for insert to authenticated
with check (
  private.is_platform_admin()
  and performed_by = (select auth.uid())
  and (
    branch_id is null
    or exists (
      select 1 from public.branches b
      where b.id = organization_moderation_actions.branch_id
        and b.organization_id = organization_moderation_actions.organization_id
    )
  )
);

create policy "platform admins can view all organizations"
on public.organizations for select to authenticated
using (private.is_platform_admin());

create policy "platform admins can update organizations"
on public.organizations for update to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

create policy "platform admins can view all branches"
on public.branches for select to authenticated
using (private.is_platform_admin());

create policy "platform admins can update branches"
on public.branches for update to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

create or replace function public.platform_moderate_organization(
  p_organization_id uuid,
  p_branch_id uuid,
  p_action_type text,
  p_new_status text,
  p_reason text,
  p_evidence jsonb default '{}'::jsonb
)
returns public.organization_moderation_actions
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_previous_status text;
  v_action public.organization_moderation_actions;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_required';
  end if;

  if p_action_type not in ('review', 'suspend', 'ban', 'restore') then
    raise exception 'invalid_moderation_action';
  end if;

  if p_new_status not in ('active', 'review', 'suspended', 'banned', 'inactive') then
    raise exception 'invalid_moderation_status';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'moderation_reason_required';
  end if;

  if p_branch_id is null then
    select o.status into v_previous_status
    from public.organizations o
    where o.id = p_organization_id
    for update;

    if v_previous_status is null then
      raise exception 'organization_not_found';
    end if;

    update public.organizations
    set status = p_new_status, updated_at = now()
    where id = p_organization_id;
  else
    select b.status into v_previous_status
    from public.branches b
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
    for update;

    if v_previous_status is null then
      raise exception 'branch_not_found';
    end if;

    update public.branches
    set status = p_new_status, updated_at = now()
    where id = p_branch_id
      and organization_id = p_organization_id;
  end if;

  insert into public.organization_moderation_actions
    (organization_id, branch_id, action_type, previous_status, new_status, reason, evidence, performed_by)
  values
    (p_organization_id, p_branch_id, p_action_type, v_previous_status, p_new_status,
     btrim(p_reason), coalesce(p_evidence, '{}'::jsonb), (select auth.uid()))
  returning * into v_action;

  return v_action;
end;
$$;

revoke all on function public.platform_moderate_organization(uuid, uuid, text, text, text, jsonb) from public;
revoke all on function public.platform_moderate_organization(uuid, uuid, text, text, text, jsonb) from anon;
grant execute on function public.platform_moderate_organization(uuid, uuid, text, text, text, jsonb) to authenticated;

-- A tenant admin can manage tenant settings, but cannot change moderation status.
create or replace function private.prevent_tenant_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if old.status is distinct from new.status
     and not private.is_platform_admin()
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'platform_admin_required_for_status_change';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_tenant_status_change() from public;

drop trigger if exists prevent_tenant_organization_status_change on public.organizations;
create trigger prevent_tenant_organization_status_change
before update on public.organizations
for each row execute function private.prevent_tenant_status_change();

drop trigger if exists prevent_tenant_branch_status_change on public.branches;
create trigger prevent_tenant_branch_status_change
before update on public.branches
for each row execute function private.prevent_tenant_status_change();

