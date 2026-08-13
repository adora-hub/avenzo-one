
create or replace function private.audit_billing_document_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_organization_id uuid;
  v_entity_type text;
begin
  v_entity_type := case tg_table_name
    when 'billing_issuer_profiles' then 'issuer_profile'
    when 'billing_customer_profiles' then 'customer_profile'
    when 'billing_invoice_documents' then 'invoice_document'
    when 'billing_credit_notes' then 'credit_note'
  end;

  if tg_table_name = 'billing_customer_profiles' then
    v_organization_id := (to_jsonb(new) ->> 'organization_id')::uuid;
  elsif tg_table_name = 'billing_invoice_documents' then
    select organization_id into v_organization_id from public.billing_invoices where id = (to_jsonb(new) ->> 'invoice_id')::uuid;
  elsif tg_table_name = 'billing_credit_notes' then
    select i.organization_id into v_organization_id
    from public.billing_invoice_documents d
    join public.billing_invoices i on i.id = d.invoice_id
    where d.id = (to_jsonb(new) ->> 'invoice_document_id')::uuid;
  else
    v_organization_id := null;
  end if;

  insert into private.billing_audit_logs (entity_type, entity_id, organization_id, action, actor_user_id, before_data, after_data)
  values (
    v_entity_type,
    coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(new) ->> 'organization_id')::uuid),
    v_organization_id,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    (select auth.uid()),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

revoke all on function private.audit_billing_document_write() from public, anon, authenticated;

