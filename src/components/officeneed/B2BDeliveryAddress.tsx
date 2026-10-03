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

function DeliveryAddressDialog({
  open,
  onOpenChange,
  savedAddresses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedAddresses: CustomerAddress[];
}) {
  const setDeliveryAddress = useCartStore((s) => s.setDeliveryAddress);
  const [busy, setBusy] = useState(false);

  const useSavedAddress = async (address: CustomerAddress) => {
    const input: DeliveryAddressInput = {
      firstName: address.firstName?.trim() || "Customer",
      lastName: address.lastName?.trim() || "",
      address1: address.address1?.trim() ?? "",
      ...(address.address2?.trim() ? { address2: address.address2.trim() } : {}),
      city: address.city?.trim() ?? "",
      province: address.province?.trim() ?? "",
      zip: address.zip?.trim() ?? "",
      ...(address.phone?.trim() ? { phone: address.phone.trim() } : {}),
    };
    if (!input.address1 || !input.city || !input.province || !input.zip) {
      toast.error("This saved address is missing details required for delivery.");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delivery address</DialogTitle>
          <DialogDescription>
            Where should this order ship? This is just for this order -- it's independent of your company's
            registered business address.
          </DialogDescription>
        </DialogHeader>

        {savedAddresses.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">Use a saved address</p>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {savedAddresses.map((address, index) => (
                <button
                  key={address.id ?? index}
                  type="button"
                  disabled={busy}
                  onClick={() => useSavedAddress(address)}
                  className="w-full rounded-xl border border-border p-3 text-left text-sm transition-colors hover:border-foreground disabled:opacity-50"
                >
                  {addressLines(address).map((line) => (
                    <p key={line} className="leading-snug text-foreground">
                      {line}
                    </p>
                  ))}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            {savedAddresses.length > 0 ? "Or enter a new delivery address" : "Enter a delivery address"}
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
 * Lets a signed-in B2B buyer set this order's delivery address, independent
 * of their Company Location's registered business address (see
 * cartStore.ts's setDeliveryAddress, which calls cartDeliveryAddressesAdd
 * server-side with oneTimeUse:true). Renders nothing for B2C buyers --
 * their delivery address is still entered on Shopify's own hosted checkout
 * page, exactly as before this feature existed.
 */
export function B2BDeliveryAddress() {
  const status = useB2BStore((s) => s.status);
  const token = useReactiveCustomerToken();
  const deliveryAddress = useCartStore((s) => s.deliveryAddress);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);

  useEffect(() => {
    if (status !== "b2b" || !token) {
      setSavedAddresses([]);
      return;
    }
    let cancelled = false;
    fetchCustomer(token)
      .then((customer) => {
        if (!cancelled) setSavedAddresses(customer?.addresses ?? []);
      })
      .catch(() => {
        if (!cancelled) setSavedAddresses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [status, token]);

  if (status !== "b2b") return null;

  return (
    <div className="rounded-2xl border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-medium text-foreground">Delivery Address</p>
            {deliveryAddress ? (
              <div className="mt-1 text-sm text-muted-foreground">
                {addressLines(deliveryAddress).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Add where this order should ship -- can be different from your business address.
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
      <DeliveryAddressDialog open={dialogOpen} onOpenChange={setDialogOpen} savedAddresses={savedAddresses} />
    </div>
  );
}
