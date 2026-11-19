-- E-mail draft assistant every 5 minutes (08:00-15:00 Israel time) / every 10 minutes (rest of the day), started by the database itself (owner request 19.11: "every 10 minutes, prepare
-- everything at once, no limit", then "from 8 to 3 every 5 minutes"). pg_cron calls the route /api/run-email-drafts through pg_net; the route checks the header
-- x-cron-secret against app_settings.email_drafts_cron_secret (admin-only table; generated here, never stored in git).
-- The route runs the assistant with DEDICATED_DRAFT_LIMITS (no cap on drafts per run, time budget 60 s) and pg_net waits up to
-- 100 s for the answer. The cron fires every 5 minutes around the clock; the window 07:30-23:50 Israel time, Shabbat and the gap
-- (4 min between 08:00 and 15:00, 9 min otherwise) are enforced by the code itself, so it effectively runs every 5 / 10 minutes. The old external route still calls the assistant, but only after 12 minutes of silence.
-- Results of the calls: select * from net._http_response order by created desc limit 5;  job log: cron.job_run_details.
-- Idempotent. Applied live via query_database (not registered in drizzle.__drizzle_migrations).

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

INSERT INTO public.app_settings (key, value)
VALUES ('email_drafts_cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (key) DO NOTHING;

-- renamed job: the first version was called email-drafts-every-10-min
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'email-drafts-every-10-min';

SELECT cron.schedule(
  'email-drafts-every-5-min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://sweetbabyphoto.shop/api/run-email-drafts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM public.app_settings WHERE key = 'email_drafts_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 100000
  );
  $cron$
);
