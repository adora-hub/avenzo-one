create or replace function public.platform_set_billing_live_safety_state(
  p_command_id uuid,
  p_next_state text,
  p_reason text
)
returns public.billing_live_safety_controls
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_control public.billing_live_safety_controls;
  v_existing_command uuid;
  v_action text;
  v_latest_review_complete boolean;
begin
  if not private.is_platform_admin() then
    raise exception 'platform_admin_aal2_required' using errcode = '42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  if p_next_state not in ('locked', 'review_ready') then
    raise exception 'billing_live_state_not_allowed';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then
    raise exception 'billing_live_reason_invalid';
  end if;

  select command_id into v_existing_command
  from public.billing_live_safety_events
  where command_id = p_command_id;
  if v_existing_command is not null then
    select * into v_control
    from public.billing_live_safety_controls
    where provider = 'stripe';
    return v_control;
  end if;

  select * into v_control
  from public.billing_live_safety_controls
  where provider = 'stripe'
  for update;

  select (manual_status = 'manual_complete')
  into v_latest_review_complete
  from public.billing_production_readiness_reviews
  order by created_at desc, id desc
  limit 1;

  if p_next_state = 'review_ready'
     and coalesce(v_latest_review_complete, false) is not true then
    raise exception 'billing_readiness_manual_review_required';
  end if;

  v_action := case when p_next_state = 'locked' then 'lock' else 'mark_review_ready' end;

  insert into public.billing_live_safety_events (
    command_id, provider, action, previous_state, next_state,
    emergency_stop, reason, actor_user_id, actor_email
  ) values (
    p_command_id, 'stripe', v_action, v_control.state, p_next_state,
    true, btrim(p_reason), auth.uid(), coalesce(auth.jwt() ->> 'email', '')
  );

  update public.billing_live_safety_controls
  set state = p_next_state,
      emergency_stop = true,
      reason = btrim(p_reason),
      version = version + 1,
      updated_by = auth.uid(),
      updated_by_email = coalesce(auth.jwt() ->> 'email', ''),
      updated_at = now()
  where provider = 'stripe'
  returning * into v_control;

  return v_control;
end;
$$;

revoke all on function public.platform_set_billing_live_safety_state(uuid, text, text)
  from public, anon;
grant execute on function public.platform_set_billing_live_safety_state(uuid, text, text)
  to authenticated;

comment on function public.platform_set_billing_live_safety_state(uuid, text, text) is
  'Locks Stripe Live or marks readiness only when the latest readiness review passed, while emergency_stop remains true.';
