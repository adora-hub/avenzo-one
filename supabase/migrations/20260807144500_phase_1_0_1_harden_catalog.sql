create index if not exists feature_catalog_created_by_idx
  on public.feature_catalog (created_by);

create index if not exists feature_catalog_updated_by_idx
  on public.feature_catalog (updated_by);

create index if not exists feature_catalog_audit_actor_idx
  on private.feature_catalog_audit_logs (actor_user_id);

create policy "deny direct access to feature catalog audit logs"
on private.feature_catalog_audit_logs
for all
to public
using (false)
with check (false);

