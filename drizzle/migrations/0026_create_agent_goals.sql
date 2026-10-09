CREATE TABLE IF NOT EXISTS public.agent_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  goal text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','completed','failed')),
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_goal_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.agent_goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','awaiting_approval','approved','rejected','error')),
  result jsonb,
  error text,
  approval_id uuid REFERENCES public.agent_approvals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_goals TO authenticated;
GRANT ALL ON public.agent_goals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_goal_steps TO authenticated;
GRANT ALL ON public.agent_goal_steps TO service_role;

ALTER TABLE public.agent_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_goal_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their agent goals"
  ON public.agent_goals FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners manage their agent goal steps"
  ON public.agent_goal_steps FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS agent_goals_user_project_idx ON public.agent_goals (user_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_goal_steps_goal_idx ON public.agent_goal_steps (goal_id, created_at ASC);

CREATE TRIGGER agent_goals_touch_updated_at
  BEFORE UPDATE ON public.agent_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();