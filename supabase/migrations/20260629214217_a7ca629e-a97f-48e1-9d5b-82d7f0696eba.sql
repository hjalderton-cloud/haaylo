
CREATE TABLE IF NOT EXISTS public.engine_usage (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  free_uses_remaining int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.engine_usage TO authenticated;
GRANT ALL ON public.engine_usage TO service_role;

ALTER TABLE public.engine_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own usage"
  ON public.engine_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Update handle_new_user to also seed engine_usage
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.engine_usage (user_id, free_uses_remaining)
  VALUES (NEW.id, 1)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill any existing users who don't have a usage row yet
INSERT INTO public.engine_usage (user_id, free_uses_remaining)
SELECT id, 1 FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
