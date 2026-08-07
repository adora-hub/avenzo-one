-- AVENZO ONE Phase 0.8.1: Harden member writes
-- Membership writes must go through permission-checked RPCs. Direct table
-- writes could otherwise alter protected identity and tenant columns.

revoke all on public.organization_members from authenticated;
grant select on public.organization_members to authenticated;

revoke all on public.member_roles from authenticated;
grant select on public.member_roles to authenticated;

revoke all on public.member_branches from authenticated;
grant select on public.member_branches to authenticated;

-- Invitation acceptance and organization seeding continue to work because
-- their database routines execute with their explicitly configured owner.
