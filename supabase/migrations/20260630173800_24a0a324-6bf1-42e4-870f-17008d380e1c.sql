
-- ============ projects ============
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_user_idx ON public.projects(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects owner all" ON public.projects FOR ALL TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE)
  WITH CHECK (auth.uid() = user_id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);

-- ownership helper to avoid recursive policies
CREATE OR REPLACE FUNCTION public.owns_project(_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = auth.uid())
$$;

-- ============ business_brains ============
CREATE TABLE public.business_brains (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_brains TO authenticated;
GRANT ALL ON public.business_brains TO service_role;
ALTER TABLE public.business_brains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brain owner all" ON public.business_brains FOR ALL TO authenticated
  USING (public.owns_project(project_id) AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE)
  WITH CHECK (public.owns_project(project_id) AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);

-- ============ brain_assets ============
CREATE TABLE public.brain_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('logo','brand_guidelines','image','pdf','case_study')),
  storage_path text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brain_assets_project_idx ON public.brain_assets(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_assets TO authenticated;
GRANT ALL ON public.brain_assets TO service_role;
ALTER TABLE public.brain_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brain_assets owner all" ON public.brain_assets FOR ALL TO authenticated
  USING (public.owns_project(project_id) AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE)
  WITH CHECK (public.owns_project(project_id) AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);

-- ============ marketing_history ============
CREATE TABLE public.marketing_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  title text,
  prompt jsonb,
  output text,
  tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_history_project_created_idx
  ON public.marketing_history(project_id, created_at DESC);
CREATE INDEX marketing_history_search_idx
  ON public.marketing_history USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(output,'')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_history TO authenticated;
GRANT ALL ON public.marketing_history TO service_role;
ALTER TABLE public.marketing_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "history owner all" ON public.marketing_history FOR ALL TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE)
  WITH CHECK (auth.uid() = user_id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);

-- ============ director_recommendations ============
CREATE TABLE public.director_recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  recommendations jsonb NOT NULL,
  dismissed_at timestamptz
);
CREATE INDEX director_recs_project_idx
  ON public.director_recommendations(project_id, generated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.director_recommendations TO authenticated;
GRANT ALL ON public.director_recommendations TO service_role;
ALTER TABLE public.director_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "director_recs owner all" ON public.director_recommendations FOR ALL TO authenticated
  USING (public.owns_project(project_id) AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE)
  WITH CHECK (public.owns_project(project_id) AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);

-- ============ has_director_access (premium entitlement) ============
CREATE OR REPLACE FUNCTION public.has_director_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND status IN ('active','trialing')
      AND (current_period_end IS NULL OR current_period_end > now() - interval '1 day')
  );
$$;

-- ============ touch updated_at triggers ============
CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER business_brains_touch BEFORE UPDATE ON public.business_brains
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ extend handle_new_user ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_project_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.engine_usage (user_id, free_uses_remaining)
  VALUES (NEW.id, 1)
  ON CONFLICT (user_id) DO NOTHING;

  -- default workspace + empty brain (skip for anonymous users)
  IF (NEW.is_anonymous IS NOT TRUE) THEN
    INSERT INTO public.projects (user_id, name, is_default)
    VALUES (NEW.id, 'Default workspace', true)
    RETURNING id INTO new_project_id;

    INSERT INTO public.business_brains (project_id, data)
    VALUES (new_project_id, '{}'::jsonb);
  END IF;

  RETURN NEW;
END;
$$;
