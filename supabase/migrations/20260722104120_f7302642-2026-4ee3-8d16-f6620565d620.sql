ALTER TABLE public.engine_usage
  ADD COLUMN IF NOT EXISTS free_generation_used boolean NOT NULL DEFAULT false;

UPDATE public.engine_usage
SET free_generation_used = true,
    free_uses_remaining = 0,
    updated_at = now()
WHERE free_generation_used = false
  AND (
    free_uses_remaining <= 0
    OR free_starter_used = true
    OR free_voice_used = true
    OR free_posts_used = true
  );