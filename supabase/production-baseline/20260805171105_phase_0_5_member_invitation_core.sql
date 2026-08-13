-- AVENZO ONE Phase 0.5: Branch and Member Invitation Core

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role_code text not null,
  branch_id uuid references public.branches(id) on delete restrict,
  status text not null default 'pending',
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint organization_invitations_email_check check (email = lower(btrim(email))),
  constraint organization_invitations_status_check check (status in ('pending', 'accepted', 'revoked', 'expired')),
  constraint organization_invitations_expiry_check check (expires_at > created_at),
  constraint organization_invitations_branch_check check (branch_id is null or branch_id is not null)
);

create unique index if not exists organization_invitations_pending_email_unique
  on public.organization_invitations (organization_id, email)
  where status = 'pending';

create index if not exists organization_invitations_organization_idx
  on public.organization_invitations (organization_id, created_at desc);

create index if not exists organization_invitations_branch_idx
  on public.organization_invitations (branch_id);

create index if not exists organization_invitations_invited_by_idx
  on public.organization_invitations (invited_by);

alter table public.organization_invitations enable row level security;
revoke all on public.organization_invitations from anon;
grant select, insert on public.organization_invitations to authenticated;

create policy "members can view organization invitations"
on public.organization_invitations for select to authenticated
using (
  private.is_platform_admin()
  or private.has_org_permission(organization_id, 'member.read')
);

create policy "authorized members can create invitations"
on public.organization_invitations for insert to authenticated
with check (
  private.has_org_permission(organization_id, 'member.invite')
  and invited_by = (select auth.uid())
  and email = lower(btrim(email))
  and exists (
    select 1 from public.organization_roles r
    where r.organization_id = organization_invitations.organization_id
      and r.code = organization_invitations.role_code
  )
  and (
    branch_id is null
    or exists (
      select 1 from public.branches b
      where b.id = organization_invitations.branch_id
        and b.organization_id = organization_invitations.organization_id
        and b.status = 'active'
    )
  )
);

create or replace function public.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_role_code text,
  p_branch_id uuid default null,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns public.organization_invitations
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_invitation public.organization_invitations;
  v_email text := lower(btrim(p_email));
begin
  if not private.has_org_permission(p_organization_id, 'member.invite') then
    raise exception 'member_invite_permission_required';
  end if;

  if position('@' in v_email) <= 1 or position('.' in split_part(v_email, '@', 2)) <= 1 then
    raise exception 'invalid_invitation_email';
  end if;

  if not exists (
    select 1 from public.organization_roles r
    where r.organization_id = p_organization_id and r.code = p_role_code
  ) then
    raise exception 'organization_role_not_found';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branches b
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
      and b.status = 'active'
  ) then
    raise exception 'organization_branch_not_found';
  end if;

  insert into public.organization_invitations
    (organization_id, email, role_code, branch_id, invited_by, expires_at)
  values
    (p_organization_id, v_email, p_role_code, p_branch_id, (select auth.uid()), p_expires_at)
  returning * into v_invitation;

  return v_invitation;
end;
$$;

revoke all on function public.create_organization_invitation(uuid, text, text, uuid, timestamptz) from public;
revoke all on function public.create_organization_invitation(uuid, text, text, uuid, timestamptz) from anon;
grant execute on function public.create_organization_invitation(uuid, text, text, uuid, timestamptz) to authenticated;

