-- Phase 1.2.4.2.3: cache the row-independent JWT lookup as an RLS InitPlan.
-- This preserves the existing authenticated role, SELECT command, platform-admin
-- check, and AAL2 requirement. It changes only the shape of the auth.jwt() call.

alter policy "aal2 platform admins read billing live shadow commands"
on public.billing_live_shadow_commands
using (
  (select private.is_platform_admin())
  and ((select auth.jwt()) ->> 'aal') = 'aal2'
);
