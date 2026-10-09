
-- Fix 1: Block anonymous users on post_targets policies
DROP POLICY IF EXISTS "users view own post targets" ON public.post_targets;
DROP POLICY IF EXISTS "users insert own post targets" ON public.post_targets;
DROP POLICY IF EXISTS "users update own post targets" ON public.post_targets;
DROP POLICY IF EXISTS "users delete own post targets" ON public.post_targets;

CREATE POLICY "users view own post targets" ON public.post_targets
  FOR SELECT TO authenticated
  USING (
    ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
    AND EXISTS (SELECT 1 FROM public.scheduled_posts p WHERE p.id = post_targets.post_id AND p.user_id = auth.uid())
  );

CREATE POLICY "users insert own post targets" ON public.post_targets
  FOR INSERT TO authenticated
  WITH CHECK (
    ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
    AND EXISTS (SELECT 1 FROM public.scheduled_posts p WHERE p.id = post_targets.post_id AND p.user_id = auth.uid())
  );

CREATE POLICY "users update own post targets" ON public.post_targets
  FOR UPDATE TO authenticated
  USING (
    ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
    AND EXISTS (SELECT 1 FROM public.scheduled_posts p WHERE p.id = post_targets.post_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
    AND EXISTS (SELECT 1 FROM public.scheduled_posts p WHERE p.id = post_targets.post_id AND p.user_id = auth.uid())
  );

CREATE POLICY "users delete own post targets" ON public.post_targets
  FOR DELETE TO authenticated
  USING (
    ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
    AND EXISTS (SELECT 1 FROM public.scheduled_posts p WHERE p.id = post_targets.post_id AND p.user_id = auth.uid())
  );

-- Fix 2: Inline owns_project() into RLS policies and revoke EXECUTE from signed-in users on SECURITY DEFINER helpers
DROP POLICY IF EXISTS "brain owner all" ON public.business_brains;
CREATE POLICY "brain owner all" ON public.business_brains
  FOR ALL TO authenticated
  USING (
    (((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE))
    AND EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = business_brains.project_id AND pr.user_id = auth.uid())
  )
  WITH CHECK (
    (((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE))
    AND EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = business_brains.project_id AND pr.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "brain_assets owner all" ON public.brain_assets;
CREATE POLICY "brain_assets owner all" ON public.brain_assets
  FOR ALL TO authenticated
  USING (
    (((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE))
    AND EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = brain_assets.project_id AND pr.user_id = auth.uid())
  )
  WITH CHECK (
    (((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE))
    AND EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = brain_assets.project_id AND pr.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "director_recs owner all" ON public.director_recommendations;
CREATE POLICY "director_recs owner all" ON public.director_recommendations
  FOR ALL TO authenticated
  USING (
    (((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE))
    AND EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = director_recommendations.project_id AND pr.user_id = auth.uid())
  )
  WITH CHECK (
    (((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE))
    AND EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = director_recommendations.project_id AND pr.user_id = auth.uid())
  );

REVOKE EXECUTE ON FUNCTION public.owns_project(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_director_access(uuid) FROM PUBLIC, anon, authenticated;
