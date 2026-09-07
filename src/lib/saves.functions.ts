import { createServerFn } from "@tanstack/react-start";

type TokenInput = { token: string };
type SaveInput = { token: string; handle: string };

export const listSavedHandles = createServerFn({ method: "POST" })
  .inputValidator((input: TokenInput) => {
    if (!input?.token) throw new Error("Missing session token.");
    return input;
  })
  .handler(async ({ data }): Promise<string[]> => {
    const { resolveCustomerId } = await import("./saves.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const customerId = await resolveCustomerId(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("customer_saves")
      .select("product_handle")
      .eq("shopify_customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => row.product_handle);
  });

export const toggleSavedProduct = createServerFn({ method: "POST" })
  .inputValidator((input: SaveInput) => {
    if (!input?.token) throw new Error("Missing session token.");
    if (!input?.handle) throw new Error("Missing product.");
    return input;
  })
  .handler(async ({ data }): Promise<{ saved: boolean }> => {
    const { resolveCustomerId } = await import("./saves.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const customerId = await resolveCustomerId(data.token);

    const { data: existing, error: readError } = await supabaseAdmin
      .from("customer_saves")
      .select("id")
      .eq("shopify_customer_id", customerId)
      .eq("product_handle", data.handle)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    if (existing) {
      const { error } = await supabaseAdmin.from("customer_saves").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { saved: false };
    }

    const { error } = await supabaseAdmin
      .from("customer_saves")
      .insert({ shopify_customer_id: customerId, product_handle: data.handle });
    if (error) throw new Error(error.message);
    return { saved: true };
  });
