CREATE TABLE IF NOT EXISTS public.industry_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_key text NOT NULL,
  period text NOT NULL,
  insights text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (industry_key, period)
);
GRANT SELECT ON public.industry_insights TO authenticated;
GRANT ALL ON public.industry_insights TO service_role;
ALTER TABLE public.industry_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read industry insights"
  ON public.industry_insights FOR SELECT
  TO authenticated
  USING (true);