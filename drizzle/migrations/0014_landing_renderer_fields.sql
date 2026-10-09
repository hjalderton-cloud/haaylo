ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS landing_page_headline text,
  ADD COLUMN IF NOT EXISTS landing_page_subheadline text,
  ADD COLUMN IF NOT EXISTS current_phase integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS phase_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phase_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS lead_magnet_content jsonb;

ALTER TABLE public.landing_pages
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.landing_page_leads
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS source_slug text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new';

CREATE INDEX IF NOT EXISTS landing_pages_campaign_id_idx ON public.landing_pages(campaign_id);
CREATE INDEX IF NOT EXISTS landing_page_leads_campaign_id_idx ON public.landing_page_leads(campaign_id);