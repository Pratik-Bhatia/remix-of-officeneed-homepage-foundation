import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MapPin, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCartStore, type DeliveryAddressInput } from "@/stores/cartStore";
import { useB2BStore } from "@/stores/b2bStore";
import { useReactiveCustomerToken } from "@/hooks/useBuyerContext";
import { fetchCustomer, type CustomerAddress } from "@/lib/customer";

function Field({
  id,
  label,
  defaultValue,
  type = "text",
}: {
  id: string;
  label: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs font-medium tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input id={id} name={id} type={type} defaultValue={defaultValue} className="rounded-xl" />
    </div>
  );
}

function addressLines(address: {
  firstName?: string | null;
  lastName?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  provinceCode?: string | null;
  zip?: string | null;
}): string[] {
  return [
    [address.firstName, address.lastName].filter(Boolean).join(" "),
    address.address1 ?? "",
    address.address2 ?? "",
    [address.city, address.province ?? address.provinceCode, address.zip].filter(Boolean).join(", "),
  ].filter((line) => line.trim().length > 0);
}

/** Same physical address, regardless of which query it came from (a saved
 * CustomerAddress vs. an order's MailingAddress snapshot) -- Shopify gives
 * these no shared id to match on, so this compares the fields a delivery
 * address actually needs. Used only to avoid showing the same address
 * twice (once as "used last time", once again in the saved list). */
function sameAddress(a: CustomerAddress, b: CustomerAddress): boolean {
  return (
    (a.address1 ?? "").trim().toLowerCase() === (b.address1 ?? "").trim().toLowerCase() &&
    (a.zip ?? "").trim() === (b.zip ?? "").trim()
  );
}

function AddressOption({
  address,
  badge,
  busy,
  onSelect,
}: {
  address: CustomerAddress;
  badge: string | undefined;
  busy: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onSelect}
      className="w-full rounded-xl border border-border p-3 text-left text-sm transition-colors hover:border-foreground disabled:opacity-50"
    >
      {badge ? (
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{badge}</p>
      ) : null}
      {addressLines(address).map((line, i) => (
        <p key={i} className="leading-snug text-foreground">
          {line}
        </p>
      ))}
    </button>
  );
}

function DeliveryAddressDialog({
  open,
  onOpenChange,
  savedAddresses,
  mostRecentOrderAddress,
  isB2B,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedAddresses: CustomerAddress[];
  mostRecentOrderAddress: CustomerAddress | null;
  isB2B: boolean;
}) {
  const setDeliveryAddress = useCartStore((s) => s.setDeliveryAddress);
  const setDeliveryAddressFromSaved = useCartStore((s) => s.setDeliveryAddressFromSaved);
  const [busy, setBusy] = useState(false);

  // The most-recently-processed order's shipping address, matched against
  // the saved address book by content (Shopify gives no id linking the
  // two) -- if it matches a saved address, that saved entry is promoted to
  // the top and labeled "Used last time" instead of showing a separate,
  // visually-duplicate entry above the list.
  const recentMatch = mostRecentOrderAddress
    ? savedAddresses.find((a) => sameAddress(a, mostRecentOrderAddress!))
    : undefined;
  const orderedSaved = recentMatch
    ? [recentMatch, ...savedAddresses.filter((a) => a !== recentMatch)]
    : savedAddresses;
  // Only reachable when the last order's address wasn't one of the
  // customer's current saved addresses (e.g. it was entered as a one-time
  // address and never saved) -- still worth offering, just via the same
  // inline "new address" path since there's no customerAddressId for it.
  const unmatchedRecent = mostRecentOrderAddress && !recentMatch ? mostRecentOrderAddress : null;

  const useSavedAddress = async (address: CustomerAddress) => {
    if (!address.id) {
      toast.error("This saved address can't be used right now.");
      return;
    }
    setBusy(true);
    try {
      const ok = await setDeliveryAddressFromSaved(address.id);
      if (ok) {
        toast.success("Delivery address set for this order.");
        onOpenChange(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const useRecentAddress = async (address: CustomerAddress) => {
    const input: DeliveryAddressInput = {
      firstName: address.firstName?.trim() || "Customer",
      lastName: address.lastName?.trim() || "",
      address1: address.address1?.trim() ?? "",
      ...(address.address2?.trim() ? { address2: address.address2.trim() } : {}),
      city: address.city?.trim() ?? "",
      province: (address.provinceCode ?? address.province)?.trim() ?? "",
      zip: address.zip?.trim() ?? "",
      ...(address.phone?.trim() ? { phone: address.phone.trim() } : {}),
    };
    if (!input.address1 || !input.city || !input.province || !input.zip) {
      toast.error("This address is missing details required for delivery.");
      return;
    }
    setBusy(true);
    try {
      const ok = await setDeliveryAddress(input);
      if (ok) {
        toast.success("Delivery address set for this order.");
        onOpenChange(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitNew = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: DeliveryAddressInput = {
      firstName: String(form.get("firstName") ?? "").trim(),
      lastName: String(form.get("lastName") ?? "").trim(),
      address1: String(form.get("address1") ?? "").trim(),
      city: String(form.get("city") ?? "").trim(),
      province: String(form.get("province") ?? "").trim(),
      zip: String(form.get("zip") ?? "").trim(),
    };
    const address2 = String(form.get("address2") ?? "").trim();
    if (address2) input.address2 = address2;
    const phone = String(form.get("phone") ?? "").trim();
    if (phone) input.phone = phone;

    if (!input.firstName || !input.address1 || !input.city || !input.province || !input.zip) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setBusy(true);
    try {
      const ok = await setDeliveryAddress(input);
      if (ok) {
        toast.success("Delivery address set for this order.");
        onOpenChange(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const hasAnySaved = orderedSaved.length > 0 || unmatchedRecent;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delivery address</DialogTitle>
          <DialogDescription>
            {isB2B
              ? "Where should this order ship? This is just for this order -- it's independent of your company's registered business address."
              : "Where should this order ship? You can use a saved address, the address from your last order, or enter a new one."}
          </DialogDescription>
        </DialogHeader>

        {unmatchedRecent ? (
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">Previously used</p>
            <AddressOption address={unmatchedRecent} badge="Used last time" busy={busy} onSelect={() => useRecentAddress(unmatchedRecent)} />
          </div>
        ) : null}

        {orderedSaved.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
              {unmatchedRecent ? "Or choose another saved address" : "Use a saved address"}
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {orderedSaved.map((address, index) => (
                <AddressOption
                  key={address.id ?? index}
                  address={address}
                  badge={address === recentMatch ? "Used last time" : undefined}
                  busy={busy}
                  onSelect={() => useSavedAddress(address)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            {hasAnySaved ? "Or enter a new delivery address" : "Enter a delivery address"}
          </p>
          <form onSubmit={handleSubmitNew} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="firstName" label="First Name" />
              <Field id="lastName" label="Last Name" />
            </div>
            <Field id="address1" label="Address Line 1" />
            <Field id="address2" label="Address Line 2 (optional)" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="city" label="City" />
              <Field id="province" label="State" />
              <Field id="zip" label="PIN / Postal Code" />
            </div>
            <Field id="phone" label="Phone (optional)" type="tel" />
            <Button type="submit" className="w-full rounded-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Use this delivery address
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lets any signed-in buyer -- B2B or B2C -- set this order's delivery
 * address, independent of a B2B buyer's Company Location registered
 * business address (see cartStore.ts's setDeliveryAddress/
 * setDeliveryAddressFromSaved, both calling cartDeliveryAddressesReplace
 * server-side). Offers, in order: the address used on their most recent
 * order (Shopify has no separate "last used" field, so this is derived
 * from order history -- see customer.ts's mostRecentOrderAddress), their
 * own saved addresses (referenced via copyFromCustomerAddressId, not
 * retyped, so Shopify keeps treating them as real saved addresses), and a
 * free-form new one-time address. Renders nothing when signed out --
 * a guest's delivery address is still entered on Shopify's own hosted
 * checkout page, exactly as before this feature existed.
 */
export function DeliveryAddressSelector() {
  const status = useB2BStore((s) => s.status);
  const token = useReactiveCustomerToken();
  const deliveryAddress = useCartStore((s) => s.deliveryAddress);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [mostRecentOrderAddress, setMostRecentOrderAddress] = useState<CustomerAddress | null>(null);

  useEffect(() => {
    if (!token) {
      setSavedAddresses([]);
      setMostRecentOrderAddress(null);
      return;
    }
    let cancelled = false;
    fetchCustomer(token)
      .then((customer) => {
        if (cancelled) return;
        setSavedAddresses(customer?.addresses ?? []);
        setMostRecentOrderAddress(customer?.mostRecentOrderAddress ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setSavedAddresses([]);
          setMostRecentOrderAddress(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) return null;

  const isB2B = status === "b2b";

  return (
    <div className="rounded-2xl border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-medium text-foreground">Delivery Address</p>
            {deliveryAddress ? (
              <div className="mt-1 text-sm text-muted-foreground">
                {addressLines(deliveryAddress).map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                {isB2B
                  ? "Add where this order should ship -- can be different from your business address."
                  : "Add where this order should ship, or choose a saved address."}
              </p>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full"
          onClick={() => setDialogOpen(true)}
        >
          {deliveryAddress ? <Pencil className="size-3.5 mr-1.5" /> : null}
          {deliveryAddress ? "Change" : "Add"}
        </Button>
      </div>
      <DeliveryAddressDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        savedAddresses={savedAddresses}
        mostRecentOrderAddress={mostRecentOrderAddress}
        isB2B={isB2B}
      />
    </div>
  );
}
