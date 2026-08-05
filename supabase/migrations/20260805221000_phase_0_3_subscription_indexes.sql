create index if not exists organization_subscriptions_plan_code_idx
  on public.organization_subscriptions (plan_code);

create index if not exists organization_subscriptions_created_by_idx
  on public.organization_subscriptions (created_by);

create index if not exists subscription_events_subscription_id_idx
  on public.subscription_events (subscription_id);

create index if not exists subscription_events_performed_by_idx
  on public.subscription_events (performed_by);
