-- Adds honest email-delivery visibility to the two enquiry pipelines, and
-- a minimal, separate newsletter_subscribers table.
--
-- Part 1: email_status/email_error on product_enquiries and
-- corporate_quote_requests. Neither submit function previously persisted
-- whether its own confirmation/notification emails actually sent --
-- submitCorporateQuote (src/lib/corporate-quotes.functions.ts) didn't even
-- check the boolean return of sendInternalHtmlEmail/sendCustomerHtmlEmail,
-- so a clean failure (e.g. a missing RESEND_API_KEY) was completely
-- invisible. Both columns are nullable and purely additive -- neither
-- table's existing "status = 'new'" public-insert RLS policy references
-- them, so this cannot affect any existing insert.
--
-- email_status values: 'accepted' | 'partial' | 'provider_error' |
-- 'not_attempted'. Named to avoid overclaiming: "accepted" means Resend's
-- API accepted the send request, NOT that it was confirmed delivered to
-- an inbox -- there is no Resend delivery/bounce webhook in this repo.
--
-- customer_email_sent / internal_email_sent (product_enquiries only) track
-- each email independently, so a retry (src/lib/enquiries.functions.ts)
-- can skip re-sending only the one the provider already accepted, never
-- both just because one of them still needs it.
ALTER TABLE public.product_enquiries
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS customer_email_sent boolean,
  ADD COLUMN IF NOT EXISTS internal_email_sent boolean;

ALTER TABLE public.corporate_quote_requests
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_error text;

-- Part 2: newsletter_subscribers -- separates the footer newsletter signup
-- from the product-enquiry pipeline it was incorrectly piggybacking on
-- (src/components/officeneed/Footer.tsx called submitEnquiry without the
-- productSlug/productName that enquiry's own zod schema requires as
-- non-empty strings, which throws synchronously on every submission --
-- see src/lib/newsletter.functions.ts for the real fix). One row per
-- subscriber; `consented_at` IS the consent record -- only ever written at
-- the moment of this exact, explicit form submission.
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Plain UNIQUE is kept deliberately -- it's the exact conflict target
  -- subscribeEmail()'s upsert (src/lib/newsletter.functions.ts) needs for
  -- "ON CONFLICT (email)" to be valid at all (Postgres requires a real
  -- unique constraint/index on the literal column list named in ON
  -- CONFLICT; a functional index on lower(email) alone would NOT satisfy
  -- that, and PostgREST's onConflict option only accepts plain column
  -- names, not expressions). The functional index below is an ADDITIONAL,
  -- stronger guarantee on top of this one, not a replacement for it.
  email text NOT NULL UNIQUE,
  consented_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Case-insensitive uniqueness at the DB level, independent of application
-- code always normalizing to lowercase first (which it does today, but
-- this is a guarantee that holds even if a future write path forgets to).
-- Brand-new table, never applied to any database yet -- there is no
-- existing data to conflict with, so adding this now is unconditionally
-- safe (no duplicate-cleanup step needed, unlike retrofitting a unique
-- index onto an already-populated table).
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_lower_idx ON public.newsletter_subscribers (lower(email));

GRANT ALL ON public.newsletter_subscribers TO service_role;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
-- Same deny-all-by-default shape already used by b2b_companies/
-- business_account_requests: the only writer is subscribeToNewsletter
-- (src/lib/newsletter.functions.ts), which builds its own Supabase client
-- the same way enquiries.functions.ts does -- using the service-role key
-- when configured, which bypasses RLS at the Postgres role level. This
-- policy is a defense-in-depth backstop, not the primary enforcement.
CREATE POLICY "No direct client access to newsletter subscribers" ON public.newsletter_subscribers FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Rollback (not executed -- documented for reference only):
--   DROP TABLE IF EXISTS public.newsletter_subscribers;
--   ALTER TABLE public.product_enquiries DROP COLUMN IF EXISTS email_status, DROP COLUMN IF EXISTS email_error, DROP COLUMN IF EXISTS customer_email_sent, DROP COLUMN IF EXISTS internal_email_sent;
--   ALTER TABLE public.corporate_quote_requests DROP COLUMN IF EXISTS email_status, DROP COLUMN IF EXISTS email_error;
-- Safe to run in that order: nothing else in this codebase reads any of
-- these columns/table yet, so a rollback here cannot orphan dependent data.
