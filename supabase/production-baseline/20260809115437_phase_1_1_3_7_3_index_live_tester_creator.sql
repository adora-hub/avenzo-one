-- Cover the created_by foreign key used by audit and user-deletion checks.
create index billing_live_testers_created_by_idx
  on public.billing_live_testers (created_by, created_at desc);
