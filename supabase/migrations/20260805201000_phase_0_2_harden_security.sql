-- Keep SECURITY DEFINER helpers out of the exposed public schema.
create schema if not exists private;

alter function public.has_org_permission(uuid, text, uuid) set schema private;
alter function public.seed_organization_access() set schema private;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on function private.has_org_permission(uuid, text, uuid) from public;
grant execute on function private.has_org_permission(uuid, text, uuid) to authenticated;
revoke all on function private.seed_organization_access() from public;

drop index if exists public.organization_members_organization_user_unique;

create index if not exists member_roles_assigned_by_idx
  on public.member_roles (assigned_by);

create index if not exists organization_roles_created_by_idx
  on public.organization_roles (created_by);
