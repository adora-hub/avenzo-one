-- Ensure system Owner/Admin roles created for future organizations receive audit.read.

create or replace function private.grant_system_role_audit_permission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.is_system and new.code in ('owner', 'admin') then
    insert into public.role_permissions (role_id, permission_code)
    values (new.id, 'audit.read')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.grant_system_role_audit_permission() from public, anon, authenticated;

drop trigger if exists grant_system_role_audit_permission on public.organization_roles;
create trigger grant_system_role_audit_permission
after insert on public.organization_roles
for each row execute function private.grant_system_role_audit_permission();

insert into public.role_permissions (role_id, permission_code)
select r.id, 'audit.read'
from public.organization_roles r
where r.is_system
  and r.code in ('owner', 'admin')
on conflict do nothing;


