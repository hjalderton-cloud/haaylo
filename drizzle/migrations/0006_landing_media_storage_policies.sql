create policy "Users upload their own landing media"
on storage.objects for insert to authenticated
with check (bucket_id = 'landing-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users read their own landing media"
on storage.objects for select to authenticated
using (bucket_id = 'landing-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete their own landing media"
on storage.objects for delete to authenticated
using (bucket_id = 'landing-media' and (storage.foldername(name))[1] = auth.uid()::text);