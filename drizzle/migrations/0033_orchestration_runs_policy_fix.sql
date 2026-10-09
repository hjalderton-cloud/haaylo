DROP POLICY IF EXISTS "Owners manage their orchestration runs" ON public.orchestration_runs;
CREATE POLICY "Owners manage their orchestration runs" ON public.orchestration_runs
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()))
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));