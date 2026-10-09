DROP POLICY IF EXISTS "Users view their own usage" ON public.engine_usage;

CREATE POLICY "Users view their own usage"
  ON public.engine_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);