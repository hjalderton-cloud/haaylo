CREATE TABLE public.mailchimp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mailchimp_api_key text,
  mailchimp_server_prefix text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mailchimp_settings TO authenticated;
GRANT ALL ON public.mailchimp_settings TO service_role;
ALTER TABLE public.mailchimp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own mailchimp settings"
  ON public.mailchimp_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.brand_brain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name text,
  target_audience text,
  brand_voice text,
  primary_color text,
  secondary_color text,
  logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_brain TO authenticated;
GRANT ALL ON public.brand_brain TO service_role;
ALTER TABLE public.brand_brain ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own brand brain"
  ON public.brand_brain FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER brand_brain_touch_updated_at
  BEFORE UPDATE ON public.brand_brain
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();