-- Phase 1.1.3.7.4.1: make the private immutable audit boundary explicit
-- and cover the actor foreign key used by investigations.

create index if not exists platform_admin_access_events_actor_idx
  on private.platform_admin_access_events (actor_user_id, created_at desc);

drop policy if exists platform_admin_access_events_deny_direct_access
  on private.platform_admin_access_events;

create policy platform_admin_access_events_deny_direct_access
  on private.platform_admin_access_events
  as restrictive
  for all
  to public
  using (false)
  with check (false);
