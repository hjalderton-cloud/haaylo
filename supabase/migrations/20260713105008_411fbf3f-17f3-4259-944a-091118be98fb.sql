CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE public.waitlist_signups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email citext NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'waitlist',
  notified boolean NOT NULL DEFAULT false,
  notified_at timestamptz,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.waitlist_signups TO service_role;

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: all writes go through the server function
-- using the service-role client. The list stays private.

CREATE TRIGGER waitlist_signups_touch_updated_at
  BEFORE UPDATE ON public.waitlist_signups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();