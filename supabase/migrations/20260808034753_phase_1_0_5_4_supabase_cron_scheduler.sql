create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.invoke_subscription_notification_worker()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  app_url text;
  cron_secret text;
begin
  select decrypted_secret
  into app_url
  from vault.decrypted_secrets
  where name = 'avenzo_app_url';

  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'avenzo_cron_secret';

  if app_url is null or cron_secret is null then
    raise warning 'AVENZO Cron skipped: Vault secrets are not configured';
    return null;
  end if;

  return net.http_get(
    url => rtrim(app_url, '/') || '/api/cron/subscription-notifications',
    headers => pg_catalog.jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'User-Agent', 'AVENZO-Supabase-Cron/1.0'
    ),
    timeout_milliseconds => 15000
  );
end;
$$;

revoke all on function private.invoke_subscription_notification_worker() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'avenzo-subscription-notifications-hourly';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'avenzo-subscription-notifications-hourly',
    '0 * * * *',
    'select private.invoke_subscription_notification_worker();'
  );
end;
$$;
