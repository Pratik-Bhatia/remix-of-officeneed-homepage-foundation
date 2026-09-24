import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useCustomerContext } from "@/lib/customer-context";
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

function OrdersPage() {
  const { customer } = useCustomerContext();
  const [openId, setOpenId] = useState<string | null>(null);
  const orders = customer?.orders ?? [];

  return (
    <section>
      <h2 className="text-xl font-medium tracking-tight text-foreground">Orders</h2>
      <p className="mt-1 text-sm text-muted-foreground">A record of your recent purchases with Officeneed.</p>

      {orders.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border p-12 text-center">
          <h3 className="text-base font-medium text-foreground">No orders yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Once you place an order it will appear here with its status and details.
          </p>
          <Button asChild className="mt-6 rounded-full px-6">
            <Link to="/">Start shopping</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((order) => {
            const status = statusLabel(order);
            return (
              <article key={order.id} className="rounded-2xl border border-border p-5 sm:p-6">
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
      )}
    </section>
  );
}
