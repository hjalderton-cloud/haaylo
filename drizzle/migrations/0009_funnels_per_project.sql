UPDATE public.funnels f
SET project_id = COALESCE(
  (SELECT p.id FROM public.projects p WHERE p.user_id = f.user_id AND p.is_default ORDER BY p.created_at LIMIT 1),
  (SELECT p.id FROM public.projects p WHERE p.user_id = f.user_id ORDER BY p.created_at LIMIT 1)
)
WHERE f.project_id IS NULL;

ALTER TABLE public.funnels DROP CONSTRAINT IF EXISTS funnels_user_id_key;
DROP INDEX IF EXISTS public.funnels_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS funnels_user_project_key
  ON public.funnels (user_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid));