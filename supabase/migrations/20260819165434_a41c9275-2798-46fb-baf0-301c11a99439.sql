SELECT cron.unschedule('founding-renewal-reminder')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'founding-renewal-reminder');

SELECT cron.schedule(
  'founding-renewal-reminder',
  '0 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--4e72440c-8ce3-4dcc-a95d-571c3dc745d3.lovable.app/api/public/cron/founding-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', current_setting('app.settings.publishable_key', true)
    ),
    body := '{}'::jsonb
  );
  $cron$
);