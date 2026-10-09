
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent: drop any prior job with this name, then re-schedule.
DO $$ BEGIN
  PERFORM cron.unschedule('scheduler-publish-every-minute');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'scheduler-publish-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--4e72440c-8ce3-4dcc-a95d-571c3dc745d3.lovable.app/api/public/cron/publish',
    headers := '{"Content-Type":"application/json","x-cron-secret":"de990176877db99524cf6bb90c8d2bba8529a6f4d298f69dbfee0fe926286565"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
