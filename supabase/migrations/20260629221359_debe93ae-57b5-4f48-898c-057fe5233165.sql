
DO $$ BEGIN
  CREATE TYPE public.social_provider AS ENUM ('linkedin','linkedin_company','facebook_page','instagram');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.post_status AS ENUM ('draft','scheduled','publishing','published','failed','canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.target_status AS ENUM ('pending','publishing','published','failed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.social_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider public.social_provider NOT NULL,
  external_id TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  scopes TEXT,
  token_expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_connections TO authenticated;
GRANT ALL ON public.social_connections TO service_role;
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view their own connections" ON public.social_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users delete their own connections" ON public.social_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  caption TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  media_path TEXT,
  scheduled_at TIMESTAMPTZ,
  status public.post_status NOT NULL DEFAULT 'draft',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_posts TO authenticated;
GRANT ALL ON public.scheduled_posts TO service_role;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage their own posts" ON public.scheduled_posts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS scheduled_posts_due_idx
  ON public.scheduled_posts (scheduled_at) WHERE status = 'scheduled';

CREATE TABLE IF NOT EXISTS public.post_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.scheduled_posts(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.social_connections(id) ON DELETE CASCADE,
  status public.target_status NOT NULL DEFAULT 'pending',
  external_post_id TEXT,
  permalink TEXT,
  error_message TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, connection_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_targets TO authenticated;
GRANT ALL ON public.post_targets TO service_role;
ALTER TABLE public.post_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own post targets" ON public.post_targets
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.scheduled_posts p WHERE p.id = post_targets.post_id AND p.user_id = auth.uid()));
CREATE POLICY "users insert own post targets" ON public.post_targets
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.scheduled_posts p WHERE p.id = post_targets.post_id AND p.user_id = auth.uid()));
CREATE POLICY "users update own post targets" ON public.post_targets
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.scheduled_posts p WHERE p.id = post_targets.post_id AND p.user_id = auth.uid()));
CREATE POLICY "users delete own post targets" ON public.post_targets
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.scheduled_posts p WHERE p.id = post_targets.post_id AND p.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_social_connections_updated
  BEFORE UPDATE ON public.social_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_scheduled_posts_updated
  BEFORE UPDATE ON public.scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_post_targets_updated
  BEFORE UPDATE ON public.post_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
