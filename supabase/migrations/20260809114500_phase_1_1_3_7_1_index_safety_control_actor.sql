create index if not exists billing_live_safety_controls_updated_by_idx
  on public.billing_live_safety_controls (updated_by)
  where updated_by is not null;
