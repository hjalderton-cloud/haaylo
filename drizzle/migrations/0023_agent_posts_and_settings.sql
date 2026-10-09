CREATE TABLE IF NOT EXISTS public.agent_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  platform text NOT NULL DEFAULT 'linkedin',
  pillar text,
  title text,
  caption text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reject_reason text,
  scheduled_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  published_at timestamptz,
  scheduled_post_id uuid REFERENCES public.scheduled_posts(id) ON DELETE SET NULL,
  external_post_id text,
  media_url text,
  media_path text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_posts TO authenticated;
GRANT ALL ON public.agent_posts TO service_role;

ALTER TABLE public.agent_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their agent posts"
  ON public.agent_posts FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS agent_posts_user_project_idx ON public.agent_posts (user_id, project_id, status, created_at DESC);

CREATE TRIGGER agent_posts_touch_updated_at
  BEFORE UPDATE ON public.agent_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.agent_settings ADD COLUMN IF NOT EXISTS tone_override text;
ALTER TABLE public.agent_settings ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;