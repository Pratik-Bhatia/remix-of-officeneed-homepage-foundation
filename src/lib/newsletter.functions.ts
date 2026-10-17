import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

/**
 * Footer newsletter signup -- separate from submitEnquiry (enquiries.functions.ts).
 * That function's zod schema requires productSlug/productName as non-empty
 * strings; the footer form never supplied either, so every newsletter
 * signup was throwing and failing silently before this existed. No PDF, no
 * enquiry-pipeline emails -- this writes one row and nothing else.
 */

/** Same upsert-and-report-duplicates logic the server fn below wraps,
 * factored out so it's testable without a real createServerFn runtime
 * (same "plain injectable function" pattern as saveBusinessRegistrationRecord). */
export async function subscribeEmail(
  rawEmail: string,
  client: { from: (table: string) => any },
): Promise<{ ok: true; alreadySubscribed: boolean } | { ok: false; error: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Invalid email format." };
  }
  const { data, error } = await client
    .from("newsletter_subscribers")
    .upsert({ email, consented_at: new Date().toISOString() }, { onConflict: "email", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[Newsletter] subscribe failed", error);
    return { ok: false, error: "Could not subscribe. Please try again." };
  }
  // ignoreDuplicates: true means a pre-existing email returns no row back
  // (not an error) -- that's "already subscribed", not a failure.
  return { ok: true, alreadySubscribed: !data };
}

export const subscribeToNewsletter = createServerFn({ method: "POST" })
  .validator((input: { email: string }) => {
    if (typeof input?.email !== "string" || !input.email.trim()) {
      throw new Error("Email is required.");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
    const key =
      process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
      process.env["SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["SUPABASE_ANON_KEY"] ??
      process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) {
      return { ok: false as const, error: "Newsletter signup is not configured." };
    }
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          return fetch(input, { ...init, headers });
        },
      },
    });
    return subscribeEmail(data.email, supabase);
  });
