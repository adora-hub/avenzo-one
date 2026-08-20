CREATE OR REPLACE FUNCTION public.server_process_stripe_test_event(p_provider_event_id text, p_provider_session_id text, p_result_status text, p_occurred_at timestamp with time zone, p_payload_sha256 text, p_provider_fee_actual numeric DEFAULT NULL::numeric, p_provider_net_amount numeric DEFAULT NULL::numeric, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS billing_payment_attempts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_attempt public.billing_payment_attempts;
  v_invoice public.billing_invoices;
  v_existing_event public.billing_payment_events;
  v_result text := lower(btrim(coalesce(p_result_status, '')));
  v_payment_status text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_provider_event_id, ''))) < 3 then raise exception 'provider_event_id_required'; end if;
  if length(btrim(coalesce(p_provider_session_id, ''))) < 3 then raise exception 'provider_session_id_required'; end if;
  if v_result not in ('succeeded', 'failed', 'canceled', 'expired') then raise exception 'invalid_stripe_result'; end if;
  if p_payload_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_payload_hash'; end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then raise exception 'invalid_metadata'; end if;

  select * into v_existing_event
  from public.billing_payment_events
  where provider_event_id = p_provider_event_id;
  if found then
    select * into v_attempt from public.billing_payment_attempts where id = v_existing_event.attempt_id;
    return v_attempt;
  end if;

  select * into v_attempt
  from public.billing_payment_attempts
  where provider = 'stripe' and environment = 'sandbox' and provider_session_id = p_provider_session_id
  for update;
  if not found then raise exception 'stripe_attempt_not_found'; end if;

  if v_attempt.status <> 'pending' then
    insert into public.billing_payment_events (
      attempt_id, organization_id, provider, environment, provider_event_id,
      event_type, result_status, processing_status, payload_sha256, processed_at
    ) values (
      v_attempt.id, v_attempt.organization_id, 'stripe', 'sandbox', p_provider_event_id,
      'checkout.session.' || v_result, v_result, 'ignored', p_payload_sha256, now()
    );
    return v_attempt;
  end if;

  update public.billing_payment_attempts
  set status = v_result,
      provider_fee_actual = p_provider_fee_actual,
      provider_net_amount = p_provider_net_amount,
      failure_code = case when v_result = 'failed' then 'stripe_payment_failed' when v_result = 'expired' then 'stripe_checkout_expired' else null end,
      failure_message = case when v_result = 'failed' then 'Stripe Test Mode payment failed' when v_result = 'expired' then 'Stripe Test Mode checkout expired' else null end,
      metadata = metadata || coalesce(p_metadata, '{}'::jsonb),
      completed_at = coalesce(p_occurred_at, now()),
      updated_at = now()
  where id = v_attempt.id
  returning * into v_attempt;

  insert into public.billing_payment_events (
    attempt_id, organization_id, provider, environment, provider_event_id,
    event_type, result_status, processing_status, payload_sha256, processed_at
  ) values (
    v_attempt.id, v_attempt.organization_id, 'stripe', 'sandbox', p_provider_event_id,
    'checkout.session.' || v_result, v_result, 'processed', p_payload_sha256, now()
  );

  select * into v_invoice from public.billing_invoices where id = v_attempt.invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;

  v_payment_status := case when v_result = 'succeeded' then 'paid' else 'failed' end;
  if v_invoice.status not in ('paid', 'canceled') then
    insert into public.billing_payments (
      payment_number, command_id, invoice_id, organization_id, provider, provider_reference,
      status, amount, currency, reason, metadata, recorded_by, occurred_at
    ) values (
      'PAY-' || to_char(coalesce(p_occurred_at, now()) at time zone 'Asia/Bangkok', 'YYYYMM') || '-' || lpad(nextval('public.billing_payment_number_seq')::text, 6, '0'),
      v_attempt.id, v_invoice.id, v_invoice.organization_id, 'stripe', v_attempt.provider_session_id,
      v_payment_status, v_attempt.amount, v_attempt.currency,
      case when v_result = 'succeeded' then 'Stripe Test Mode webhook confirmed payment' else 'Stripe Test Mode checkout did not complete' end,
      jsonb_build_object(
        'attempt_id', v_attempt.id,
        'provider_event_id', p_provider_event_id,
        'payment_method', v_attempt.payment_method,
        'estimated_provider_fee', v_attempt.estimated_provider_fee,
        'customer_fee_amount', v_attempt.customer_fee_amount,
        'customer_charge_amount', v_attempt.customer_charge_amount,
        'provider_fee_actual', p_provider_fee_actual,
        'provider_net_amount', p_provider_net_amount,
        'stripe_livemode', false
      ) || coalesce(p_metadata, '{}'::jsonb),
      v_attempt.created_by, coalesce(p_occurred_at, now())
    ) on conflict (command_id) do nothing;

    update public.billing_invoices
    set status = v_payment_status,
        paid_at = case when v_payment_status = 'paid' then coalesce(p_occurred_at, now()) else null end,
        failed_at = case when v_payment_status = 'failed' then coalesce(p_occurred_at, now()) else null end,
        canceled_at = null,
        updated_by = v_attempt.created_by,
        updated_at = now()
    where id = v_invoice.id;
  end if;

  return v_attempt;
end;
$function$;
