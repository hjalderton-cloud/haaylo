
DO $$ BEGIN
  CREATE POLICY "scheduler-media users read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'scheduler-media' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "scheduler-media users insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'scheduler-media' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "scheduler-media users delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'scheduler-media' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
