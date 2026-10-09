REVOKE EXECUTE ON FUNCTION public.get_user_tier(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_director_access(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.owns_project(uuid) FROM authenticated;