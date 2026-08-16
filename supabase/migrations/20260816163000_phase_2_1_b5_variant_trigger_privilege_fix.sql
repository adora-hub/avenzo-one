-- Phase 2.1 B5 hotfix: trusted Atomic Variant creation executes table guards
-- through service_role. Keep the Variant and identifier tables ungranted;
-- elevate only the narrow trigger entry points owned by postgres.

alter function private.enforce_variant_collection_limits()
  security definer;
alter function private.validate_sku_option_assignment()
  security definer;
alter function private.prevent_variant_master_archive_in_use()
  security definer;
alter function private.validate_variant_combination_uniqueness()
  security definer;
alter function private.sync_sku_identifier_registry()
  security definer;

revoke all on function private.enforce_variant_collection_limits()
  from public, anon, authenticated, service_role;
revoke all on function private.validate_sku_option_assignment()
  from public, anon, authenticated, service_role;
revoke all on function private.prevent_variant_master_archive_in_use()
  from public, anon, authenticated, service_role;
revoke all on function private.validate_variant_combination_uniqueness()
  from public, anon, authenticated, service_role;
revoke all on function private.sync_sku_identifier_registry()
  from public, anon, authenticated, service_role;

comment on function private.enforce_variant_collection_limits() is
  'B5 trusted trigger guard. SECURITY DEFINER permits the service-role-only Atomic command without granting Variant tables directly.';
comment on function private.validate_sku_option_assignment() is
  'B5 trusted trigger guard validating Product/Option/SKU tenant references inside Atomic creation.';
comment on function private.validate_variant_combination_uniqueness() is
  'B5 trusted deferred trigger guard validating unique complete Variant combinations at transaction commit.';
comment on function private.sync_sku_identifier_registry() is
  'B5 trusted trigger entry point binding permanent SKU identifiers without direct service_role table grants.';
