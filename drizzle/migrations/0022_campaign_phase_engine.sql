ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS checkout_url TEXT;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS cart_closes_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  phase INTEGER NOT NULL DEFAULT 1,
  email_subject TEXT NOT NULL DEFAULT '',
  email_body TEXT NOT NULL DEFAULT '',
  send_order INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sequences TO authenticated;
GRANT ALL ON public.email_sequences TO service_role;

ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own email sequences"
ON public.email_sequences
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS email_sequences_campaign_idx
  ON public.email_sequences (campaign_id, phase, send_order);

CREATE TRIGGER email_sequences_touch_updated_at
BEFORE UPDATE ON public.email_sequences
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();