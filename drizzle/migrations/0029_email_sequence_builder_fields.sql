ALTER TABLE public.email_sequences
  ADD COLUMN IF NOT EXISTS preview_text TEXT,
  ADD COLUMN IF NOT EXISTS audience_id TEXT,
  ADD COLUMN IF NOT EXISTS audience_name TEXT,
  ADD COLUMN IF NOT EXISTS planned_send_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT,
  ADD COLUMN IF NOT EXISTS hero_image_path TEXT,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.email_sequences ALTER COLUMN campaign_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS email_sequences_project_idx ON public.email_sequences (project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sequences TO authenticated;
GRANT ALL ON public.email_sequences TO service_role;