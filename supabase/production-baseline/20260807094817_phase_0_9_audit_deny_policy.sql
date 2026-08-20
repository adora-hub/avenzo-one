-- Explicit deny-all policy documents that audit records are RPC-only.

drop policy if exists "no direct audit log access" on private.organization_audit_logs;

create policy "no direct audit log access"
on private.organization_audit_logs
as restrictive
for all
to public
using (false)
with check (false);


