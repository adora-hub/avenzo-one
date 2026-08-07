-- AVENZO ONE Phase 0.10.3: enforce MFA assurance for Platform Admin database access.
-- Existing Platform Admin policies and RPC guards call this helper, so requiring
-- aal2 here protects the Control Plane even when the Data API is called directly.

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    and exists (
      select 1
      from public.platform_admins pa
      where pa.user_id = (select auth.uid())
        and pa.status = 'active'
    );
$$;

revoke all on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

comment on function private.is_platform_admin() is
  'Returns true only for an active Platform Admin whose current JWT has aal2 assurance.';
