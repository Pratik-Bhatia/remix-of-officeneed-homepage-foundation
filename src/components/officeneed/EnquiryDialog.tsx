import { useState, type FormEvent, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/products";

export type EnquiryPayload = {
  productSlug: string;
  productName: string;
  category: string;
  quantity?: number | undefined;
  name: string;
  company: string;
  email: string;
  message: string;
};

/**
 * INTEGRATION POINT — replace this with a real submission (server function,
 * CRM webhook or email service) when a backend is available. The payload
 * already carries the full product context.
 */
async function submitEnquiry(payload: EnquiryPayload) {
  console.info("[OfficeNeed] Product enquiry", payload);
}

export function EnquiryDialog({
  product,
  quantity,
  trigger,
}: {
  product: Product;
  quantity?: number;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await submitEnquiry({
      productSlug: product.slug,
      productName: product.name,
      category: product.category,
      quantity,
      name: String(data.get("name") ?? ""),
      company: String(data.get("company") ?? ""),
      email: String(data.get("email") ?? ""),
      message: String(data.get("message") ?? ""),
    });
    setSent(true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSent(false);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-left">Enquire about {product.name}</DialogTitle>
          <DialogDescription className="text-left">
            Share your requirement and our team will respond with pricing, quantities,
            customization and delivery timelines.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="py-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Enquiry noted.</p>
            <p className="mt-2">
              Your requirement for {product.name}
              {quantity ? ` (qty ${quantity})` : ""} has been captured. Our team will be in
              touch shortly.
            </p>
            <Button className="mt-6" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="enq-name">Name</Label>
                <Input id="enq-name" name="name" required autoComplete="name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enq-company">Company</Label>
                <Input id="enq-company" name="company" autoComplete="organization" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enq-email">Work email</Label>
              <Input id="enq-email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enq-message">Requirement</Label>
              <Textarea
                id="enq-message"
                name="message"
                rows={4}
                placeholder={`Quantities, customization and delivery needs for ${product.name}`}
              />
            </div>
            <Button type="submit" className="w-full sm:w-auto">
              Send Enquiry
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
