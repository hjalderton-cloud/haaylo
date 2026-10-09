ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS plan_week_start integer,
  ADD COLUMN IF NOT EXISTS plan_week_end integer;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_plan_week_range_chk
  CHECK (
    (plan_week_start IS NULL OR (plan_week_start BETWEEN 1 AND 13))
    AND (plan_week_end IS NULL OR (plan_week_end BETWEEN 1 AND 13))
    AND (plan_week_start IS NULL OR plan_week_end IS NULL OR plan_week_start <= plan_week_end)
  );