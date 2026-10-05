import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2, Plus, Building2 } from "lucide-react";
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
import {
  updateCustomer,
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
  type CustomerAddress,
  type CustomerAddressInput,
} from "@/lib/customer";
import { useCustomerContext } from "@/lib/customer-context";
import { useB2BStore } from "@/stores/b2bStore";
import { getB2BLocationDetails, updateB2BLocationDetails, type B2BLocationDetails } from "@/lib/b2b-location.functions";

export const Route = createFileRoute("/account/profile")({
  component: ProfilePage,
});

function Field({
  id,
  label,
  defaultValue,
  type = "text",
  disabled,
}: {
  id: string;
  label: string;
  defaultValue?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs font-medium tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input id={id} name={id} type={type} defaultValue={defaultValue} disabled={disabled} className="rounded-xl" />
    </div>
  );
}

function addressLines(address: CustomerAddress): string[] {
  return [
    [address.firstName, address.lastName].filter(Boolean).join(" "),
    address.company ?? "",
    address.address1 ?? "",
    address.address2 ?? "",
    [address.city, address.province, address.zip].filter(Boolean).join(", "),
    address.country ?? "",
    address.phone ?? "",
  ].filter((line) => line.trim().length > 0);
}

/** Add/edit dialog -- same MailingAddressInput shape for both; `editing`
 * null means "new address", otherwise it's the address being edited. */
function AddressFormDialog({
  open,
  onOpenChange,
  editing,
  token,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CustomerAddress | null;
  token: string;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: CustomerAddressInput = {
      firstName: String(form.get("firstName") ?? "").trim() || null,
      lastName: String(form.get("lastName") ?? "").trim() || null,
      company: String(form.get("company") ?? "").trim() || null,
      address1: String(form.get("address1") ?? "").trim() || null,
      address2: String(form.get("address2") ?? "").trim() || null,
      city: String(form.get("city") ?? "").trim() || null,
      province: String(form.get("province") ?? "").trim() || null,
      zip: String(form.get("zip") ?? "").trim() || null,
      country: String(form.get("country") ?? "").trim() || null,
      phone: String(form.get("phone") ?? "").trim() || null,
    };
    setBusy(true);
    try {
      if (editing?.id) {
        await updateCustomerAddress(token, editing.id, input);
        toast.success("Address updated.");
      } else {
        await createCustomerAddress(token, input);
        toast.success("Address added.");
      }
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this address.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit address" : "Add a new address"}</DialogTitle>
          <DialogDescription>This is saved to your Officeneed account and available at checkout.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="firstName" label="First Name" defaultValue={editing?.firstName ?? ""} />
            <Field id="lastName" label="Last Name" defaultValue={editing?.lastName ?? ""} />
          </div>
          <Field id="company" label="Company (optional)" defaultValue={editing?.company ?? ""} />
          <Field id="address1" label="Address Line 1" defaultValue={editing?.address1 ?? ""} />
          <Field id="address2" label="Address Line 2 (optional)" defaultValue={editing?.address2 ?? ""} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="city" label="City" defaultValue={editing?.city ?? ""} />
            <Field id="province" label="State" defaultValue={editing?.province ?? ""} />
            <Field id="zip" label="PIN / Postal Code" defaultValue={editing?.zip ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="country" label="Country" defaultValue={editing?.country ?? "India"} />
            <Field id="phone" label="Phone" type="tel" defaultValue={editing?.phone ?? ""} />
          </div>
          <Button type="submit" className="w-full rounded-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {editing ? "Save changes" : "Add address"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Edit Details dialog for the Business Account section -- posts to
 * updateB2BLocationDetails, which re-resolves (and validates) the
 * authenticated customer's companyLocationId server-side; the id sent
 * here is only ever a hint (see b2b-location.functions.ts). */
function BusinessDetailsFormDialog({
  open,
  onOpenChange,
  details,
  token,
  companyLocationId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  details: B2BLocationDetails;
  token: string;
  companyLocationId: string | null;
  onSaved: (details: B2BLocationDetails) => void;
}) {
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const phone = String(form.get("phone") ?? "").trim();
      const gstNumber = String(form.get("gstNumber") ?? "").trim();
      const address2 = String(form.get("address2") ?? "").trim();
      const updated = await updateB2BLocationDetails({
        data: {
          customerAccessToken: token,
          ...(companyLocationId ? { companyLocationId } : {}),
          locationName: String(form.get("locationName") ?? "").trim(),
          contactName: String(form.get("contactName") ?? "").trim(),
          ...(phone ? { phone } : {}),
          ...(gstNumber ? { gstNumber } : {}),
          address1: String(form.get("address1") ?? "").trim(),
          ...(address2 ? { address2 } : {}),
          city: String(form.get("city") ?? "").trim(),
          state: String(form.get("state") ?? "").trim(),
          pin: String(form.get("pin") ?? "").trim(),
        },
      });
      toast.success("Business account details updated.");
      onOpenChange(false);
      onSaved(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your business account details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit business account details</DialogTitle>
          <DialogDescription>
            Updates your company location on Shopify -- used for Corporate Pricing and checkout. Your company's
            registered name can't be changed here; contact OfficeNeed if it needs to be updated.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <Field id="locationName" label="Location Name" defaultValue={details.locationName} />
          <Field id="contactName" label="Contact Person's Name" defaultValue={details.contactName ?? ""} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="phone" label="Phone" type="tel" defaultValue={details.phone ?? ""} />
            <Field id="gstNumber" label="GST Number" defaultValue={details.gstNumber ?? ""} />
          </div>
          <Field id="address1" label="Address Line 1" defaultValue={details.address1 ?? ""} />
          <Field id="address2" label="Address Line 2 (optional)" defaultValue={details.address2 ?? ""} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="city" label="City" defaultValue={details.city ?? ""} />
            <Field id="state" label="State" defaultValue={details.state ?? ""} />
            <Field id="pin" label="PIN / Postal Code" defaultValue={details.pin ?? ""} />
          </div>
          <Button type="submit" className="w-full rounded-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            Save changes
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Business Account section -- only rendered once b2bStore has actually
 * resolved a real companyLocationId for this customer (never shown based
 * on the Company tab selection, GST entry, or anything else client-side;
 * see src/lib/b2b.functions.ts for how that resolution works). */
function BusinessAccountSection() {
  const { token } = useCustomerContext();
  const status = useB2BStore((s) => s.status);
  const companyLocationId = useB2BStore((s) => s.companyLocationId);
  const [details, setDetails] = useState<B2BLocationDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (status !== "b2b" || !token) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getB2BLocationDetails({ data: { customerAccessToken: token, ...(companyLocationId ? { companyLocationId } : {}) } })
      .then((result) => {
        if (!cancelled) setDetails(result);
      })
      .catch((error) => {
        console.error("Failed to load business account details:", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, token, companyLocationId]);

  if (status !== "b2b") return null;

  const addressLine = details
    ? [details.address1, details.address2, [details.city, details.state, details.pin].filter(Boolean).join(", "), details.country]
        .filter((line) => line && line.trim().length > 0)
        .join(", ")
    : "";

  return (
    <div className="mt-6 rounded-2xl border border-border p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Building2 className="size-4 text-muted-foreground" />
          Business Account
        </h3>
        {details ? (
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5 mr-1" />
            Edit Details
          </Button>
        ) : null}
      </div>

      {loading && !details ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading your business account…</p>
      ) : !details ? (
        <p className="mt-4 text-sm text-muted-foreground">Could not load your business account details.</p>
      ) : (
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground">Company Name</dt>
            <dd className="mt-1 text-foreground/90">{details.companyName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground">Location Name</dt>
            <dd className="mt-1 text-foreground/90">{details.locationName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground">GST Number</dt>
            <dd className="mt-1 text-foreground/90">{details.gstNumber ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground">Contact</dt>
            <dd className="mt-1 text-foreground/90">
              {details.contactName ?? "—"}
              {details.phone ? ` · ${details.phone}` : ""}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground">Business Address</dt>
            <dd className="mt-1 text-foreground/90">{addressLine || "—"}</dd>
          </div>
        </dl>
      )}

      {details && token ? (
        <BusinessDetailsFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          details={details}
          token={token}
          companyLocationId={companyLocationId}
          onSaved={setDetails}
        />
      ) : null}
    </div>
  );
}

function ProfilePage() {
  const { customer, token, reload } = useCustomerContext();
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null);
  const [busyAddressId, setBusyAddressId] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await updateCustomer(token, {
        firstName: String(form.get("firstName") ?? "").trim(),
        lastName: String(form.get("lastName") ?? "").trim(),
        phone: String(form.get("phone") ?? "").trim(),
      });
      await reload();
      toast.success("Your account details have been saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your details.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (addressId: string) => {
    if (!token) return;
    setBusyAddressId(addressId);
    try {
      await deleteCustomerAddress(token, addressId);
      await reload();
      toast.success("Address removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove this address.");
    } finally {
      setBusyAddressId(null);
    }
  };

  const handleSetDefault = async (addressId: string) => {
    if (!token) return;
    setBusyAddressId(addressId);
    try {
      await setDefaultCustomerAddress(token, addressId);
      await reload();
      toast.success("Default address updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not set this as your default address.");
    } finally {
      setBusyAddressId(null);
    }
  };

  const addresses = customer?.addresses ?? [];

  return (
    <section>
      <h2 className="text-xl font-medium tracking-tight text-foreground">Account Settings</h2>
      <p className="mt-1 text-sm text-muted-foreground">Keep your contact and delivery details current.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="rounded-2xl border border-border p-5 sm:p-6">
          <h3 className="text-sm font-medium text-foreground">Personal Information</h3>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field id="firstName" label="First Name" defaultValue={customer?.firstName ?? ""} />
            <Field id="lastName" label="Last Name" defaultValue={customer?.lastName ?? ""} />
            <Field id="phone" label="Phone" type="tel" defaultValue={customer?.phone ?? ""} />
            <Field id="email" label="Email" type="email" defaultValue={customer?.email ?? ""} disabled />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="rounded-full px-8">
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>

      <BusinessAccountSection />

      <div className="mt-6 rounded-2xl border border-border p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Address Book</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => {
              setEditingAddress(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4 mr-1" />
            Add address
          </Button>
        </div>
        {addresses.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No addresses saved yet. Add one so it's ready to use at checkout.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {addresses.map((address, index) => {
              const isDefault = !!customer?.defaultAddress?.id && customer.defaultAddress.id === address.id;
              const isBusy = busyAddressId === address.id;
              return (
                <div key={address.id ?? index} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground">
                      {isDefault ? "Default address" : "Saved address"}
                    </p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        aria-label="Edit address"
                        onClick={() => {
                          setEditingAddress(address);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      {address.id ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                          aria-label="Delete address"
                          onClick={() => handleDelete(address.id!)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-foreground/90">
                    {addressLines(address).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  {!isDefault && address.id ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      className="mt-3 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                      onClick={() => handleSetDefault(address.id!)}
                    >
                      Set as default
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {token ? (
        <AddressFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          editing={editingAddress}
          token={token}
          onSaved={reload}
        />
      ) : null}
    </section>
  );
}
