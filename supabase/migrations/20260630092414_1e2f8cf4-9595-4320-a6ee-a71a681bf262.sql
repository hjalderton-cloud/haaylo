DROP POLICY IF EXISTS "Users view their own subscription" ON public.subscriptions;
CREATE POLICY "Users view their own subscription" ON public.subscriptions
FOR SELECT TO authenticated
USING (auth.uid() = user_id AND (auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE);