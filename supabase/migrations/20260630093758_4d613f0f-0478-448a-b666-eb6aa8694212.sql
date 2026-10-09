DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE)
  WITH CHECK (auth.uid() = id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);