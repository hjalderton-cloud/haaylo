CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  campaign_title text NOT NULL,
  campaign_theme text NOT NULL,
  campaign_duration varchar(10) NOT NULL DEFAULT '90-day',
  has_social_posts boolean NOT NULL DEFAULT false,
  has_landing_page boolean NOT NULL DEFAULT false,
  has_lead_magnet boolean NOT NULL DEFAULT false,
  has_email_sequence boolean NOT NULL DEFAULT false,
  has_image_pack boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own campaigns"
ON public.campaigns
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX campaigns_user_created_idx ON public.campaigns (user_id, created_at DESC);
CREATE INDEX campaigns_project_idx ON public.campaigns (project_id);

CREATE TRIGGER campaigns_touch_updated_at
BEFORE UPDATE ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();