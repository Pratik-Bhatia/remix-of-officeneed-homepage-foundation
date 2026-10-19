import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCustomerContext } from "@/lib/customer-context";
import { useB2BStore } from "@/stores/b2bStore";
import { resolveCustomerOrders } from "@/lib/customer-orders.functions";
import type { CustomerOrder } from "@/lib/customer";

export const Route = createFileRoute("/account/orders")({
  component: OrdersPage,
});

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "long", year: "numeric" }).format(
      new Date(value),
    );
  } catch {
    return value;
  }
}

function statusLabel(order: CustomerOrder) {
  const fulfillment = (order.fulfillmentStatus ?? "").toUpperCase();
  if (fulfillment === "FULFILLED") return { label: "Delivered", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (fulfillment === "PARTIALLY_FULFILLED" || fulfillment === "IN_PROGRESS")
    return { label: "In Transit", className: "border-amber-200 bg-amber-50 text-amber-700" };
  return { label: "Processing", className: "border-border bg-secondary text-muted-foreground" };
}

function pretty(v: string | null) {
  if (!v) return null;
  return v.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-medium text-foreground" : "text-foreground/90"}`}>{value}</dd>
    </div>
  );
}

/**
 * Fetches this signed-in customer's own order history, split into
 * personal vs. business via Shopify's real Order.purchasingEntity field
 * (see src/lib/customer-orders.functions.ts for why this requires the
 * Admin API, and the known read_orders scope limitation). Scoped per
 * customerId, zero cache lifetime -- same buyer-isolation discipline as
 * every other buyer-contextualized query (see shopify-overlay.ts's
 * buyerCacheConfig), so switching to a different signed-in identity can
 * never read back a previous customer's cached order split.
 */
function useCustomerOrdersSplit(token: string | null) {
  const customerId = useB2BStore((s) => s.customerId);
  const { data, isFetched } = useQuery({
    queryKey: ["shopify", "customer-orders", customerId ?? "none"],
    queryFn: async () => {
      if (!token) return { personalOrders: [], businessOrders: [], scopeMissing: false };
      try {
        return await resolveCustomerOrders({ data: { customerAccessToken: token } });
      } catch (error) {
        console.error("[Account orders] fetch failed:", error instanceof Error ? error.message : error);
        return { personalOrders: [], businessOrders: [], scopeMissing: false };
      }
    },
    enabled: !!token,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });
  return {
    personalOrders: data?.personalOrders ?? [],
    businessOrders: data?.businessOrders ?? [],
    scopeMissing: data?.scopeMissing ?? false,
    loading: !!token && !isFetched,
  };
}

function EmptyOrders({ heading, body, showStartShopping }: { heading: string; body: string; showStartShopping?: boolean }) {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-background p-12 text-center">
      <h3 className="text-base font-medium text-foreground">{heading}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
      {showStartShopping ? (
        <Button asChild className="mt-6 rounded-full px-6">
          <Link to="/">Start shopping</Link>
        </Button>
      ) : null}
    </div>
  );
}

function OrderCards({ orders, openId, setOpenId }: { orders: CustomerOrder[]; openId: string | null; setOpenId: (id: string | null) => void }) {
  return (
    <div className="mt-6 space-y-4">
      {orders.map((order) => {
        const status = statusLabel(order);
        return (
          <article key={order.id} className="rounded-2xl border border-border bg-background p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Order {order.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">Placed on {formatDate(order.processedAt)}</p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-[0.68rem] font-medium tracking-wide ${status.className}`}
              >
                {status.label}
              </span>
            </div>

            <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
              {order.lines.map((item, index) => (
                <li key={`${order.id}-${index}`} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-foreground/90">{item.title}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">×{item.quantity}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Order total <span className="ml-1 font-medium tabular-nums text-foreground">{order.total}</span>
              </p>
              <Button
                variant="outline"
                className="rounded-full px-5"
                onClick={() => setOpenId(openId === order.id ? null : order.id)}
                aria-expanded={openId === order.id}
              >
                {openId === order.id ? "Hide details" : "View details"}
              </Button>
            </div>

            {openId === order.id ? (
              <div className="mt-4 grid gap-6 border-t border-border pt-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</p>
                  <dl className="mt-2 space-y-1">
                    {order.subtotal ? <Row label="Subtotal" value={order.subtotal} /> : null}
                    {order.shipping ? <Row label="Shipping" value={order.shipping} /> : null}
                    {order.tax ? <Row label="Tax" value={order.tax} /> : null}
                    <Row label="Total" value={order.total} strong />
                    <Row label="Payment" value={pretty(order.financialStatus) ?? "—"} />
                    <Row label="Fulfilment" value={pretty(order.fulfillmentStatus) ?? "Unfulfilled"} />
                  </dl>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery address</p>
                  {order.shippingAddress.length ? (
                    <address className="mt-2 not-italic leading-6 text-foreground/90">
                      {order.shippingAddress.map((l, i) => <div key={i}>{l}</div>)}
                    </address>
                  ) : (
                    <p className="mt-2 text-muted-foreground">No delivery address on this order.</p>
                  )}
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function OrdersPage() {
  const { customer, token } = useCustomerContext();
  const shoppingMode = useB2BStore((s) => s.shoppingMode);
  const status = useB2BStore((s) => s.status);
  const [openId, setOpenId] = useState<string | null>(null);
  const split = useCustomerOrdersSplit(token);
  const isB2BEligible = status === "b2b" || status === "needs-location";

  if (split.loading) {
    return (
      <section>
        <h2 className="text-xl font-medium tracking-tight text-foreground">Orders</h2>
        <p className="mt-1 text-sm text-muted-foreground">A record of your recent purchases with Officeneed.</p>
        <div className="mt-6 rounded-2xl border border-border bg-background p-12 text-center text-sm text-muted-foreground">
          Loading your orders…
        </div>
      </section>
    );
  }

  // Business Shopping mode -- never falls back to the unfiltered Storefront
  // list here (that would show personal orders in the business view, the
  // exact thing this feature must prevent). Without the read_orders scope,
  // there is genuinely no reliable business-order data to show.
  if (shoppingMode === "b2b") {
    if (split.scopeMissing) {
      return (
        <section>
          <h2 className="text-xl font-medium tracking-tight text-foreground">Orders</h2>
          <p className="mt-1 text-sm text-muted-foreground">A record of your recent purchases with Officeneed.</p>
          <EmptyOrders
            heading="Business order history isn't available yet"
            body="Officeneed is still finishing setup for business order access. Your orders are safe in Shopify -- check back soon."
          />
        </section>
      );
    }
    return (
      <section>
        <h2 className="text-xl font-medium tracking-tight text-foreground">Orders</h2>
        <p className="mt-1 text-sm text-muted-foreground">A record of your business purchases with Officeneed.</p>
        {split.businessOrders.length === 0 ? (
          <EmptyOrders
            heading="No business orders yet"
            body="Once your company places an order it will appear here with its status and details."
            showStartShopping
          />
        ) : (
          <OrderCards orders={split.businessOrders} openId={openId} setOpenId={setOpenId} />
        )}
      </section>
    );
  }

  // Personal Shopping mode -- uses the reliable Admin API split once
  // available; falls back to the existing full Storefront order list only
  // when the split genuinely cannot be computed (scope not yet granted),
  // disclosed rather than silently presented as personal-only.
  const orders = split.scopeMissing ? customer?.orders ?? [] : split.personalOrders;
  const notice = split.scopeMissing && isB2BEligible
    ? "Showing your full order history -- business orders can't be separated out here yet."
    : null;

  return (
    <section>
      <h2 className="text-xl font-medium tracking-tight text-foreground">Orders</h2>
      <p className="mt-1 text-sm text-muted-foreground">A record of your recent purchases with Officeneed.</p>
      {notice ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
          <Building2 className="size-4 shrink-0" />
          {notice}
        </div>
      ) : null}
      {orders.length === 0 ? (
        <EmptyOrders
          heading="No orders yet"
          body="Once you place an order it will appear here with its status and details."
          showStartShopping
        />
      ) : (
        <OrderCards orders={orders} openId={openId} setOpenId={setOpenId} />
      )}
    </section>
  );
}
