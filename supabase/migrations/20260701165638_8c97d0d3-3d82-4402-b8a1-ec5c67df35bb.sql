
DROP POLICY IF EXISTS "brain assets owner read" ON storage.objects;
DROP POLICY IF EXISTS "brain assets owner insert" ON storage.objects;
DROP POLICY IF EXISTS "brain assets owner delete" ON storage.objects;

CREATE POLICY "brain assets owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'scheduler-media'
  AND ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
  AND (storage.foldername(name))[1] = 'brain'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "brain assets owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'scheduler-media'
  AND ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
  AND (storage.foldername(name))[1] = 'brain'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "brain assets owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'scheduler-media'
  AND ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
  AND (storage.foldername(name))[1] = 'brain'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
