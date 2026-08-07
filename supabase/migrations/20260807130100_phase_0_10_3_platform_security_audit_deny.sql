-- Explicitly document that Platform Security audit records are internal-only.
-- Trusted SECURITY DEFINER writers owned by the database owner continue to work.

drop policy if exists "no direct platform security audit access"
on private.platform_security_audit_logs;

create policy "no direct platform security audit access"
on private.platform_security_audit_logs
as restrictive
for all
to public
using (false)
with check (false);
