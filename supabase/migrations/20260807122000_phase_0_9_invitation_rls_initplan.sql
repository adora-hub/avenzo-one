-- Cache the JWT lookup once per statement for the invitee-only RLS policy.

drop policy if exists "invitees can view their own invitations" on public.organization_invitations;

create policy "invitees can view their own invitations"
on public.organization_invitations
for select
to authenticated
using (
  lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
);

