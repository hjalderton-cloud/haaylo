ALTER TABLE public.landing_page_leads
  ADD COLUMN IF NOT EXISTS synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_error text;

CREATE INDEX IF NOT EXISTS landing_page_leads_synced_idx
  ON public.landing_page_leads (page_id, synced_at);