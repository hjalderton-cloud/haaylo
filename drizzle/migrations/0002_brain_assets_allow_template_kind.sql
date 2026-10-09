ALTER TABLE public.brain_assets DROP CONSTRAINT IF EXISTS brain_assets_kind_check;
ALTER TABLE public.brain_assets ADD CONSTRAINT brain_assets_kind_check
  CHECK (kind IN ('logo','brand_guidelines','image','pdf','case_study','strategy_doc','template'));