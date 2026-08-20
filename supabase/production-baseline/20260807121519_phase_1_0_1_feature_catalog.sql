-- AVENZO ONE Phase 1.0.1: Platform-managed feature catalog.
-- Features are definitions only. They do not grant entitlements until a later phase.

create table public.feature_catalog (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  name text not null,
  description text not null,
  value_type text not null,
  unit text,
  lifecycle_status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_catalog_key_format_check check (
    feature_key = lower(feature_key)
    and feature_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'
    and length(feature_key) between 3 and 80
  ),
  constraint feature_catalog_name_check check (length(btrim(name)) between 2 and 100),
  constraint feature_catalog_description_check check (length(btrim(description)) between 3 and 500),
  constraint feature_catalog_value_type_check check (value_type in ('boolean', 'integer')),
  constraint feature_catalog_unit_check check (
    (value_type = 'boolean' and unit is null)
    or (value_type = 'integer' and unit is not null and length(btrim(unit)) between 1 and 30)
  ),
  constraint feature_catalog_lifecycle_check check (lifecycle_status in ('draft', 'active', 'retired')),
  constraint feature_catalog_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index feature_catalog_status_name_idx
  on public.feature_catalog (lifecycle_status, name);

create table private.feature_catalog_audit_logs (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references public.feature_catalog(id) on delete restrict,
  feature_key text not null,
  action text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  previous_record jsonb,
  new_record jsonb not null,
  created_at timestamptz not null default now(),
  constraint feature_catalog_audit_action_check check (action in ('feature.created', 'feature.updated'))
);

create index feature_catalog_audit_feature_created_idx
  on private.feature_catalog_audit_logs (feature_id, created_at desc);

alter table public.feature_catalog enable row level security;
alter table private.feature_catalog_audit_logs enable row level security;

revoke all on public.feature_catalog from public, anon, authenticated;
grant select, insert, update on public.feature_catalog to authenticated;
revoke all on private.feature_catalog_audit_logs from public, anon, authenticated;

create policy "platform admins can view feature catalog"
on public.feature_catalog for select to authenticated
using (private.is_platform_admin());

create policy "platform admins can create feature catalog entries"
on public.feature_catalog for insert to authenticated
with check (private.is_platform_admin());

create policy "platform admins can update feature catalog entries"
on public.feature_catalog for update to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

create or replace function private.prepare_feature_catalog_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;

  new.feature_key := lower(btrim(new.feature_key));
  new.name := btrim(new.name);
  new.description := btrim(new.description);
  new.unit := nullif(btrim(new.unit), '');
  new.updated_by := (select auth.uid());
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  elsif new.id is distinct from old.id then
    raise exception 'feature_id_is_immutable' using errcode = '22023';
  elsif new.feature_key is distinct from old.feature_key then
    raise exception 'feature_key_is_immutable' using errcode = '22023';
  elsif new.value_type is distinct from old.value_type then
    raise exception 'feature_value_type_is_immutable' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

create or replace function private.audit_feature_catalog_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.feature_catalog_audit_logs (
    feature_id,
    feature_key,
    action,
    actor_user_id,
    previous_record,
    new_record
  )
  values (
    new.id,
    new.feature_key,
    case when tg_op = 'INSERT' then 'feature.created' else 'feature.updated' end,
    (select auth.uid()),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return new;
end;
$$;

revoke all on function private.prepare_feature_catalog_write() from public, anon, authenticated;
revoke all on function private.audit_feature_catalog_write() from public, anon, authenticated;

create trigger prepare_feature_catalog_write
before insert or update on public.feature_catalog
for each row execute function private.prepare_feature_catalog_write();

create trigger append_feature_catalog_audit_log
after insert or update on public.feature_catalog
for each row execute function private.audit_feature_catalog_write();

comment on table public.feature_catalog is
  'Stable feature definitions for future plans and entitlements. Feature keys and value types are immutable.';
comment on table private.feature_catalog_audit_logs is
  'Append-only Platform Admin audit history for feature definition changes.';

