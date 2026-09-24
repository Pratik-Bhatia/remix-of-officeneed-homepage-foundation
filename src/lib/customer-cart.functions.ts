import { createServerFn } from "@tanstack/react-start";

type TokenInput = { token: string };
type SaveInput = { token: string; cartId: string };

export const getCustomerCart = createServerFn({ method: "POST" })
  .inputValidator((input: TokenInput) => {
    if (!input?.token || typeof input.token !== "string") throw new Error("Missing session token.");
    return input;
  })
  .handler(async ({ data }): Promise<{ cartId: string | null }> => {
    const { resolveCustomerId } = await import("./saves.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const customerId = await resolveCustomerId(data.token);
    const { data: row, error } = await supabaseAdmin
      .from("customer_carts")
      .select("cart_id")
      .eq("shopify_customer_id", customerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { cartId: row?.cart_id ?? null };
  });

export const saveCustomerCart = createServerFn({ method: "POST" })
  .inputValidator((input: SaveInput) => {
    if (!input?.token || typeof input.token !== "string") throw new Error("Missing session token.");
    if (
      typeof input.cartId !== "string" ||
      !input.cartId.startsWith("gid://shopify/Cart/") ||
      input.cartId.length > 300
    ) {
      throw new Error("Invalid cart.");
    }
    return input;
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { resolveCustomerId } = await import("./saves.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const customerId = await resolveCustomerId(data.token);
    const { error } = await supabaseAdmin
      .from("customer_carts")
      .upsert(
        { shopify_customer_id: customerId, cart_id: data.cartId },
        { onConflict: "shopify_customer_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
