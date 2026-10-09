-- Fix subscriptions table so both Engine and Scheduler subscriptions can coexist.
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS product TEXT DEFAULT 'scheduler';
UPDATE public.subscriptions SET product = 'scheduler' WHERE product IS NULL;

-- Drop the old single-subscription-per-user constraint and add composite key.
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_key;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_product_key UNIQUE (user_id, product);

-- Update the helper so it only looks at Scheduler subscriptions.
CREATE OR REPLACE FUNCTION public.has_active_scheduler(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND product = 'scheduler'
      AND status IN ('active','trialing')
      AND (current_period_end IS NULL OR current_period_end > now() - interval '1 day')
  );
$$;

-- Helper: does the user have an active Engine subscription?
CREATE OR REPLACE FUNCTION public.has_active_engine(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND product = 'engine'
      AND status IN ('active','trialing')
      AND (current_period_end IS NULL OR current_period_end > now() - interval '1 day')
  );
$$;
