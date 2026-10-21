-- Atomic, cross-instance-safe daily/global usage quota, expiring concurrency
-- leases, and stale in-progress cache recovery for the remove.bg integration
-- (src/lib/logo-processing-safeguards.server.ts).
--
-- 1. Daily Quota:
--    A single `INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit` statement
--    guarantees check-and-increment under the target row's lock as one atomic operation.
--    Compensates global count atomically if per-user cap fails.
--
-- 2. Concurrency Leases:
--    Instead of an in-memory or unbounded integer counter, concurrency slots are
--    stored as expiring leases in logo_processing_concurrency_slots.
--    - Expired slots (older than lease duration) are purged automatically on reservation.
--    - Active slots cannot be prematurely revoked.
--    - If a Worker crashes or terminates before finally runs, the slot naturally
--      expires after lease_seconds without permanently exhausting the user's limit.
--    - Releases are keyed by unique slot_id (atomic and idempotent).
--
-- 3. Stale Cache Recovery:
--    reclaim_stale_logo_processing_cache allows a new Worker to atomically claim
--    a fingerprint left in 'in_progress' ONLY when its lease_expires_at <= now().
--    Active requests (lease_expires_at > now()) are strictly protected from reclamation.

CREATE TABLE public.logo_processing_daily_counters (
  scope text NOT NULL CHECK (scope IN ('user', 'global')),
  scope_key text NOT NULL,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_key, day)
);
GRANT ALL ON public.logo_processing_daily_counters TO service_role;
ALTER TABLE public.logo_processing_daily_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to logo processing daily counters" ON public.logo_processing_daily_counters FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Concurrency leases: each in-flight request holds a single expiring slot row
CREATE TABLE public.logo_processing_concurrency_slots (
  slot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_logo_processing_concurrency_identity_expires ON public.logo_processing_concurrency_slots (identity_key, expires_at);
GRANT ALL ON public.logo_processing_concurrency_slots TO service_role;
ALTER TABLE public.logo_processing_concurrency_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to logo processing concurrency slots" ON public.logo_processing_concurrency_slots FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Reserves one slot against BOTH the global and the per-identity daily
-- cap, atomically and all-or-nothing: if the user-scoped reservation
-- fails after the global one already succeeded, the global increment is
-- compensated (decremented back) before returning.
CREATE OR REPLACE FUNCTION public.reserve_logo_processing_daily_quota(
  p_identity_key text,
  p_user_daily_limit integer,
  p_global_daily_limit integer
) RETURNS TABLE(reserved boolean, rejected_scope text)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_global_count integer;
  v_user_count integer;
BEGIN
  INSERT INTO public.logo_processing_daily_counters (scope, scope_key, day, count, updated_at)
  VALUES ('global', 'global', CURRENT_DATE, 1, now())
  ON CONFLICT (scope, scope_key, day)
  DO UPDATE SET count = public.logo_processing_daily_counters.count + 1, updated_at = now()
  WHERE public.logo_processing_daily_counters.count < p_global_daily_limit
  RETURNING count INTO v_global_count;

  IF v_global_count IS NULL THEN
    RETURN QUERY SELECT false, 'global'::text;
    RETURN;
  END IF;

  INSERT INTO public.logo_processing_daily_counters (scope, scope_key, day, count, updated_at)
  VALUES ('user', p_identity_key, CURRENT_DATE, 1, now())
  ON CONFLICT (scope, scope_key, day)
  DO UPDATE SET count = public.logo_processing_daily_counters.count + 1, updated_at = now()
  WHERE public.logo_processing_daily_counters.count < p_user_daily_limit
  RETURNING count INTO v_user_count;

  IF v_user_count IS NULL THEN
    UPDATE public.logo_processing_daily_counters
    SET count = count - 1, updated_at = now()
    WHERE scope = 'global' AND scope_key = 'global' AND day = CURRENT_DATE;
    RETURN QUERY SELECT false, 'user'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_logo_processing_daily_quota(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_logo_processing_daily_quota(text, integer, integer) TO service_role;

-- Atomically reserves one expiring concurrency lease for this identity.
-- Purges expired leases for this identity first, then checks active_count < p_limit.
-- Returns reserved=true and slot_id uuid if successful; reserved=false and slot_id=null if over limit.
CREATE OR REPLACE FUNCTION public.reserve_logo_processing_concurrency_slot(
  p_identity_key text,
  p_limit integer,
  p_lease_seconds integer DEFAULT 60
) RETURNS TABLE(reserved boolean, slot_id uuid)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_active_count integer;
  v_slot_id uuid;
BEGIN
  -- Serialize reservations for this specific identity to avoid count-check races
  PERFORM pg_advisory_xact_lock(hashtext('logo_concurrency:' || p_identity_key));

  -- Clean up expired slots for this identity
  DELETE FROM public.logo_processing_concurrency_slots
  WHERE identity_key = p_identity_key AND expires_at <= now();

  SELECT count(*) INTO v_active_count
  FROM public.logo_processing_concurrency_slots
  WHERE identity_key = p_identity_key;

  IF v_active_count < p_limit THEN
    v_slot_id := gen_random_uuid();
    INSERT INTO public.logo_processing_concurrency_slots (slot_id, identity_key, expires_at, created_at)
    VALUES (v_slot_id, p_identity_key, now() + (p_lease_seconds || ' seconds')::interval, now());
    RETURN QUERY SELECT true, v_slot_id;
    RETURN;
  ELSE
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_logo_processing_concurrency_slot(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_logo_processing_concurrency_slot(text, integer, integer) TO service_role;

-- Atomically releases a concurrency lease by its unique slot_id.
-- Completely idempotent: deleting an already-released or expired slot succeeds with no error.
CREATE OR REPLACE FUNCTION public.release_logo_processing_concurrency_slot(
  p_slot_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.logo_processing_concurrency_slots
  WHERE slot_id = p_slot_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.release_logo_processing_concurrency_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_logo_processing_concurrency_slot(uuid) TO service_role;

-- Atomically reclaims a stale in-progress cache row whose lease has expired (lease_expires_at <= now()).
-- Sets the new owner_token and fresh lease_expires_at.
-- Returns true if this caller won the reclaim; false if the lease was already reclaimed or is still active.
CREATE OR REPLACE FUNCTION public.reclaim_stale_logo_processing_cache(
  p_fingerprint text,
  p_owner_token text,
  p_lease_seconds integer DEFAULT 60
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.logo_processing_cache
  SET owner_token = p_owner_token,
      lease_expires_at = now() + (p_lease_seconds || ' seconds')::interval,
      updated_at = now()
  WHERE fingerprint = p_fingerprint
    AND status = 'in_progress'
    AND lease_expires_at <= now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.reclaim_stale_logo_processing_cache(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_logo_processing_cache(text, text, integer) TO service_role;

-- Allows the active lease owner to extend their lease (heartbeat) if a request is taking longer.
-- Returns true if the lease was extended; false if the caller is no longer the active owner.
CREATE OR REPLACE FUNCTION public.extend_logo_processing_lease(
  p_fingerprint text,
  p_owner_token text,
  p_extension_seconds integer DEFAULT 60
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.logo_processing_cache
  SET lease_expires_at = now() + (p_extension_seconds || ' seconds')::interval,
      updated_at = now()
  WHERE fingerprint = p_fingerprint
    AND owner_token = p_owner_token
    AND status = 'in_progress';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.extend_logo_processing_lease(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_logo_processing_lease(text, text, integer) TO service_role;
