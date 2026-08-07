-- AVENZO ONE Phase 0.9: Security hardening and organization audit log.

insert into public.permissions (code, resource, action, description)
values ('audit.read', 'audit', 'read', 'View the organization audit log')
on conflict (code) do update
set resource = excluded.resource,
    action = excluded.action,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_code)
select r.id, 'audit.read'
from public.organization_roles r
where r.code in ('owner', 'admin')
on conflict do nothing;

create or replace function private.current_user_org_permissions(
  p_organization_id uuid
)
returns text[]
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_permissions text[];
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select coalesce(
    array_agg(distinct rp.permission_code order by rp.permission_code),
    array[]::text[]
  )
  into v_permissions
  from public.organization_members om
  join public.organizations o
    on o.id = om.organization_id
  join public.member_roles mr
    on mr.membership_id = om.id
  join public.organization_roles r
    on r.id = mr.role_id
   and r.organization_id = om.organization_id
  join public.role_permissions rp
    on rp.role_id = r.id
  where om.organization_id = p_organization_id
    and om.user_id = v_user_id
    and om.membership_status = 'active'
    and o.status = 'active';

  return v_permissions;
end;
$$;

revoke all on function private.current_user_org_permissions(uuid) from public;
revoke all on function private.current_user_org_permissions(uuid) from anon;
grant execute on function private.current_user_org_permissions(uuid) to authenticated;

create or replace function public.current_user_org_permissions(
  p_organization_id uuid
)
returns text[]
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select private.current_user_org_permissions(p_organization_id);
$$;

revoke all on function public.current_user_org_permissions(uuid) from public;
revoke all on function public.current_user_org_permissions(uuid) from anon;
grant execute on function public.current_user_org_permissions(uuid) to authenticated;

-- Administrators use permission-checked RPCs for invitation history and creation.
-- Direct table access is limited to the invitee reading their own invitation.
drop policy if exists "authorized users can view organization invitations" on public.organization_invitations;
drop policy if exists "authorized members can create invitations" on public.organization_invitations;

create policy "invitees can view their own invitations"
on public.organization_invitations
for select
to authenticated
using (
  lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

revoke insert, update, delete on public.organization_invitations from authenticated;

create table if not exists private.organization_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  category text not null,
  action text not null,
  actor_user_id uuid,
  target_type text not null,
  target_id uuid,
  target_label text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  source_type text not null,
  source_id uuid not null,
  source_event text not null,
  created_at timestamptz not null default now(),
  constraint organization_audit_logs_category_check
    check (category in ('organization', 'branch', 'member', 'invitation', 'subscription', 'moderation', 'security')),
  constraint organization_audit_logs_summary_check check (length(btrim(summary)) > 0),
  constraint organization_audit_logs_source_unique unique (source_type, source_id, source_event)
);

create index if not exists organization_audit_logs_org_created_idx
  on private.organization_audit_logs (organization_id, created_at desc, id desc);

create index if not exists organization_audit_logs_org_category_created_idx
  on private.organization_audit_logs (organization_id, category, created_at desc, id desc);

alter table private.organization_audit_logs enable row level security;
revoke all on private.organization_audit_logs from public, anon, authenticated;

create or replace function private.append_organization_audit_log(
  p_organization_id uuid,
  p_category text,
  p_action text,
  p_actor_user_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_target_label text,
  p_summary text,
  p_metadata jsonb,
  p_source_type text,
  p_source_id uuid,
  p_source_event text,
  p_created_at timestamptz default now()
)
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  insert into private.organization_audit_logs (
    organization_id, category, action, actor_user_id, target_type,
    target_id, target_label, summary, metadata,
    source_type, source_id, source_event, created_at
  ) values (
    p_organization_id, p_category, p_action, p_actor_user_id, p_target_type,
    p_target_id, nullif(btrim(p_target_label), ''), btrim(p_summary), coalesce(p_metadata, '{}'::jsonb),
    p_source_type, p_source_id, p_source_event, coalesce(p_created_at, now())
  )
  on conflict (source_type, source_id, source_event) do nothing;
$$;

revoke all on function private.append_organization_audit_log(uuid,text,text,uuid,text,uuid,text,text,jsonb,text,uuid,text,timestamptz) from public, anon, authenticated;

create or replace function private.audit_membership_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform private.append_organization_audit_log(
    new.organization_id,
    'member',
    'member.' || new.event_type,
    new.performed_by,
    'membership',
    new.membership_id,
    null,
    'Membership ' || replace(new.event_type, '_', ' '),
    jsonb_build_object('previous', new.previous_data, 'new', new.new_data, 'reason', new.reason),
    'membership_events',
    new.id,
    new.event_type,
    new.created_at
  );
  return new;
end;
$$;

create or replace function private.audit_invitation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
begin
  if tg_op = 'INSERT' then
    perform private.append_organization_audit_log(
      new.organization_id, 'invitation', 'invitation.created', new.invited_by,
      'invitation', new.id, new.email, 'Invitation created',
      jsonb_build_object('email', new.email, 'role', new.role_code, 'branch_id', new.branch_id, 'expires_at', new.expires_at),
      'organization_invitations', new.id, 'created', new.created_at
    );
  elsif old.status is distinct from new.status then
    v_actor := (select auth.uid());
    perform private.append_organization_audit_log(
      new.organization_id, 'invitation', 'invitation.' || new.status, coalesce(v_actor, new.invited_by),
      'invitation', new.id, new.email, 'Invitation ' || new.status,
      jsonb_build_object('email', new.email, 'role', new.role_code, 'branch_id', new.branch_id, 'previous_status', old.status, 'new_status', new.status),
      'organization_invitations', new.id, 'status:' || new.status,
      case when new.status = 'accepted' then coalesce(new.accepted_at, now()) else now() end
    );
  end if;
  return new;
end;
$$;

create or replace function private.audit_subscription_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform private.append_organization_audit_log(
    new.organization_id, 'subscription', 'subscription.' || new.event_type, new.performed_by,
    'subscription', new.subscription_id, null, 'Subscription ' || new.event_type,
    jsonb_build_object('previous_status', new.previous_status, 'new_status', new.new_status, 'reason', new.reason, 'details', new.metadata),
    'subscription_events', new.id, new.event_type, new.created_at
  );
  return new;
end;
$$;

create or replace function private.audit_moderation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform private.append_organization_audit_log(
    new.organization_id, 'moderation', 'moderation.' || new.action_type, new.performed_by,
    case when new.branch_id is null then 'organization' else 'branch' end,
    coalesce(new.branch_id, new.organization_id), null, 'Moderation ' || new.action_type,
    jsonb_build_object('previous_status', new.previous_status, 'new_status', new.new_status, 'reason', new.reason),
    'organization_moderation_actions', new.id, new.action_type, new.created_at
  );
  return new;
end;
$$;

create or replace function private.audit_branch_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := (select auth.uid());
  v_action text;
begin
  v_action := case when tg_op = 'INSERT' then 'branch.created' else 'branch.updated' end;
  perform private.append_organization_audit_log(
    new.organization_id, 'branch', v_action, coalesce(v_actor, new.created_by),
    'branch', new.id, new.code || ' - ' || new.name,
    case when tg_op = 'INSERT' then 'Branch created' else 'Branch updated' end,
    case when tg_op = 'INSERT'
      then jsonb_build_object('code', new.code, 'name', new.name, 'status', new.status)
      else jsonb_build_object(
        'previous', jsonb_build_object('code', old.code, 'name', old.name, 'status', old.status),
        'new', jsonb_build_object('code', new.code, 'name', new.name, 'status', new.status)
      )
    end,
    'branches', new.id,
    case when tg_op = 'INSERT' then v_action else 'branch.updated:' || gen_random_uuid()::text end,
    case when tg_op = 'INSERT' then new.created_at else now() end
  );
  return new;
end;
$$;

create or replace function private.audit_organization_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := (select auth.uid());
  v_action text;
begin
  v_action := case when tg_op = 'INSERT' then 'organization.created' else 'organization.updated' end;
  perform private.append_organization_audit_log(
    new.id, 'organization', v_action, coalesce(v_actor, new.created_by),
    'organization', new.id, new.name,
    case when tg_op = 'INSERT' then 'Organization created' else 'Organization updated' end,
    case when tg_op = 'INSERT'
      then jsonb_build_object('name', new.name, 'slug', new.slug, 'status', new.status, 'timezone', new.timezone, 'currency', new.currency)
      else jsonb_build_object(
        'previous', jsonb_build_object('name', old.name, 'slug', old.slug, 'status', old.status, 'timezone', old.timezone, 'currency', old.currency),
        'new', jsonb_build_object('name', new.name, 'slug', new.slug, 'status', new.status, 'timezone', new.timezone, 'currency', new.currency)
      )
    end,
    'organizations', new.id,
    case when tg_op = 'INSERT' then v_action else 'organization.updated:' || gen_random_uuid()::text end,
    case when tg_op = 'INSERT' then new.created_at else now() end
  );
  return new;
end;
$$;

revoke all on function private.audit_membership_event() from public, anon, authenticated;
revoke all on function private.audit_invitation_event() from public, anon, authenticated;
revoke all on function private.audit_subscription_event() from public, anon, authenticated;
revoke all on function private.audit_moderation_event() from public, anon, authenticated;
revoke all on function private.audit_branch_change() from public, anon, authenticated;
revoke all on function private.audit_organization_change() from public, anon, authenticated;

drop trigger if exists append_membership_audit_log on public.membership_events;
create trigger append_membership_audit_log
after insert on public.membership_events
for each row execute function private.audit_membership_event();

drop trigger if exists append_invitation_created_audit_log on public.organization_invitations;
create trigger append_invitation_created_audit_log
after insert on public.organization_invitations
for each row execute function private.audit_invitation_event();

drop trigger if exists append_invitation_status_audit_log on public.organization_invitations;
create trigger append_invitation_status_audit_log
after update of status on public.organization_invitations
for each row when (old.status is distinct from new.status)
execute function private.audit_invitation_event();

drop trigger if exists append_subscription_audit_log on public.subscription_events;
create trigger append_subscription_audit_log
after insert on public.subscription_events
for each row execute function private.audit_subscription_event();

drop trigger if exists append_moderation_audit_log on public.organization_moderation_actions;
create trigger append_moderation_audit_log
after insert on public.organization_moderation_actions
for each row execute function private.audit_moderation_event();

drop trigger if exists append_branch_created_audit_log on public.branches;
create trigger append_branch_created_audit_log
after insert on public.branches
for each row execute function private.audit_branch_change();

drop trigger if exists append_branch_updated_audit_log on public.branches;
create trigger append_branch_updated_audit_log
after update of code, name, status on public.branches
for each row when (
  old.code is distinct from new.code
  or old.name is distinct from new.name
  or old.status is distinct from new.status
)
execute function private.audit_branch_change();

drop trigger if exists append_organization_created_audit_log on public.organizations;
create trigger append_organization_created_audit_log
after insert on public.organizations
for each row execute function private.audit_organization_change();

drop trigger if exists append_organization_updated_audit_log on public.organizations;
create trigger append_organization_updated_audit_log
after update of name, slug, status, timezone, currency on public.organizations
for each row when (
  old.name is distinct from new.name
  or old.slug is distinct from new.slug
  or old.status is distinct from new.status
  or old.timezone is distinct from new.timezone
  or old.currency is distinct from new.currency
)
execute function private.audit_organization_change();

-- Backfill existing canonical records. The unique source key makes this idempotent.
select private.append_organization_audit_log(
  o.id, 'organization', 'organization.created', o.created_by,
  'organization', o.id, o.name, 'Organization created',
  jsonb_build_object('name', o.name, 'slug', o.slug, 'status', o.status, 'timezone', o.timezone, 'currency', o.currency),
  'organizations', o.id, 'organization.created', o.created_at
)
from public.organizations o;

select private.append_organization_audit_log(
  b.organization_id, 'branch', 'branch.created', b.created_by,
  'branch', b.id, b.code || ' - ' || b.name, 'Branch created',
  jsonb_build_object('code', b.code, 'name', b.name, 'status', b.status),
  'branches', b.id, 'branch.created', b.created_at
)
from public.branches b;

select private.append_organization_audit_log(
  i.organization_id, 'invitation', 'invitation.created', i.invited_by,
  'invitation', i.id, i.email, 'Invitation created',
  jsonb_build_object('email', i.email, 'role', i.role_code, 'branch_id', i.branch_id, 'expires_at', i.expires_at),
  'organization_invitations', i.id, 'created', i.created_at
)
from public.organization_invitations i;

select private.append_organization_audit_log(
  i.organization_id, 'invitation', 'invitation.' || i.status,
  case when i.status = 'accepted' then u.id else i.invited_by end,
  'invitation', i.id, i.email, 'Invitation ' || i.status,
  jsonb_build_object('email', i.email, 'role', i.role_code, 'branch_id', i.branch_id, 'historical_timestamp_approximate', i.status <> 'accepted'),
  'organization_invitations', i.id, 'status:' || i.status,
  case when i.status = 'accepted' then coalesce(i.accepted_at, i.created_at) else i.created_at end
)
from public.organization_invitations i
left join auth.users u on lower(u.email) = lower(i.email)
where i.status <> 'pending';

select private.append_organization_audit_log(
  e.organization_id, 'member', 'member.' || e.event_type, e.performed_by,
  'membership', e.membership_id, null, 'Membership ' || replace(e.event_type, '_', ' '),
  jsonb_build_object('previous', e.previous_data, 'new', e.new_data, 'reason', e.reason),
  'membership_events', e.id, e.event_type, e.created_at
)
from public.membership_events e;

select private.append_organization_audit_log(
  e.organization_id, 'subscription', 'subscription.' || e.event_type, e.performed_by,
  'subscription', e.subscription_id, null, 'Subscription ' || e.event_type,
  jsonb_build_object('previous_status', e.previous_status, 'new_status', e.new_status, 'reason', e.reason, 'details', e.metadata),
  'subscription_events', e.id, e.event_type, e.created_at
)
from public.subscription_events e;

select private.append_organization_audit_log(
  e.organization_id, 'moderation', 'moderation.' || e.action_type, e.performed_by,
  case when e.branch_id is null then 'organization' else 'branch' end,
  coalesce(e.branch_id, e.organization_id), null, 'Moderation ' || e.action_type,
  jsonb_build_object('previous_status', e.previous_status, 'new_status', e.new_status, 'reason', e.reason),
  'organization_moderation_actions', e.id, e.action_type, e.created_at
)
from public.organization_moderation_actions e;

create or replace function private.organization_audit_history(
  p_organization_id uuid,
  p_search text default '',
  p_category text default 'all',
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_category text := lower(btrim(coalesce(p_category, 'all')));
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not private.has_org_permission(p_organization_id, 'audit.read') then
    raise exception 'audit_read_permission_required' using errcode = '42501';
  end if;
  if v_category not in ('all', 'organization', 'branch', 'member', 'invitation', 'subscription', 'moderation', 'security') then
    raise exception 'invalid_audit_category';
  end if;
  if char_length(v_search) > 160 then
    raise exception 'audit_search_too_long';
  end if;

  with filtered as materialized (
    select
      l.id, l.category, l.action, l.actor_user_id,
      u.email as actor_email,
      l.target_type, l.target_id, l.target_label,
      l.summary, l.metadata, l.created_at
    from private.organization_audit_logs l
    left join auth.users u on u.id = l.actor_user_id
    where l.organization_id = p_organization_id
      and (v_category = 'all' or l.category = v_category)
      and (
        v_search = ''
        or lower(coalesce(l.target_label, '')) like '%' || v_search || '%'
        or lower(coalesce(u.email, '')) like '%' || v_search || '%'
        or lower(l.summary) like '%' || v_search || '%'
        or lower(l.action) like '%' || v_search || '%'
      )
  ), page_rows as (
    select *
    from filtered
    order by created_at desc, id desc
    offset (v_page - 1) * v_page_size
    limit v_page_size
  )
  select jsonb_build_object(
    'total_count', (select count(*) from filtered),
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'category', p.category,
            'action', p.action,
            'actor_user_id', p.actor_user_id,
            'actor_email', p.actor_email,
            'target_type', p.target_type,
            'target_id', p.target_id,
            'target_label', p.target_label,
            'summary', p.summary,
            'metadata', p.metadata,
            'created_at', p.created_at
          ) order by p.created_at desc, p.id desc
        )
        from page_rows p
      ),
      '[]'::jsonb
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function private.organization_audit_history(uuid,text,text,integer,integer) from public, anon;
grant execute on function private.organization_audit_history(uuid,text,text,integer,integer) to authenticated;

create or replace function public.organization_audit_history(
  p_organization_id uuid,
  p_search text default '',
  p_category text default 'all',
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select private.organization_audit_history(
    p_organization_id,
    p_search,
    p_category,
    p_page,
    p_page_size
  );
$$;

revoke all on function public.organization_audit_history(uuid,text,text,integer,integer) from public, anon;
grant execute on function public.organization_audit_history(uuid,text,text,integer,integer) to authenticated;
