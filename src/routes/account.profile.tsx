import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCustomer, type CustomerAddress } from "@/lib/customer";
import { useCustomerContext } from "@/lib/customer-context";

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

function ProfilePage() {
  const { customer, token, reload } = useCustomerContext();
  const [saving, setSaving] = useState(false);

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

        <div className="rounded-2xl border border-border p-5 sm:p-6">
          <h3 className="text-sm font-medium text-foreground">Address Book</h3>
          {addresses.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No addresses saved yet. Your delivery address is added during checkout.
            </p>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {addresses.map((address, index) => (
                <div key={address.id ?? index} className="rounded-xl border border-border p-4">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground">
                    {customer?.defaultAddress?.id && customer.defaultAddress.id === address.id
                      ? "Default address"
                      : "Saved address"}
                  </p>
                  <div className="mt-3 space-y-1 text-sm text-foreground/90">
                    {addressLines(address).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="rounded-full px-8">
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </section>
  );
}
