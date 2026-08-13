-- Ensure the volatile invitation creator is evaluated exactly once when its
-- composite return value is expanded by the public SQL wrapper.

create or replace function public.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_role_code text,
  p_branch_id uuid default null,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns public.organization_invitations
language sql
security invoker
set search_path = pg_catalog
as $$
  with invitation as materialized (
    select private.create_organization_invitation(
      p_organization_id,
      p_email,
      p_role_code,
      p_branch_id,
      p_expires_at
    ) as value
  )
  select (value).*
  from invitation;
$$;

revoke all on function public.create_organization_invitation(uuid, text, text, uuid, timestamptz) from public;
revoke all on function public.create_organization_invitation(uuid, text, text, uuid, timestamptz) from anon;
grant execute on function public.create_organization_invitation(uuid, text, text, uuid, timestamptz) to authenticated;

