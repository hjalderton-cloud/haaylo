ALTER TABLE public.strategy_plans ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

UPDATE public.strategy_plans sp
SET project_id = (
  SELECT p.id FROM public.projects p
  WHERE p.user_id = sp.user_id
  ORDER BY p.is_default DESC, p.created_at ASC
  LIMIT 1
)
WHERE sp.project_id IS NULL;

ALTER TABLE public.strategy_plans DROP CONSTRAINT IF EXISTS strategy_plans_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS strategy_plans_user_project_key
  ON public.strategy_plans (user_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid));