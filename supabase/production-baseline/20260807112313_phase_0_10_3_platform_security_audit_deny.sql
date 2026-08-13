drop policy if exists "no direct platform security audit access"
on private.platform_security_audit_logs;

create policy "no direct platform security audit access"
on private.platform_security_audit_logs
as restrictive
for all
to public
using (false)
with check (false);
