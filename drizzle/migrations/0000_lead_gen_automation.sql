CREATE TABLE public.lead_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT 'Keyword capture',
  connection_id uuid REFERENCES public.social_connections(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'all_posts',
  target_post_ids text[] NOT NULL DEFAULT '{}',
  keywords text[] NOT NULL DEFAULT '{}',
  match_mode text NOT NULL DEFAULT 'contains',
  comment_reply_variants text[] NOT NULL DEFAULT '{}',
  dm_message text NOT NULL DEFAULT '',
  followup_message text,
  followup_delay_hours integer NOT NULL DEFAULT 24,
  dedupe_per_person boolean NOT NULL DEFAULT true,
  ignore_handles text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_automations TO authenticated;
GRANT ALL ON public.lead_automations TO service_role;
ALTER TABLE public.lead_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead automations" ON public.lead_automations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_lead_automations_updated BEFORE UPDATE ON public.lead_automations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.lead_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  automation_id uuid REFERENCES public.lead_automations(id) ON DELETE SET NULL,
  platform text NOT NULL,
  external_comment_id text NOT NULL,
  commenter_external_id text,
  commenter_name text,
  commenter_handle text,
  avatar_url text,
  comment_text text NOT NULL DEFAULT '',
  post_external_id text,
  post_permalink text,
  matched_keyword text,
  reply_status text NOT NULL DEFAULT 'pending',
  dm_status text NOT NULL DEFAULT 'pending',
  followup_status text NOT NULL DEFAULT 'none',
  notes text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_comment_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_captures TO authenticated;
GRANT ALL ON public.lead_captures TO service_role;
ALTER TABLE public.lead_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead captures" ON public.lead_captures
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_lead_captures_updated BEFORE UPDATE ON public.lead_captures
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_lead_captures_user_created ON public.lead_captures (user_id, created_at DESC);

CREATE TABLE public.lead_automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capture_id uuid REFERENCES public.lead_captures(id) ON DELETE CASCADE,
  automation_id uuid REFERENCES public.lead_automations(id) ON DELETE SET NULL,
  kind text NOT NULL,
  ok boolean NOT NULL DEFAULT false,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lead_automation_events TO authenticated;
GRANT ALL ON public.lead_automation_events TO service_role;
ALTER TABLE public.lead_automation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead events" ON public.lead_automation_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_lead_events_capture ON public.lead_automation_events (capture_id, created_at DESC);