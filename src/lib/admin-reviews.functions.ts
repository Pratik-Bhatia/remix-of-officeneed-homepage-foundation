import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ReviewPhotoClient } from "@/lib/review-photo-schema";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Unable to verify admin access");
  if (!data) throw new Error("Forbidden: admin access required");
}

export const listPendingReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    // Reviewer emails are column-restricted for regular users; admins read
    // them here through the service role after the admin check above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("product_reviews")
      .select("id, product_handle, rating, title, body, author_name, author_email, is_verified_buyer, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const reviews = (data ?? []) as any[];

    // Attach each pending review's photos (short-lived signed URLs) so the
    // moderator sees exactly what approving would publish.
    const ids = reviews.map((r) => r.id);
    if (ids.length) {
      const { data: images } = await (supabaseAdmin as unknown as ReviewPhotoClient)
        .from("product_review_images")
        .select("review_id, position, thumb_path, full_path")
        .in("review_id", ids)
        .order("position", { ascending: true });
      if (images?.length) {
        const { data: signed } = await supabaseAdmin.storage
          .from("review-images")
          .createSignedUrls(images.flatMap((i) => [i.thumb_path, i.full_path]), 60 * 60);
        const url = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
        for (const r of reviews) {
          r.photos = images
            .filter((i) => i.review_id === r.id)
            .map((i) => ({ thumbUrl: url.get(i.thumb_path), fullUrl: url.get(i.full_path) }))
            .filter((p) => p.thumbUrl && p.fullUrl);
        }
      }
    }
    return reviews;
  });

export const approveReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Review id is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { error } = await (context as any).supabase
      .from("product_reviews")
      .update({ status: "approved" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rejectReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Review id is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    // Remove the review's stored photo files first; their rows go with the
    // review (ON DELETE CASCADE). A storage failure never blocks rejection.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: images } = await (supabaseAdmin as unknown as ReviewPhotoClient)
        .from("product_review_images")
        .select("thumb_path, full_path")
        .eq("review_id", data.id);
      const paths = (images ?? []).flatMap((i) => [i.thumb_path, i.full_path]);
      if (paths.length) await supabaseAdmin.storage.from("review-images").remove(paths);
    } catch (err) {
      console.error("[admin-reviews] could not remove review photos", err);
    }
    const { error } = await (context as any).supabase
      .from("product_reviews")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
