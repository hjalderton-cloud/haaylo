ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS has_blog boolean NOT NULL DEFAULT false;
ALTER TABLE public.landing_page_leads ADD COLUMN IF NOT EXISTS source_platform text;

CREATE TABLE IF NOT EXISTS public.inbound_webhook_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform text NOT NULL,
  token text NOT NULL UNIQUE,
  landing_page_id uuid REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbound_webhook_tokens TO authenticated;
GRANT ALL ON public.inbound_webhook_tokens TO service_role;

ALTER TABLE public.inbound_webhook_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their inbound webhook tokens"
ON public.inbound_webhook_tokens
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS inbound_webhook_tokens_owner_idx
  ON public.inbound_webhook_tokens (user_id, project_id, platform);