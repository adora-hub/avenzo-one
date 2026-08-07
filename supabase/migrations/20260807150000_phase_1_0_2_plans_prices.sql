-- AVENZO ONE Phase 1.0.2: Plans, Prices and Feature Values
-- This phase defines catalog data only. It does not assign a new plan version to existing subscriptions.

alter table public.subscription_plans
  add column if not exists description text not null default '',
  add column if not exists lifecycle_status text not null default 'active';

update public.subscription_plans
set lifecycle_status = case when is_active then 'active' else 'retired' end,
    description = case when description = '' then name else description end
where lifecycle_status is null or description = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscription_plans_lifecycle_check'
      and conrelid = 'public.subscription_plans'::regclass
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_lifecycle_check
      check (lifecycle_status in ('draft', 'active', 'retired'));
  end if;
end;
$$;

create table if not exists public.subscription_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null references public.subscription_plans(code) on delete restrict,
  version_no integer not null,
  label text not null,
  description text not null default '',
  lifecycle_status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plan_versions_no_check check (version_no > 0),
  constraint subscription_plan_versions_label_check check (length(btrim(label)) between 2 and 120),
  constraint subscription_plan_versions_description_check check (length(btrim(description)) between 0 and 500),
  constraint subscription_plan_versions_lifecycle_check check (lifecycle_status in ('draft', 'active', 'retired')),
  constraint subscription_plan_versions_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint subscription_plan_versions_unique_no unique (plan_code, version_no)
);

create table if not exists public.subscription_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references public.subscription_plan_versions(id) on delete restrict,
  billing_interval text not null,
  amount numeric(12,2) not null,
  currency text not null default 'THB',
  trial_days integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plan_prices_interval_check check (billing_interval in ('monthly', 'yearly', 'one_time')),
  constraint subscription_plan_prices_amount_check check (amount >= 0),
  constraint subscription_plan_prices_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint subscription_plan_prices_trial_check check (trial_days >= 0),
  constraint subscription_plan_prices_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint subscription_plan_prices_unique_interval unique (plan_version_id, billing_interval)
);

create table if not exists public.subscription_plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references public.subscription_plan_versions(id) on delete restrict,
  feature_id uuid not null references public.feature_catalog(id) on delete restrict,
  boolean_value boolean,
  integer_value integer,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plan_features_one_value_check check ((boolean_value is not null) <> (integer_value is not null)),
  constraint subscription_plan_features_unique_feature unique (plan_version_id, feature_id)
);

create table if not exists private.subscription_plan_audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_key text not null,
  action text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now(),
  constraint subscription_plan_audit_entity_check check (entity_type in ('plan', 'plan_version', 'plan_price', 'plan_feature')),
  constraint subscription_plan_audit_action_check check (action in ('created', 'updated'))
);

create index if not exists subscription_plan_versions_plan_idx
  on public.subscription_plan_versions (plan_code, lifecycle_status);

create index if not exists subscription_plan_prices_version_idx
  on public.subscription_plan_prices (plan_version_id, is_active);

create index if not exists subscription_plan_features_version_idx
  on public.subscription_plan_features (plan_version_id);

create index if not exists subscription_plan_features_feature_idx
  on public.subscription_plan_features (feature_id);

create index if not exists subscription_plan_versions_created_by_idx
  on public.subscription_plan_versions (created_by);

create index if not exists subscription_plan_versions_updated_by_idx
  on public.subscription_plan_versions (updated_by);

create index if not exists subscription_plan_prices_created_by_idx
  on public.subscription_plan_prices (created_by);

create index if not exists subscription_plan_prices_updated_by_idx
  on public.subscription_plan_prices (updated_by);

create index if not exists subscription_plan_features_created_by_idx
  on public.subscription_plan_features (created_by);

create index if not exists subscription_plan_features_updated_by_idx
  on public.subscription_plan_features (updated_by);

create index if not exists subscription_plan_audit_entity_created_idx
  on private.subscription_plan_audit_logs (entity_type, entity_key, created_at desc);

create index if not exists subscription_plan_audit_actor_idx
  on private.subscription_plan_audit_logs (actor_user_id);

alter table public.subscription_plans enable row level security;
alter table public.subscription_plan_versions enable row level security;
alter table public.subscription_plan_prices enable row level security;
alter table public.subscription_plan_features enable row level security;
alter table private.subscription_plan_audit_logs enable row level security;

revoke all on public.subscription_plans, public.subscription_plan_versions,
  public.subscription_plan_prices, public.subscription_plan_features
  from public, anon, authenticated;
grant select, insert, update on public.subscription_plans to authenticated;
grant select, insert, update on public.subscription_plan_versions to authenticated;
grant select, insert, update on public.subscription_plan_prices to authenticated;
grant select, insert, update on public.subscription_plan_features to authenticated;
revoke all on private.subscription_plan_audit_logs from public, anon, authenticated;

drop policy if exists "authenticated users can view active subscription plans" on public.subscription_plans;
drop policy if exists "platform admins can create subscription plans" on public.subscription_plans;
drop policy if exists "platform admins can update subscription plans" on public.subscription_plans;

create policy "authenticated users can view active subscription plans"
on public.subscription_plans for select to authenticated
using (lifecycle_status = 'active' or private.is_platform_admin());

create policy "platform admins can create subscription plans"
on public.subscription_plans for insert to authenticated
with check (private.is_platform_admin());

create policy "platform admins can update subscription plans"
on public.subscription_plans for update to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

create policy "users can view available plan versions"
on public.subscription_plan_versions for select to authenticated
using (lifecycle_status = 'active' or private.is_platform_admin());

create policy "platform admins can create plan versions"
on public.subscription_plan_versions for insert to authenticated
with check (private.is_platform_admin());

create policy "platform admins can update plan versions"
on public.subscription_plan_versions for update to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

create policy "users can view available plan prices"
on public.subscription_plan_prices for select to authenticated
using (
  private.is_platform_admin()
  or exists (
    select 1 from public.subscription_plan_versions v
    where v.id = plan_version_id and v.lifecycle_status = 'active'
  )
);

create policy "platform admins can create plan prices"
on public.subscription_plan_prices for insert to authenticated
with check (private.is_platform_admin());

create policy "platform admins can update plan prices"
on public.subscription_plan_prices for update to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

create policy "users can view available plan features"
on public.subscription_plan_features for select to authenticated
using (
  private.is_platform_admin()
  or exists (
    select 1 from public.subscription_plan_versions v
    where v.id = plan_version_id and v.lifecycle_status = 'active'
  )
);

create policy "platform admins can create plan features"
on public.subscription_plan_features for insert to authenticated
with check (private.is_platform_admin());

create policy "platform admins can update plan features"
on public.subscription_plan_features for update to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

create or replace function private.prepare_subscription_plan_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if (select auth.uid()) is null or not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.code := lower(btrim(new.code));
    new.created_at := coalesce(new.created_at, now());
  else
    new.code := old.code;
    new.created_at := old.created_at;
  end if;

  new.name := btrim(new.name);
  new.description := btrim(new.description);
  new.is_active := new.lifecycle_status = 'active';
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.prepare_subscription_plan_version_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if (select auth.uid()) is null or not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.lifecycle_status = 'active' then
    raise exception 'active_plan_version_immutable';
  end if;
  if new.lifecycle_status = 'active' and not exists (
    select 1 from public.subscription_plans
    where code = new.plan_code and lifecycle_status = 'active'
  ) then
    raise exception 'plan_must_be_active_before_version';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.updated_by := (select auth.uid());
    new.created_at := coalesce(new.created_at, now());
  else
    new.id := old.id;
    new.plan_code := old.plan_code;
    new.version_no := old.version_no;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := (select auth.uid());
  end if;
  new.plan_code := lower(btrim(new.plan_code));
  new.label := btrim(new.label);
  new.description := btrim(new.description);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.prepare_subscription_plan_price_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_lifecycle text;
begin
  if (select auth.uid()) is null or not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  select lifecycle_status into v_lifecycle
  from public.subscription_plan_versions
  where id = case when tg_op = 'UPDATE' then old.plan_version_id else new.plan_version_id end;
  if v_lifecycle is null then
    raise exception 'plan_version_not_found';
  end if;
  if v_lifecycle = 'active' then
    raise exception 'active_plan_version_immutable';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.updated_by := (select auth.uid());
    new.created_at := coalesce(new.created_at, now());
  else
    new.id := old.id;
    new.plan_version_id := old.plan_version_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := (select auth.uid());
  end if;
  new.currency := upper(btrim(new.currency));
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.prepare_subscription_plan_feature_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_lifecycle text;
  v_value_type text;
  v_feature_status text;
begin
  if (select auth.uid()) is null or not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  select lifecycle_status into v_lifecycle
  from public.subscription_plan_versions
  where id = case when tg_op = 'UPDATE' then old.plan_version_id else new.plan_version_id end;
  select value_type, lifecycle_status into v_value_type, v_feature_status
  from public.feature_catalog
  where id = case when tg_op = 'UPDATE' then old.feature_id else new.feature_id end;
  if v_lifecycle is null then raise exception 'plan_version_not_found'; end if;
  if v_value_type is null then raise exception 'feature_not_found'; end if;
  if v_lifecycle = 'active' then raise exception 'active_plan_version_immutable'; end if;
  if v_feature_status = 'retired' then raise exception 'retired_feature_not_allowed'; end if;
  if v_value_type = 'boolean' and (new.boolean_value is null or new.integer_value is not null) then
    raise exception 'boolean_feature_requires_boolean_value';
  end if;
  if v_value_type = 'integer' and (new.integer_value is null or new.boolean_value is not null) then
    raise exception 'integer_feature_requires_integer_value';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.updated_by := (select auth.uid());
    new.created_at := coalesce(new.created_at, now());
  else
    new.id := old.id;
    new.plan_version_id := old.plan_version_id;
    new.feature_id := old.feature_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := (select auth.uid());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.audit_subscription_plan_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_entity_type text;
  v_entity_key text;
begin
  v_entity_type := case tg_table_name
    when 'subscription_plans' then 'plan'
    when 'subscription_plan_versions' then 'plan_version'
    when 'subscription_plan_prices' then 'plan_price'
    else 'plan_feature'
  end;
  if tg_table_name = 'subscription_plans' then
    v_entity_key := new.code;
  else
    v_entity_key := new.id::text;
  end if;
  insert into private.subscription_plan_audit_logs
    (entity_type, entity_key, action, actor_user_id, before_data, after_data)
  values
    (v_entity_type, v_entity_key, case when tg_op = 'INSERT' then 'created' else 'updated' end,
     (select auth.uid()), case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
     to_jsonb(new));
  return new;
end;
$$;

revoke all on function private.prepare_subscription_plan_write() from public, anon, authenticated;
revoke all on function private.prepare_subscription_plan_version_write() from public, anon, authenticated;
revoke all on function private.prepare_subscription_plan_price_write() from public, anon, authenticated;
revoke all on function private.prepare_subscription_plan_feature_write() from public, anon, authenticated;
revoke all on function private.audit_subscription_plan_write() from public, anon, authenticated;

drop trigger if exists prepare_subscription_plan_write on public.subscription_plans;
create trigger prepare_subscription_plan_write
before insert or update on public.subscription_plans
for each row execute function private.prepare_subscription_plan_write();

drop trigger if exists prepare_subscription_plan_version_write on public.subscription_plan_versions;
create trigger prepare_subscription_plan_version_write
before insert or update on public.subscription_plan_versions
for each row execute function private.prepare_subscription_plan_version_write();

drop trigger if exists prepare_subscription_plan_price_write on public.subscription_plan_prices;
create trigger prepare_subscription_plan_price_write
before insert or update on public.subscription_plan_prices
for each row execute function private.prepare_subscription_plan_price_write();

drop trigger if exists prepare_subscription_plan_feature_write on public.subscription_plan_features;
create trigger prepare_subscription_plan_feature_write
before insert or update on public.subscription_plan_features
for each row execute function private.prepare_subscription_plan_feature_write();

drop trigger if exists audit_subscription_plan_write on public.subscription_plans;
create trigger audit_subscription_plan_write
after insert or update on public.subscription_plans
for each row execute function private.audit_subscription_plan_write();

drop trigger if exists audit_subscription_plan_version_write on public.subscription_plan_versions;
create trigger audit_subscription_plan_version_write
after insert or update on public.subscription_plan_versions
for each row execute function private.audit_subscription_plan_write();

drop trigger if exists audit_subscription_plan_price_write on public.subscription_plan_prices;
create trigger audit_subscription_plan_price_write
after insert or update on public.subscription_plan_prices
for each row execute function private.audit_subscription_plan_write();

drop trigger if exists audit_subscription_plan_feature_write on public.subscription_plan_features;
create trigger audit_subscription_plan_feature_write
after insert or update on public.subscription_plan_features
for each row execute function private.audit_subscription_plan_write();

create policy "deny direct access to subscription plan audit logs"
on private.subscription_plan_audit_logs
for all to public
using (false)
with check (false);

comment on table public.subscription_plan_versions is
  'Immutable once active; defines a versioned commercial plan configuration.';
comment on table public.subscription_plan_prices is
  'Price and trial options belonging to a draft plan version.';
comment on table public.subscription_plan_features is
  'Feature values belonging to a draft plan version.';
comment on table private.subscription_plan_audit_logs is
  'Append-only audit log for plan catalog changes.';
