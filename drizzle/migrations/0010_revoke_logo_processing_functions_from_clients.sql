REVOKE EXECUTE ON FUNCTION public.reserve_logo_processing_daily_quota(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_logo_processing_concurrency_slot(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_logo_processing_concurrency_slot(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reclaim_stale_logo_processing_cache(text, text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.extend_logo_processing_lease(text, text, integer) FROM anon, authenticated;