REVOKE EXECUTE ON FUNCTION public.has_active_scheduler(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_scheduler(UUID) TO service_role;