-- AVENZO ONE Phase 1.1.3.8.1: platform bank transfer channel configuration.
-- This phase stores payment instructions only. It never marks an invoice as paid.

create table public.billing_transfer_channels (
  id uuid primary key default gen_random_uuid(),
  channel_type text not null,
  display_name text not null,
  provider_name text not null,
  account_name text not null,
  account_identifier text not null,
  customer_instructions text,
  status text not null default 'inactive',
  display_order integer not null default 100,
  change_reason text not null,
  last_command_id uuid not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_transfer_channel_type_check check (channel_type in ('bank_account', 'promptpay')),
  constraint billing_transfer_display_name_check check (length(btrim(display_name)) between 2 and 120),
  constraint billing_transfer_provider_name_check check (length(btrim(provider_name)) between 2 and 120),
  constraint billing_transfer_account_name_check check (length(btrim(account_name)) between 2 and 200),
  constraint billing_transfer_account_identifier_check check (account_identifier ~ '^[0-9]{6,20}$'),
  constraint billing_transfer_instructions_check check (customer_instructions is null or length(btrim(customer_instructions)) between 3 and 1000),
  constraint billing_transfer_status_check check (status in ('active', 'inactive')),
  constraint billing_transfer_display_order_check check (display_order between 0 and 9999),
  constraint billing_transfer_reason_check check (length(btrim(change_reason)) between 3 and 500)
);

create unique index billing_transfer_channel_identity_idx
on public.billing_transfer_channels (channel_type, account_identifier);
create index billing_transfer_channel_status_order_idx
on public.billing_transfer_channels (status, display_order, created_at, id);
create index billing_transfer_channel_updated_by_idx
on public.billing_transfer_channels (updated_by);

alter table public.billing_transfer_channels enable row level security;
revoke all on public.billing_transfer_channels from public, anon, authenticated;
grant select on public.billing_transfer_channels to authenticated;

create policy "platform admins can view transfer channels"
on public.billing_transfer_channels for select to authenticated
using (private.is_platform_admin());

alter table private.billing_audit_logs drop constraint billing_audit_entity_check;
alter table private.billing_audit_logs add constraint billing_audit_entity_check
check (entity_type in ('invoice', 'payment', 'issuer_profile', 'customer_profile', 'invoice_document', 'credit_note', 'bank_transfer_channel'));

create or replace function private.audit_billing_transfer_channel_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  insert into private.billing_audit_logs (
    entity_type, entity_id, organization_id, action, actor_user_id, before_data, after_data
  ) values (
    'bank_transfer_channel', new.id, null,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    (select auth.uid()),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;
revoke all on function private.audit_billing_transfer_channel_write() from public, anon, authenticated;

create trigger audit_billing_transfer_channel_write
after insert or update on public.billing_transfer_channels
for each row execute function private.audit_billing_transfer_channel_write();

create or replace function public.platform_upsert_billing_transfer_channel(
  p_channel_id uuid,
  p_channel_type text,
  p_display_name text,
  p_provider_name text,
  p_account_name text,
  p_account_identifier text,
  p_customer_instructions text,
  p_status text,
  p_display_order integer,
  p_reason text,
  p_command_id uuid
)
returns public.billing_transfer_channels
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_channel public.billing_transfer_channels;
  v_identifier text := regexp_replace(coalesce(p_account_identifier, ''), '[^0-9]', '', 'g');
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'transfer_channel_command_required'; end if;

  select * into v_channel
  from public.billing_transfer_channels
  where last_command_id = p_command_id;
  if found then return v_channel; end if;

  if p_channel_type not in ('bank_account', 'promptpay') then raise exception 'invalid_transfer_channel_type'; end if;
  if p_status not in ('active', 'inactive') then raise exception 'invalid_transfer_channel_status'; end if;
  if length(btrim(coalesce(p_display_name, ''))) < 2
    or length(btrim(coalesce(p_provider_name, ''))) < 2
    or length(btrim(coalesce(p_account_name, ''))) < 2 then
    raise exception 'transfer_channel_identity_required';
  end if;
  if length(v_identifier) < 6 or length(v_identifier) > 20 then raise exception 'invalid_transfer_account_identifier'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'billing_reason_too_short'; end if;
  if p_display_order is null or p_display_order < 0 or p_display_order > 9999 then raise exception 'invalid_transfer_display_order'; end if;

  if p_channel_id is null then
    insert into public.billing_transfer_channels (
      channel_type, display_name, provider_name, account_name, account_identifier,
      customer_instructions, status, display_order, change_reason, last_command_id,
      created_by, updated_by
    ) values (
      p_channel_type, btrim(p_display_name), btrim(p_provider_name), btrim(p_account_name), v_identifier,
      nullif(btrim(p_customer_instructions), ''), p_status, p_display_order, btrim(p_reason), p_command_id,
      (select auth.uid()), (select auth.uid())
    ) returning * into v_channel;
  else
    update public.billing_transfer_channels
    set channel_type = p_channel_type,
        display_name = btrim(p_display_name),
        provider_name = btrim(p_provider_name),
        account_name = btrim(p_account_name),
        account_identifier = v_identifier,
        customer_instructions = nullif(btrim(p_customer_instructions), ''),
        status = p_status,
        display_order = p_display_order,
        change_reason = btrim(p_reason),
        last_command_id = p_command_id,
        updated_by = (select auth.uid()),
        updated_at = now()
    where id = p_channel_id
    returning * into v_channel;
    if not found then raise exception 'transfer_channel_not_found'; end if;
  end if;

  return v_channel;
exception
  when unique_violation then
    raise exception 'transfer_channel_already_exists' using errcode = '23505';
end;
$$;

revoke all on function public.platform_upsert_billing_transfer_channel(uuid, text, text, text, text, text, text, text, integer, text, uuid) from public, anon;
grant execute on function public.platform_upsert_billing_transfer_channel(uuid, text, text, text, text, text, text, text, integer, text, uuid) to authenticated;

comment on table public.billing_transfer_channels is
  'Platform-owned bank account and PromptPay instructions. Configuration alone never confirms a payment.';
comment on function public.platform_upsert_billing_transfer_channel(uuid, text, text, text, text, text, text, text, integer, text, uuid) is
  'AAL2 Platform Admin command for creating or updating a transfer channel with audit and idempotency.';
