create index if not exists billing_production_readiness_actor_idx on public.billing_production_readiness_reviews (actor_user_id, created_at desc);
