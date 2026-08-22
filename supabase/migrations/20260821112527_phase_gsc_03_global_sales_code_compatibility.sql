-- GSC-03: forward-only Global Sales Code V1 compatibility enforcement.
-- Existing non-V1 values remain readable and unchanged. Every new permanent
-- assignment is validated by the database, including trusted command paths.

begin;

create or replace function private.is_global_sales_code_v1(p_value text)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select p_value = upper(btrim(p_value))
    and p_value ~ '^[A-Z]{1,3}[0-9]{3}$'
    and right(p_value, 3) <> '000'
$$;

revoke all on function private.is_global_sales_code_v1(text)
  from public, anon, authenticated, service_role;

alter table public.sales_code_sequences
  add column standard_version text not null default 'legacy';

alter table public.sales_code_sequences
  alter column standard_version set default 'global_v1';

alter table public.sales_code_sequences
  add constraint sales_code_sequences_standard_version_check
  check (standard_version in ('legacy', 'global_v1'));

alter table public.sales_code_sequences
  add constraint sales_code_sequences_global_v1_definition_check
  check (
    standard_version = 'legacy'
    or (
      prefix ~ '^[A-Z]{1,3}$'
      and start_number between 1 and 999
      and next_number between start_number and 1000
      and digit_count = 3
    )
  );

create index sales_code_sequences_global_v1_allocator_idx
  on public.sales_code_sequences (
    organization_id, purpose, status, prefix, next_number, id
  )
  where standard_version = 'global_v1';

create or replace function private.enforce_global_sales_code_sequence_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.standard_version <> 'global_v1' then
      raise exception 'sales_code_legacy_sequence_create_forbidden'
        using errcode = '23514';
    end if;
  elsif old.standard_version = 'legacy' then
    if new is distinct from old then
      raise exception 'sales_code_legacy_sequence_read_only'
        using errcode = '23514';
    end if;
    return new;
  elsif new.standard_version is distinct from old.standard_version then
    raise exception 'sales_code_sequence_standard_immutable'
      using errcode = '23514';
  end if;

  if new.prefix !~ '^[A-Z]{1,3}$'
     or new.start_number not between 1 and 999
     or new.next_number not between new.start_number and 1000
     or new.digit_count <> 3 then
    raise exception 'global_sales_code_sequence_invalid'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_global_sales_code_sequence_v1()
  from public, anon, authenticated, service_role;

create trigger zz_gsc03_enforce_global_sales_code_sequence_v1
before insert or update on public.sales_code_sequences
for each row execute function private.enforce_global_sales_code_sequence_v1();

create or replace function private.enforce_global_sales_code_sku_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.sales_code is null
     or (tg_op = 'UPDATE' and new.sales_code is not distinct from old.sales_code) then
    return new;
  end if;

  if not private.is_global_sales_code_v1(new.sales_code) then
    raise exception 'global_sales_code_invalid'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_global_sales_code_sku_v1()
  from public, anon, authenticated, service_role;

-- Trigger name intentionally sorts after prepare_sku_write so input reaching
-- this authority is already trimmed and upper-cased by the canonical SKU writer.
create trigger zz_gsc03_enforce_global_sales_code_sku_v1
before insert or update of sales_code on public.skus
for each row execute function private.enforce_global_sales_code_sku_v1();

create or replace function private.enforce_global_sales_code_reservation_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_standard_version text;
begin
  select s.standard_version into strict v_standard_version
  from public.sales_code_sequences s
  where s.organization_id = new.organization_id
    and s.id = new.sequence_id;

  if tg_op = 'UPDATE' and v_standard_version = 'legacy' then
    if new is distinct from old then
      raise exception 'sales_code_legacy_reservation_read_only'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if v_standard_version <> 'global_v1'
     or new.sequence_number not between 1 and 999
     or not private.is_global_sales_code_v1(new.code) then
    raise exception 'global_sales_code_reservation_invalid'
      using errcode = '23514';
  end if;
  return new;
exception when no_data_found then
  raise exception 'sales_code_sequence_not_found' using errcode = 'P0002';
end;
$$;

revoke all on function private.enforce_global_sales_code_reservation_v1()
  from public, anon, authenticated, service_role;

create trigger zz_gsc03_enforce_global_sales_code_reservation_v1
before insert or update on public.sales_code_reservations
for each row execute function private.enforce_global_sales_code_reservation_v1();

-- Reassert the trusted boundary explicitly. RLS protects reads while all
-- allocator writes remain available only through the service-role command.
revoke all privileges on table
  public.sales_code_sequences,
  public.sales_code_reservation_batches,
  public.sales_code_reservations,
  public.sales_code_allocator_commands,
  public.sales_code_allocator_events
from public, anon, authenticated, service_role;

grant select on table
  public.sales_code_sequences,
  public.sales_code_reservation_batches,
  public.sales_code_reservations,
  public.sales_code_allocator_events
to authenticated;

revoke all on function public.server_execute_sales_code_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) from public, anon, authenticated;

grant execute on function public.server_execute_sales_code_command(
  uuid, uuid, text, jsonb, text, uuid, timestamptz
) to service_role;

comment on column public.sales_code_sequences.standard_version is
  'GSC-03 authority marker. Existing definitions are grandfathered legacy/read-only; all new definitions are Global V1.';
comment on function private.is_global_sales_code_v1(text) is
  'Canonical GSC-02/GSC-03 predicate: 1-3 English letters plus exactly three digits, excluding 000.';

commit;
