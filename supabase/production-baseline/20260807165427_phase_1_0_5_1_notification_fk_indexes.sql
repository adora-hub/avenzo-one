-- Cover Phase 1.0.5.1 foreign keys used by administration and audit queries.

create index subscription_notification_rules_created_by_idx
  on public.subscription_notification_rules (created_by);
create index subscription_notification_rules_updated_by_idx
  on public.subscription_notification_rules (updated_by);
create index subscription_notification_queue_rule_idx
  on public.subscription_notification_queue (rule_id);
create index subscription_notification_queue_generated_by_idx
  on public.subscription_notification_queue (generated_by);
create index subscription_notification_rule_audit_actor_idx
  on private.subscription_notification_rule_audit_logs (actor_user_id);

