
-- Content Bank
CREATE TABLE public.content_bank_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('post','blog','email','headline','hook','cta','campaign','idea','image_prompt','image','asset','other')),
  title text,
  body text,
  tags text[] NOT NULL DEFAULT '{}',
  collection text,
  is_favourite boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  source_history_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX content_bank_project_idx ON public.content_bank_items(project_id, created_at DESC);
CREATE INDEX content_bank_user_idx ON public.content_bank_items(user_id, created_at DESC);
CREATE INDEX content_bank_search_idx ON public.content_bank_items USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_bank_items TO authenticated;
GRANT ALL ON public.content_bank_items TO service_role;

ALTER TABLE public.content_bank_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank owner all"
ON public.content_bank_items FOR ALL TO authenticated
USING (
  auth.uid() = user_id
  AND ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
  AND EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = content_bank_items.project_id AND pr.user_id = auth.uid())
)
WITH CHECK (
  auth.uid() = user_id
  AND ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
  AND EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = content_bank_items.project_id AND pr.user_id = auth.uid())
);

CREATE TRIGGER content_bank_touch_updated
BEFORE UPDATE ON public.content_bank_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage policies for brain assets (reuse the existing scheduler-media private bucket under brain/{userId}/…).
-- User-scoped folder prefix so RLS matches file owner cleanly.
CREATE POLICY "brain assets owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'scheduler-media'
  AND (storage.foldername(name))[1] = 'brain'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "brain assets owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'scheduler-media'
  AND (storage.foldername(name))[1] = 'brain'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "brain assets owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'scheduler-media'
  AND (storage.foldername(name))[1] = 'brain'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
