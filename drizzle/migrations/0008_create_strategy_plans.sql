CREATE TABLE public.strategy_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_plans TO authenticated;
GRANT ALL ON public.strategy_plans TO service_role;

ALTER TABLE public.strategy_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own strategy plan"
ON public.strategy_plans
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);