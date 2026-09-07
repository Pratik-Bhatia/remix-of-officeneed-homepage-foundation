import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/account/orders")({
  component: OrdersPage,
});

type Order = {
  id: string;
  date: string;
  status: "Delivered" | "In Transit" | "Processing";
  total: string;
  items: Array<{ name: string; qty: number }>;
};

const orders: Order[] = [
  {
    id: "ON-2026-1042",
    date: "12 August 2026",
    status: "Delivered",
    total: "₹18,450",
    items: [
      { name: "5 in 1 Premium Gift Set", qty: 10 },
      { name: "Officeneed Diary 1098", qty: 25 },
    ],
  },
  {
    id: "ON-2026-0987",
    date: "28 July 2026",
    status: "In Transit",
    total: "₹7,200",
    items: [{ name: "H983 Premium A5 Notebook Diary & Metal Pen Gift Set", qty: 12 }],
  },
  {
    id: "ON-2026-0913",
    date: "03 July 2026",
    status: "Processing",
    total: "₹3,960",
    items: [
      { name: "Officeneed Steel Bottle 750ml", qty: 6 },
      { name: "Parker Beta Ball Pen", qty: 20 },
    ],
  },
];

const statusStyles: Record<Order["status"], string> = {
  Delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "In Transit": "border-amber-200 bg-amber-50 text-amber-700",
  Processing: "border-border bg-secondary text-muted-foreground",
};

function OrdersPage() {
  return (
    <section>
      <h2 className="text-xl font-medium tracking-tight text-foreground">Orders</h2>
      <p className="mt-1 text-sm text-muted-foreground">A record of your recent purchases with Officeneed.</p>

      <div className="mt-6 space-y-4">
        {orders.map((order) => (
          <article key={order.id} className="rounded-2xl border border-border p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Order {order.id}</p>
                <p className="mt-1 text-xs text-muted-foreground">Placed on {order.date}</p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-[0.68rem] font-medium tracking-wide ${statusStyles[order.status]}`}
              >
                {order.status}
              </span>
            </div>

            <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
              {order.items.map((item) => (
                <li key={item.name} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-foreground/90">{item.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">×{item.qty}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Order total <span className="ml-1 font-medium tabular-nums text-foreground">{order.total}</span>
              </p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => toast.success(`Invoice for ${order.id} will be emailed to you.`)}
                  className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  Download Invoice
                </button>
                <Button
                  variant="outline"
                  className="rounded-full px-5"
                  onClick={() => toast(`Tracking details for ${order.id} are on the way.`)}
                >
                  Track Order
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
