REVOKE EXECUTE ON FUNCTION public.is_manager_of(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_manager_of(uuid, uuid) TO authenticated, service_role;
