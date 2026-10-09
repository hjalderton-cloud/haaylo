
REVOKE EXECUTE ON FUNCTION public.owns_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_project(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.has_director_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_director_access(uuid) TO authenticated, service_role;
