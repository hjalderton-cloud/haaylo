GRANT UPDATE, DELETE ON public.landing_page_leads TO authenticated;

CREATE POLICY "Owners update their page leads"
ON public.landing_page_leads
FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.landing_pages p WHERE p.id = landing_page_leads.page_id AND p.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.landing_pages p WHERE p.id = landing_page_leads.page_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners delete their page leads"
ON public.landing_page_leads
FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.landing_pages p WHERE p.id = landing_page_leads.page_id AND p.user_id = auth.uid()));