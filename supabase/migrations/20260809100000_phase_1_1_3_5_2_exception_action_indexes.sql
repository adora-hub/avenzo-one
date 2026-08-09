-- Cover foreign-key maintenance and the Platform Admin action-history query.
create index billing_payment_exception_invoice_idx
  on public.billing_payment_exception_commands (invoice_id);
create index billing_payment_exception_organization_idx
  on public.billing_payment_exception_commands (organization_id);
create index billing_payment_exception_actor_idx
  on public.billing_payment_exception_commands (actor_user_id);
create index billing_payment_exception_created_idx
  on public.billing_payment_exception_commands (created_at desc, id desc);
