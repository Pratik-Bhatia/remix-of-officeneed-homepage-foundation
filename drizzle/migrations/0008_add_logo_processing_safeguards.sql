-- Safeguards around the remove.bg background-removal integration
-- (processLogoServer, src/lib/image-processing.functions.ts): server-side
-- dedup/caching keyed by a content fingerprint computed from the actual
-- decoded upload bytes (never a client-supplied value), plus a per-attempt
-- usage log used for rate-limit/usage-cap counting and audit. Both tables
-- are service-role-only -- there is no legitimate reason for a browser to
-- read or write either directly.

-- One row per distinct uploaded image (fingerprint = sha256 of the
-- validated image bytes + the remove.bg "size" parameter actually
-- requested). The UNIQUE/PRIMARY KEY constraint on fingerprint is the
-- atomicity primitive that prevents two concurrent requests for the
-- IDENTICAL file both calling remove.bg: the first request's
-- INSERT ... ON CONFLICT DO NOTHING wins the row; every other concurrent
-- request for the same fingerprint gets back no row and polls this table
-- for the winner's result instead of calling the API itself.
--
-- owner_token and lease_expires_at implement a time-bounded lease to safely
-- recover stale in-progress records left behind if a Worker crashes or is
-- killed mid-execution:
-- - While lease_expires_at > now(), the request is actively protected and
--   no other caller may reclaim it.
-- - If lease_expires_at <= now(), a subsequent request can atomically reclaim
--   the row and become the new owner.
-- - Only the worker presenting the matching owner_token can finalize the row
--   (succeeded or failed), ensuring late or revived workers cannot overwrite
--   a reclaimed record.
CREATE TABLE public.logo_processing_cache (
  fingerprint text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('in_progress', 'succeeded', 'failed')),
  owner_token text,
  lease_expires_at timestamptz,
  uv_logo_url text,
  laser_logo_url text,
  credits_charged text,
  response_type text,
  response_width text,
  response_height text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_logo_processing_cache_lease ON public.logo_processing_cache (fingerprint, status, lease_expires_at);
GRANT ALL ON public.logo_processing_cache TO service_role;
ALTER TABLE public.logo_processing_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to logo processing cache" ON public.logo_processing_cache FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER update_logo_processing_cache_updated_at BEFORE UPDATE ON public.logo_processing_cache FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- One row per processing ATTEMPT, not per upload event -- a cache hit, a
-- validation rejection, a rate-limit rejection, and a safeguard-store-
-- unavailable rejection each still get a row here, correctly flagged, so
-- the audit trail answers "what actually happened" even when no remove.bg
-- call was made. This table is the audit log only: the daily/global and
-- per-identity concurrency CAPS themselves are enforced by the separate,
-- atomically-reserved counters and leases in
-- 20261021143000_add_logo_processing_atomic_quota.sql, not by counting
-- rows here (a plain COUNT-then-compare over this table would have the
-- same race a concurrent burst of requests could exploit). was_outbound_call
-- still records, per row, whether that attempt actually reached remove.bg's
-- API -- useful for reporting/debugging -- but is no longer what the caps
-- themselves are computed from.
--
-- identity_key is a salted hash of the requester's IP (the strongest
-- identity this app can verify server-side for a guest -- see
-- hashIdentityKey in image-processing.functions.ts); never the raw IP,
-- and never a client-supplied id.
CREATE TABLE public.logo_processing_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_key text NOT NULL,
  fingerprint text,
  outcome text NOT NULL CHECK (outcome IN (
    'validation_rejected', 'rate_limited', 'cache_hit',
    'api_call_succeeded', 'api_call_failed', 'unavailable'
  )),
  was_outbound_call boolean NOT NULL DEFAULT false,
  credits_charged text,
  response_type text,
  response_width text,
  response_height text,
  duration_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_logo_processing_usage_identity_created ON public.logo_processing_usage (identity_key, created_at);
CREATE INDEX idx_logo_processing_usage_outbound_created ON public.logo_processing_usage (created_at) WHERE was_outbound_call;
GRANT ALL ON public.logo_processing_usage TO service_role;
ALTER TABLE public.logo_processing_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to logo processing usage" ON public.logo_processing_usage FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
