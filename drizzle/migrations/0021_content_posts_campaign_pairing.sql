ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paired_landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paired_guide_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_posts_campaign_id_idx ON public.content_posts (campaign_id);