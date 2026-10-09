ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS guide_title text,
  ADD COLUMN IF NOT EXISTS guide_intro text,
  ADD COLUMN IF NOT EXISTS guide_sections jsonb;