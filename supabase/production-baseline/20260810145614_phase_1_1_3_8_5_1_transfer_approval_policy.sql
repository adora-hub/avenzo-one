create table public.billing_transfer_approval_policies (
  policy_key text primary key,
  currency text not null default 'THB',
  single_admin_limit numeric(14,2) not null default 5000,
  require_two_person_on_risk boolean not null default true,
  version bigint not null default 1,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint billing_transfer_approval_policy_key_check check (policy_key = 'default'),
  constraint billing_transfer_approval_policy_currency_check check (currency = 'THB'),
  constraint billing_transfer_approval_policy_limit_check check (single_admin_limit between 0 and 100000000)
);
insert into public.billing_transfer_approval_policies (policy_key) values ('default') on conflict (policy_key) do nothing;
alter table public.billing_transfer_approval_policies enable row level security;
revoke all on table public.billing_transfer_approval_policies from public, anon, authenticated;
create table private.billing_transfer_approval_policy_events (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null unique,
  previous_policy jsonb not null,
  new_policy jsonb not null,
  reason text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  created_at timestamptz not null default now(),
  constraint billing_transfer_approval_policy_event_reason_check check (length(btrim(reason)) between 10 and 2000)
);
create index billing_transfer_approval_policy_events_created_idx on private.billing_transfer_approval_policy_events (created_at desc, id desc);
alter table private.billing_transfer_approval_policy_events enable row level security;
revoke all on table private.billing_transfer_approval_policy_events from public, anon, authenticated;
create or replace function public.platform_billing_transfer_approval_policy()
returns table (policy_key text, currency text, single_admin_limit numeric, require_two_person_on_risk boolean, version bigint, updated_by uuid, updated_by_email text, updated_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog
as $$
begin
  if not private.is_platform_admin() then raise exception 'platform_admin_aal2_required' using errcode = '42501'; end if;
  return query
  select p.policy_key, p.currency, p.single_admin_limit, p.require_two_person_on_risk, p.version, p.updated_by, u.email::text, p.updated_at
  from public.billing_transfer_approval_policies p left join auth.users u on u.id = p.updated_by
  where p.policy_key = 'default';
end;
$$;
create or replace function public.platform_update_billing_transfer_approval_policy(
  p_single_admin_limit numeric, p_require_two_person_on_risk boolean, p_reason text, p_command_id uuid, p_expected_version bigint
)
returns public.billing_transfer_approval_policies
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_previous public.billing_transfer_approval_policies;
  v_result public.billing_transfer_approval_policies;
begin
  if not private.is_platform_super_admin() then raise exception 'platform_super_admin_aal2_required' using errcode = '42501'; end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if p_single_admin_limit is null or p_single_admin_limit < 0 or p_single_admin_limit > 100000000 then raise exception 'single_admin_limit_invalid'; end if;
  if p_require_two_person_on_risk is null then raise exception 'risk_policy_required'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then raise exception 'approval_policy_reason_invalid'; end if;
  select p.* into v_result
  from private.billing_transfer_approval_policy_events e
  join public.billing_transfer_approval_policies p on p.policy_key = 'default'
  where e.command_id = p_command_id;
  if found then return v_result; end if;
  select * into v_previous from public.billing_transfer_approval_policies where policy_key = 'default' for update;
  if v_previous.version <> p_expected_version then raise exception 'approval_policy_version_conflict'; end if;
  update public.billing_transfer_approval_policies
  set single_admin_limit = round(p_single_admin_limit, 2), require_two_person_on_risk = p_require_two_person_on_risk,
      version = version + 1, updated_by = v_actor, updated_at = now()
  where policy_key = 'default' returning * into v_result;
  insert into private.billing_transfer_approval_policy_events (command_id, previous_policy, new_policy, reason, actor_user_id, actor_email)
  values (p_command_id, to_jsonb(v_previous), to_jsonb(v_result), btrim(p_reason), v_actor, v_actor_email);
  return v_result;
end;
$$;
revoke all on function public.platform_billing_transfer_approval_policy() from public, anon;
revoke all on function public.platform_update_billing_transfer_approval_policy(numeric, boolean, text, uuid, bigint) from public, anon;
grant execute on function public.platform_billing_transfer_approval_policy() to authenticated;
grant execute on function public.platform_update_billing_transfer_approval_policy(numeric, boolean, text, uuid, bigint) to authenticated;
comment on table public.billing_transfer_approval_policies is 'Singleton policy configuration for bank-transfer approval. Enforcement begins in Phase 1.1.3.8.5.2.';
comment on function public.platform_update_billing_transfer_approval_policy(numeric, boolean, text, uuid, bigint) is 'AAL2 Super Admin-only, version-checked and idempotent update with immutable audit evidence.';
