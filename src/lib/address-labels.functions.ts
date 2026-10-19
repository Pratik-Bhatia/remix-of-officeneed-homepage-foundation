/**
 * Per-address labels ("Office" / "Warehouse" / "Branch Office" / "Other")
 * for a customer's own Shopify Address Book entries -- Shopify's
 * MailingAddressInput has no such field (confirmed live against this
 * store's Storefront API schema), so this is a small Supabase side table,
 * never a second source of truth for the address itself (see the
 * migration's own header comment).
 *
 * TRUST MODEL, same as every other per-customer server function in this
 * app: the browser sends its customerAccessToken plus the Shopify address
 * id it wants labeled. The server re-fetches that SAME token's own
 * `customer.addresses` via fetchCustomer (src/lib/customer.ts) -- the
 * exact mechanism the Address Book itself already relies on -- and only
 * ever writes a label for an address id that's actually in that list. An
 * address id that doesn't belong to this token's customer is silently
 * rejected, never trusted, so a label can never be attached to -- or read
 * back for -- another customer's address.
 */
import { createServerFn } from "@tanstack/react-start";
import { fetchCustomer } from "@/lib/customer";

export const ADDRESS_LABELS = ["Office", "Warehouse", "Branch Office", "Other"] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

export function isAddressLabel(value: unknown): value is AddressLabel {
  return typeof value === "string" && (ADDRESS_LABELS as readonly string[]).includes(value);
}

async function resolveOwnedAddressIds(customerAccessToken: string): Promise<{ customerId: string; addressIds: Set<string> }> {
  const customer = await fetchCustomer(customerAccessToken);
  if (!customer) throw new Error("Could not verify the signed-in customer.");
  const addressIds = new Set(customer.addresses.map((a) => a.id).filter((id): id is string => !!id));
  return { customerId: customer.id, addressIds };
}

export const getAddressLabels = createServerFn({ method: "POST" })
  .inputValidator((input: { customerAccessToken: string }) => {
    if (!input?.customerAccessToken || typeof input.customerAccessToken !== "string") {
      throw new Error("Missing session token.");
    }
    return { customerAccessToken: input.customerAccessToken };
  })
  .handler(async ({ data }): Promise<Record<string, AddressLabel>> => {
    const { customerId } = await resolveOwnedAddressIds(data.customerAccessToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("customer_address_labels")
      .select("shopify_address_id, label")
      .eq("shopify_customer_id", customerId);
    if (error) throw new Error("Could not load address labels.");
    const result: Record<string, AddressLabel> = {};
    for (const row of rows ?? []) {
      if (isAddressLabel(row.label)) result[row.shopify_address_id] = row.label;
    }
    return result;
  });

export const setAddressLabel = createServerFn({ method: "POST" })
  .inputValidator((input: { customerAccessToken: string; addressId: string; label: string }) => {
    if (!input?.customerAccessToken || typeof input.customerAccessToken !== "string") {
      throw new Error("Missing session token.");
    }
    if (!input.addressId || typeof input.addressId !== "string") {
      throw new Error("Missing address id.");
    }
    if (!isAddressLabel(input.label)) {
      throw new Error("Invalid address label.");
    }
    return { customerAccessToken: input.customerAccessToken, addressId: input.addressId, label: input.label };
  })
  .handler(async ({ data }): Promise<void> => {
    const { customerId, addressIds } = await resolveOwnedAddressIds(data.customerAccessToken);
    if (!addressIds.has(data.addressId)) {
      throw new Error("This address does not belong to the signed-in customer.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("customer_address_labels")
      .upsert(
        { shopify_customer_id: customerId, shopify_address_id: data.addressId, label: data.label },
        { onConflict: "shopify_customer_id,shopify_address_id" },
      );
    if (error) throw new Error("Could not save the address label.");
  });

export const deleteAddressLabel = createServerFn({ method: "POST" })
  .inputValidator((input: { customerAccessToken: string; addressId: string }) => {
    if (!input?.customerAccessToken || typeof input.customerAccessToken !== "string") {
      throw new Error("Missing session token.");
    }
    if (!input.addressId || typeof input.addressId !== "string") {
      throw new Error("Missing address id.");
    }
    return { customerAccessToken: input.customerAccessToken, addressId: input.addressId };
  })
  .handler(async ({ data }): Promise<void> => {
    // Best-effort cleanup (called right after a real customerAddressDelete
    // succeeds) -- re-verifying ownership here would require the address to
    // still exist on the customer, but it was JUST deleted from Shopify, so
    // this intentionally skips resolveOwnedAddressIds and deletes by
    // (customerId, addressId) directly. customerId is still re-derived from
    // the token, never trusted from the client, so this can only ever
    // delete a label row under the caller's own customer id.
    const customer = await fetchCustomer(data.customerAccessToken);
    if (!customer) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("customer_address_labels")
      .delete()
      .eq("shopify_customer_id", customer.id)
      .eq("shopify_address_id", data.addressId);
  });
