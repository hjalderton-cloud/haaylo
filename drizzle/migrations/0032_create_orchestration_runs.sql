CREATE TABLE public.orchestration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  goal text NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'running',
  stage text NOT NULL DEFAULT 'Reviewing your Business Brain',
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  placements jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_asset_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orchestration_runs TO authenticated;
GRANT ALL ON public.orchestration_runs TO service_role;
ALTER TABLE public.orchestration_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their orchestration runs" ON public.orchestration_runs
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.owns_project(project_id))
  WITH CHECK (user_id = auth.uid() AND public.owns_project(project_id));
CREATE INDEX orchestration_runs_project_idx ON public.orchestration_runs (project_id, created_at DESC);
CREATE TRIGGER orchestration_runs_touch BEFORE UPDATE ON public.orchestration_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();