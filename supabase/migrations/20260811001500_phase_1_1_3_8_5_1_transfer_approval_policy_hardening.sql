-- Explicit deny policies document that these tables are RPC-only.
-- Direct browser access remains revoked from anon and authenticated roles.

create policy billing_transfer_approval_policies_deny_direct_access
on public.billing_transfer_approval_policies
for all
to public
using (false)
with check (false);

create policy billing_transfer_approval_policy_events_deny_direct_access
on private.billing_transfer_approval_policy_events
for all
to public
using (false)
with check (false);
