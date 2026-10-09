CREATE TABLE public.content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  caption text NOT NULL DEFAULT '',
  title text,
  platform text NOT NULL DEFAULT 'linkedin',
  pillar text,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  media_url text,
  media_path text,
  plan_slot text,
  hashtags text[] NOT NULL DEFAULT '{}',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_post_id uuid REFERENCES public.scheduled_posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_posts TO authenticated;
GRANT ALL ON public.content_posts TO service_role;

ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own content posts"
ON public.content_posts FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX content_posts_user_idx ON public.content_posts (user_id, created_at DESC);
CREATE INDEX content_posts_project_idx ON public.content_posts (project_id, status);

CREATE TRIGGER content_posts_touch_updated_at
BEFORE UPDATE ON public.content_posts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();