CREATE TABLE public.work_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  package_type text NOT NULL CHECK (package_type IN ('post_batch','landing_page','content_plan','strategy','campaign','email_sequence','lead_magnet','image_pack','standalone')),
  title text NOT NULL,
  parent_package_id uuid REFERENCES public.work_packages(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'generated',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_packages TO authenticated;
GRANT ALL ON public.work_packages TO service_role;
ALTER TABLE public.work_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their packages" ON public.work_packages
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND public.owns_project(project_id))
  WITH CHECK (auth.uid() = user_id AND public.owns_project(project_id));
CREATE INDEX work_packages_project_idx ON public.work_packages(project_id, created_at DESC);
CREATE TRIGGER work_packages_touch BEFORE UPDATE ON public.work_packages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.work_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('content_post','landing_page','strategy_plan','campaign','email','funnel','image')),
  asset_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  section text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, asset_type, asset_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_package_items TO authenticated;
GRANT ALL ON public.work_package_items TO service_role;
ALTER TABLE public.work_package_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their package items" ON public.work_package_items
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND public.owns_project(project_id))
  WITH CHECK (auth.uid() = user_id AND public.owns_project(project_id));
CREATE INDEX work_package_items_pkg_idx ON public.work_package_items(package_id, position);
CREATE INDEX work_package_items_asset_idx ON public.work_package_items(asset_type, asset_id);