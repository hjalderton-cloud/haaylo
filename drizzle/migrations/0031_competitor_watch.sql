CREATE TABLE public.competitor_watch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  competitor_url TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'all',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  last_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX competitor_watch_unique_idx
  ON public.competitor_watch (project_id, competitor_url);
CREATE INDEX competitor_watch_project_idx ON public.competitor_watch (project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_watch TO authenticated;
GRANT ALL ON public.competitor_watch TO service_role;

ALTER TABLE public.competitor_watch ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their competitor watches"
  ON public.competitor_watch
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.competitor_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  watch_id UUID NOT NULL REFERENCES public.competitor_watch(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  pillar TEXT NOT NULL DEFAULT '',
  angle_title TEXT NOT NULL DEFAULT '',
  angle_brief TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX competitor_signals_project_idx ON public.competitor_signals (project_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_signals TO authenticated;
GRANT ALL ON public.competitor_signals TO service_role;

ALTER TABLE public.competitor_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their competitor signals"
  ON public.competitor_signals
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);