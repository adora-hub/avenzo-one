
-- Issuer identity is global to the platform and does not belong to one organization.
alter table private.billing_audit_logs alter column organization_id drop not null;

