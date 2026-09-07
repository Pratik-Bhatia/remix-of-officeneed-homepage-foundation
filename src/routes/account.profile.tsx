import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/account/profile")({
  component: ProfilePage,
});

const addresses = [
  {
    kind: "Default shipping address",
    lines: ["Priya Sharma", "Officeneed Pvt Ltd, 4th Floor, Aundh IT Park", "Aundh, Pune, Maharashtra 411007", "+91 98220 11223"],
  },
  {
    kind: "Default billing address",
    lines: ["Officeneed Pvt Ltd", "Survey No. 14, Baner Road", "Baner, Pune, Maharashtra 411045", "GSTIN: 27AABCO1234F1Z5"],
  },
];

function Field({ id, label, defaultValue, type = "text" }: { id: string; label: string; defaultValue?: string; type?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs font-medium tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input id={id} name={id} type={type} defaultValue={defaultValue} className="rounded-xl" />
    </div>
  );
}

function ProfilePage() {
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success("Your account details have been saved.");
    }, 600);
  };

  return (
    <section>
      <h2 className="text-xl font-medium tracking-tight text-foreground">Account Settings</h2>
      <p className="mt-1 text-sm text-muted-foreground">Keep your contact, company and delivery details current.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="rounded-2xl border border-border p-5 sm:p-6">
          <h3 className="text-sm font-medium text-foreground">Personal Information</h3>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field id="firstName" label="First Name" defaultValue="Priya" />
            <Field id="lastName" label="Last Name" defaultValue="Sharma" />
            <Field id="phone" label="Phone" type="tel" defaultValue="+91 98220 11223" />
          </div>
        </div>

        <div className="rounded-2xl border border-border p-5 sm:p-6">
          <h3 className="text-sm font-medium text-foreground">Company Details</h3>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field id="companyName" label="Company Name" defaultValue="Officeneed Pvt Ltd" />
            <Field id="gstNumber" label="GST / Tax Number" defaultValue="27AABCO1234F1Z5" />
          </div>
        </div>

        <div className="rounded-2xl border border-border p-5 sm:p-6">
          <h3 className="text-sm font-medium text-foreground">Address Book</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {addresses.map((address) => (
              <div key={address.kind} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground">{address.kind}</p>
                  <button
                    type="button"
                    onClick={() => toast("Address editing is coming soon.")}
                    className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                  >
                    Edit
                  </button>
                </div>
                <address className="mt-3 space-y-1 text-sm not-italic text-foreground/90">
                  {address.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </address>
              </div>
            ))}
          </div>
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
