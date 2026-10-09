CREATE TABLE public.agent_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  risk text NOT NULL CHECK (risk IN ('LOW','MEDIUM','HIGH')),
  summary text,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','failed')),
  reason text,
  error text,
  result jsonb,
  expires_at timestamptz,
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_approvals_user_project_idx
  ON public.agent_approvals (user_id, project_id, created_at DESC);
CREATE INDEX agent_approvals_status_idx
  ON public.agent_approvals (user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_approvals TO authenticated;
GRANT ALL ON public.agent_approvals TO service_role;

ALTER TABLE public.agent_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own approvals"
  ON public.agent_approvals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users create their own approvals"
  ON public.agent_approvals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own approvals"
  ON public.agent_approvals FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own approvals"
  ON public.agent_approvals FOR DELETE TO authenticated
  USING (auth.uid() = user_id);