-- AI Marketing Agent tier: scheduled plan runs in Review mode.
CREATE TABLE IF NOT EXISTS public.agent_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'review' CHECK (mode IN ('draft','review','auto')),
  cadence text NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('weekly','daily')),
  platforms text[] NOT NULL DEFAULT ARRAY['linkedin']::text[],
  posts_per_run integer NOT NULL DEFAULT 7 CHECK (posts_per_run BETWEEN 1 AND 14),
  approval_email text,
  active boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_settings TO authenticated;
GRANT ALL ON public.agent_settings TO service_role;
ALTER TABLE public.agent_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_settings owner rw" ON public.agent_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'weekly_plan' CHECK (kind IN ('weekly_plan','lead_reply','monthly_report')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','drafted','approved','failed','sent')),
  summary text,
  post_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_runs owner rw" ON public.agent_runs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.agent_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  insight text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_learnings TO authenticated;
GRANT ALL ON public.agent_learnings TO service_role;
ALTER TABLE public.agent_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_learnings owner rw" ON public.agent_learnings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS agent_settings_touch_updated_at ON public.agent_settings;
CREATE TRIGGER agent_settings_touch_updated_at BEFORE UPDATE ON public.agent_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
