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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { getAddressLabels, setAddressLabel, deleteAddressLabel, ADDRESS_LABELS, type AddressLabel } from "@/lib/address-labels.functions";
import { normalizeIndianPhone } from "@/lib/contact-phone";
import { toIndiaZoneCode } from "@/lib/india-zones";

const PIN_CODE_PATTERN = /^\d{6}$/;
const DEFAULT_ADDRESS_LABEL: AddressLabel = "Other";

/** Phone is optional on every form on this page -- empty input returns
 * null (unchanged, matches each form's prior "omit if empty" behavior).
 * A non-empty value that doesn't parse as a valid Indian mobile number
 * (normalizeIndianPhone already tolerates ordinary/non-breaking spaces,
 * hyphens, and a redundant +91/91/0 prefix -- see its own doc comment)
 * throws rather than being sent as-is; every call site below is already
 * inside a try/catch that shows error.message via toast, the same
 * convention this file already uses for every other submission failure,
 * so this needs no new error-display plumbing. Shared here rather than
 * reimplemented per form, and reusing the exact same regex/normalization
 * CustomerAuthModal.tsx's registration forms rely on, so a number that
 * passes registration can't later fail here (or vice versa). */
function requirePhoneOrNull(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = normalizeIndianPhone(trimmed);
  if (!normalized) throw new Error("Enter a valid 10-digit Indian mobile number.");
  return `+${normalized}`;
}

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
  initialLabel,
  token,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CustomerAddress | null;
  initialLabel: AddressLabel;
  token: string;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<AddressLabel>(initialLabel);

  useEffect(() => {
    if (open) setLabel(initialLabel);
  }, [open, initialLabel]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // Validated before setBusy/the try block below -- a bad phone number
    // should never flash the saving spinner for a submission that was
    // never going to be sent.
    let phone: string | null;
    try {
      phone = requirePhoneOrNull(String(form.get("phone") ?? ""));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enter a valid phone number.");
      return;
    }
    const firstName = String(form.get("firstName") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    const address1 = String(form.get("address1") ?? "").trim();
    const city = String(form.get("city") ?? "").trim();
    const province = String(form.get("province") ?? "").trim();
    const zip = String(form.get("zip") ?? "").trim();
    const country = String(form.get("country") ?? "").trim();
    if (!firstName) { toast.error("First name is required."); return; }
    if (!lastName) { toast.error("Last name is required."); return; }
    if (!address1) { toast.error("Address is required."); return; }
    if (!city) { toast.error("City is required."); return; }
    if (!country) { toast.error("Country is required."); return; }
    // State/PIN format rules are India-specific (toIndiaZoneCode, 6-digit
    // PIN) -- only enforced when Country is actually India, so a genuinely
    // non-Indian address (should this store ever ship outside India) isn't
    // rejected by rules that were never meant to apply to it. toIndiaZoneCode
    // itself is only ever used to VALIDATE the state name here -- unlike the
    // B2B company-address forms, Shopify's MailingAddressInput.province field
    // (customerAddressCreate/Update) wants the plain state NAME, not the
    // 2-letter zone code those forms send to CompanyAddressInput, so the raw
    // trimmed text is still what gets stored once it's confirmed valid.
    const isIndia = /^(india|in)$/i.test(country);
    if (isIndia) {
      if (!toIndiaZoneCode(province)) {
        toast.error("Please enter a valid Indian state (e.g. Maharashtra).");
        return;
      }
      if (!PIN_CODE_PATTERN.test(zip)) {
        toast.error("Enter a valid 6-digit PIN code.");
        return;
      }
    } else {
      if (!province) { toast.error("State/region is required."); return; }
      if (!zip) { toast.error("Postal code is required."); return; }
    }
    const input: CustomerAddressInput = {
      firstName,
      lastName,
      company: String(form.get("company") ?? "").trim() || null,
      address1,
      address2: String(form.get("address2") ?? "").trim() || null,
      city,
      province,
      zip,
      country,
      phone,
    };
    setBusy(true);
    try {
      const saved = editing?.id
        ? await updateCustomerAddress(token, editing.id, input)
        : await createCustomerAddress(token, input);
      toast.success(editing?.id ? "Address updated." : "Address added.");
      if (saved.id) {
        try {
          await setAddressLabel({ data: { customerAccessToken: token, addressId: saved.id, label } });
        } catch (labelError) {
          console.error("Failed to save address label:", labelError);
          toast.error("Address saved, but the label couldn't be saved.");
        }
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
          <div className="space-y-2">
            <Label className="text-xs font-medium tracking-wide text-muted-foreground">Label</Label>
            <Select value={label} onValueChange={(value) => setLabel(value as AddressLabel)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADDRESS_LABELS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
      const phone = requirePhoneOrNull(String(form.get("phone") ?? ""));
      const address2 = String(form.get("address2") ?? "").trim();
      const updated = await updateB2BLocationDetails({
        data: {
          customerAccessToken: token,
          ...(companyLocationId ? { companyLocationId } : {}),
          companyName: String(form.get("companyName") ?? "").trim(),
          ...(phone ? { phone } : {}),
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
            Update your business information used for corporate orders and pricing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <Field id="companyName" label="Company Name" defaultValue={details.companyName} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="phone" label="Phone" type="tel" defaultValue={details.phone ?? ""} />
            <Field id="gstNumber" label="GST Number" defaultValue={details.gstNumber ?? ""} disabled />
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
    <div className="mt-6 rounded-2xl border border-border bg-background p-5 sm:p-6">
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
            <dt className="text-xs font-medium tracking-wide text-muted-foreground">GST Number</dt>
            <dd className="mt-1 text-foreground/90">{details.gstNumber ?? "—"}</dd>
          </div>
          {details.phone ? (
            <div>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground">Phone</dt>
              <dd className="mt-1 text-foreground/90">{details.phone}</dd>
            </div>
          ) : null}
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
  const [labels, setLabels] = useState<Record<string, AddressLabel>>({});

  const reloadLabels = async (currentToken: string) => {
    try {
      const result = await getAddressLabels({ data: { customerAccessToken: currentToken } });
      setLabels(result);
    } catch (error) {
      console.error("Failed to load address labels:", error);
    }
  };

  useEffect(() => {
    if (!token) {
      setLabels({});
      return;
    }
    reloadLabels(token);
  }, [token]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await updateCustomer(token, {
        firstName: String(form.get("firstName") ?? "").trim(),
        lastName: String(form.get("lastName") ?? "").trim(),
        // "" (not null) to match this field's prior behavior of always
        // sending something, even empty -- requirePhoneOrNull still
        // throws into the catch below for a non-empty, invalid value.
        phone: requirePhoneOrNull(String(form.get("phone") ?? "")) ?? "",
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
      // Best-effort -- the address itself is already gone (the real data);
      // a label row left behind for a deleted address is harmless orphan
      // metadata, never surfaced as an error to the customer.
      deleteAddressLabel({ data: { customerAccessToken: token, addressId } }).catch((error) => {
        console.error("Failed to clean up address label:", error);
      });
      setLabels((prev) => {
        const next = { ...prev };
        delete next[addressId];
        return next;
      });
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
        <div className="rounded-2xl border border-border bg-background p-5 sm:p-6">
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

      <div className="mt-6 rounded-2xl border border-border bg-background p-5 sm:p-6">
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
              const addressLabel = address.id ? labels[address.id] ?? DEFAULT_ADDRESS_LABEL : DEFAULT_ADDRESS_LABEL;
              return (
                <div key={address.id ?? index} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                        {addressLabel}
                      </span>
                      <p className="text-xs font-medium tracking-wide text-muted-foreground">
                        {isDefault ? "Default address" : "Saved address"}
                      </p>
                    </div>
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
          initialLabel={(editingAddress?.id && labels[editingAddress.id]) || DEFAULT_ADDRESS_LABEL}
          token={token}
          onSaved={async () => {
            await reload();
            await reloadLabels(token);
          }}
        />
      ) : null}
    </section>
  );
}
