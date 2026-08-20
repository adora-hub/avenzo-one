-- Phase 1.2.4.2.2: remove anonymous access to tenant workspace tables.
-- Public authentication remains handled by Supabase Auth. Signed-in users keep
-- their reviewed authenticated grants and Row Level Security policies.

begin;

revoke all privileges on table public.branches from anon;
revoke all privileges on table public.member_branches from anon;
revoke all privileges on table public.organization_members from anon;
revoke all privileges on table public.organizations from anon;

-- Future public tables and sequences created by postgres must not expose
-- anonymous access unless a later migration grants a specific privilege.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon;

commit;
