
-- Add missing INSERT/UPDATE policies on social_connections
CREATE POLICY "users insert their own connections"
  ON public.social_connections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);

CREATE POLICY "users update their own connections"
  ON public.social_connections FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE)
  WITH CHECK (auth.uid() = user_id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);

-- Tighten existing SELECT/DELETE on social_connections to exclude anonymous users
DROP POLICY "users view their own connections" ON public.social_connections;
DROP POLICY "users delete their own connections" ON public.social_connections;

CREATE POLICY "users view their own connections"
  ON public.social_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);

CREATE POLICY "users delete their own connections"
  ON public.social_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);

-- Storage: add UPDATE policy and exclude anonymous users from all scheduler-media policies
DROP POLICY "scheduler-media users read own" ON storage.objects;
DROP POLICY "scheduler-media users insert own" ON storage.objects;
DROP POLICY "scheduler-media users delete own" ON storage.objects;

CREATE POLICY "scheduler-media users read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'scheduler-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE
  );

CREATE POLICY "scheduler-media users insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'scheduler-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE
  );

CREATE POLICY "scheduler-media users update own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'scheduler-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE
  )
  WITH CHECK (
    bucket_id = 'scheduler-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE
  );

CREATE POLICY "scheduler-media users delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'scheduler-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE
  );
