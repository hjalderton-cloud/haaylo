DROP POLICY IF EXISTS "Authenticated can read industry insights" ON public.industry_insights;
CREATE POLICY "Authenticated can read industry insights"
  ON public.industry_insights FOR SELECT
  TO authenticated
  USING (COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);