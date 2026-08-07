-- Phase 1.0.4.2 hardening: retire the legacy unversioned mutation RPC from browser clients.
revoke execute on function public.platform_set_organization_subscription(
  uuid, text, timestamptz, timestamptz, timestamptz, text, text, text, jsonb
) from authenticated;

comment on function public.platform_set_organization_subscription(
  uuid, text, timestamptz, timestamptz, timestamptz, text, text, text, jsonb
) is 'Legacy Phase 0 RPC retained for server/service compatibility; authenticated clients must use platform_transition_organization_subscription.';

