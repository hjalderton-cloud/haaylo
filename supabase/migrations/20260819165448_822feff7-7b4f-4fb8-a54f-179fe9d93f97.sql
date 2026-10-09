SELECT cron.unschedule('founding-renewal-reminder');

SELECT cron.schedule(
  'founding-renewal-reminder',
  '0 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--4e72440c-8ce3-4dcc-a95d-571c3dc745d3.lovable.app/api/public/cron/founding-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjdmFodXFhanFxdm9kdGV6cXRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjE0ODAsImV4cCI6MjA5ODMzNzQ4MH0.lLstdc7JPr9dTDQciOL0sc0nzlVm4VyUyykiA4S6kqo'
    ),
    body := '{}'::jsonb
  );
  $cron$
);