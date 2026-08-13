-- Phase 1.2.4.2.1: explicit permission allowlist for public SECURITY DEFINER functions.
-- This migration intentionally leaves ordinary SECURITY INVOKER RPCs unchanged.

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

do $function_permissions$
declare
  v_signature text;

  -- AUTHENTICATED_ALLOWLIST_BEGIN
  v_authenticated text[] := array[
    'public.app_claim_my_session_security_email(text)',
    'public.app_complete_my_session_security_email(uuid,boolean,text,text)',
    'public.app_current_session_status()',
    'public.app_list_my_session_security_activity(integer)',
    'public.app_list_my_sessions()',
    'public.app_register_current_session()',
    'public.app_revoke_my_other_sessions()',
    'public.app_revoke_my_session(uuid)',
    'public.app_touch_current_session()',
    'public.app_update_current_session_device(text,text,text)',
    'public.customer_active_billing_transfer_channels(uuid)',
    'public.customer_finalize_billing_transfer_proof(uuid)',
    'public.customer_prepare_billing_transfer_proof(uuid,uuid,text,text,bigint,numeric,timestamp with time zone,text,uuid)',
    'public.platform_admin_directory()',
    'public.platform_billing_transfer_approval_policy()',
    'public.platform_billing_transfer_fulfillment_queue_v2()',
    'public.platform_billing_transfer_proof_review_queue()',
    'public.platform_cancel_billing_invoice_document(uuid,text)',
    'public.platform_cancel_billing_live_activation(uuid,uuid,text)',
    'public.platform_create_billing_credit_note(uuid,numeric,numeric,text,uuid)',
    'public.platform_create_billing_invoice(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,numeric,numeric,timestamp with time zone,text,uuid,jsonb)',
    'public.platform_create_sandbox_payment_attempt(uuid,uuid)',
    'public.platform_fulfill_billing_transfer_proof(uuid,text,uuid)',
    'public.platform_issue_billing_invoice_document(uuid,uuid)',
    'public.platform_manage_admin_access(uuid,text,text,text,text,text)',
    'public.platform_preview_billing_live_rollout(uuid,text,numeric,text)',
    'public.platform_record_billing_payment(uuid,text,numeric,text,text,text,uuid,timestamp with time zone,jsonb)',
    'public.platform_record_billing_production_readiness_review(uuid,jsonb,text)',
    'public.platform_request_billing_live_activation(uuid,text)',
    'public.platform_review_billing_live_activation(uuid,uuid,text,text)',
    'public.platform_review_billing_transfer_proof_v2(uuid,text,text,uuid,boolean,text)',
    'public.platform_set_billing_live_safety_state(uuid,text,text)',
    'public.platform_set_billing_live_tester(uuid,text,boolean,text)',
    'public.platform_simulate_sandbox_payment_event(uuid,text,uuid)',
    'public.platform_subscription_notification_health(timestamp with time zone)',
    'public.platform_trigger_billing_live_rollback(uuid,text)',
    'public.platform_update_billing_live_rollout_policy(uuid,numeric,numeric,integer,text)',
    'public.platform_update_billing_transfer_approval_policy(numeric,boolean,text,uuid,bigint)',
    'public.platform_update_own_admin_profile(uuid,text,text)',
    'public.platform_upsert_billing_customer_profile(uuid,text,text,text,text,text,text)',
    'public.platform_upsert_billing_issuer_profile(text,text,text,text,text,text)',
    'public.platform_upsert_billing_transfer_channel(uuid,text,text,text,text,text,text,text,integer,text,uuid)'
  ];
  -- AUTHENTICATED_ALLOWLIST_END

  -- SERVICE_ROLE_ONLY_BEGIN
  v_service_only text[] := array[
    -- Internal policy resolver; called by trusted database routines, not the browser.
    'public.current_app_session_policy()',
    -- Legacy endpoints retained for compatibility but not used by the current app.
    'public.platform_billing_transfer_fulfillment_queue()',
    'public.platform_cancel_billing_credit_note(uuid,text)',
    'public.platform_review_billing_transfer_proof(uuid,text,text,uuid)',
    -- Stripe webhook and notification workers are server-only entry points.
    'public.server_process_stripe_test_event(text,text,text,timestamp with time zone,text,numeric,numeric,jsonb)',
    'public.server_repair_stripe_test_invoice_from_attempt(uuid,uuid,uuid,text)',
    'public.worker_cancel_suppressed_notification(uuid,uuid,timestamp with time zone)',
    'public.worker_claim_subscription_notifications(text,integer,timestamp with time zone)',
    'public.worker_complete_subscription_notification(uuid,uuid,boolean,text,text,text,jsonb,timestamp with time zone)',
    'public.worker_count_due_subscription_notifications(timestamp with time zone)',
    'public.worker_finish_subscription_notification_run(uuid,text,integer,integer,integer,integer,integer,integer,integer,integer,text,timestamp with time zone)',
    'public.worker_generate_subscription_notification_queue(timestamp with time zone)',
    'public.worker_record_resend_webhook(text,text,text,timestamp with time zone,jsonb,timestamp with time zone)',
    'public.worker_start_subscription_notification_run(text,text,timestamp with time zone)'
  ];
  -- SERVICE_ROLE_ONLY_END
begin
  -- Start from deny-by-default for every audited SECURITY DEFINER function.
  foreach v_signature in array (v_authenticated || v_service_only)
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated, service_role',
      v_signature
    );
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;

  -- Browser/server-session clients receive only the reviewed application surface.
  foreach v_signature in array v_authenticated
  loop
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end
$function_permissions$;
