CREATE TABLE public.competitor_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  competitor_name text NOT NULL,
  competitor_url text,
  platform text NOT NULL DEFAULT 'all',
  results_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_scans TO authenticated;
GRANT ALL ON public.competitor_scans TO service_role;

ALTER TABLE public.competitor_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own competitor scans"
ON public.competitor_scans
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX competitor_scans_user_project_created_idx
ON public.competitor_scans (user_id, project_id, created_at DESC);