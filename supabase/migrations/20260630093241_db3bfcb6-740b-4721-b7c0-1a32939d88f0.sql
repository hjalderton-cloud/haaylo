DROP POLICY IF EXISTS "users manage their own posts" ON public.scheduled_posts;
CREATE POLICY "users manage their own posts" ON public.scheduled_posts
FOR ALL TO authenticated
USING (auth.uid() = user_id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE)
WITH CHECK (auth.uid() = user_id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);