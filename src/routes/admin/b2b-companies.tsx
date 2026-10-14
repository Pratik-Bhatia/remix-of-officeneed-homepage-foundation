import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listB2BApplications,
  checkShopifyApproval,
  rejectB2BApplication,
  listPaymentTermsTemplates,
  syncExistingShopifyCompanies,
  type PaymentTermsTemplateOption,
} from "@/lib/admin-b2b.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/b2b-companies")({
  component: AdminB2BCompaniesPage,
});

function getStatusColor(status: string) {
  switch (status) {
    case "pending": return "secondary";
    case "approved": return "default";
    case "rejected": return "destructive";
    default: return "default";
  }
}

function AdminB2BCompaniesPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "">("pending");
  const [selected, setSelected] = useState<any | null>(null);
  const [templates, setTemplates] = useState<PaymentTermsTemplateOption[]>([]);
  const [paymentChoice, setPaymentChoice] = useState<"pay_now" | "pay_later">("pay_now");
  const [templateId, setTemplateId] = useState<string>("");
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const listFn = useServerFn(listB2BApplications);
  const checkFn = useServerFn(checkShopifyApproval);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const rejectFn = useServerFn(rejectB2BApplication);
  const templatesFn = useServerFn(listPaymentTermsTemplates);
  const syncFn = useServerFn(syncExistingShopifyCompanies);

  const load = async () => {
    try {
      setLoading(true);
      const data = await listFn({ data: statusFilter ? { status: statusFilter } : undefined });
      setApplications(data ?? []);
      setError(null);
    } catch (e: any) {
      setError(
        e?.message?.includes("Forbidden") || e?.message?.includes("Unauthorized")
          ? "You need to be signed in with an admin account to view B2B applications."
          : "Unable to load B2B applications.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    templatesFn({}).then(setTemplates).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = (app: any) => {
    setSelected(app);
    setPaymentChoice("pay_now");
    setTemplateId("");
    setRejectReason("");
  };

  const checkStatus = async () => {
    if (!selected) return;
    setSubmitting(true);
    setCheckResult(null);
    try {
      const r = await checkFn({ data: { requestId: selected.id } });
      setCheckResult(r.linked
        ? `Approved in Shopify: ${r.locations.map((l: any) => l.name).join(", ")}`
        : "Not linked to a company in Shopify yet. This customer still sees normal prices.");
      await load();
    } catch (e: any) {
      setCheckResult(e?.message ?? "Unable to check Shopify.");
    } finally {
      setSubmitting(false);
    }
  };

  const reject = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await rejectFn({ data: { requestId: selected.id, reason: rejectReason } });
      setSelected(null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to reject application.");
    } finally {
      setSubmitting(false);
    }
  };

  const runSync = async () => {
    setSubmitting(true);
    try {
      const result = await syncFn({});
      setSyncResult(`Synced: ${result.created} created, ${result.skipped} already up to date, ${result.companiesFound} total Shopify companies found.`);
      await load();
    } catch (e: any) {
      setSyncResult(`Sync failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <h1 className="text-3xl font-bold">B2B Company Applications</h1>
        <div className="flex items-center gap-3">
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : (v as any))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={runSync} disabled={submitting}>
            Sync existing Shopify companies
          </Button>
        </div>
      </div>

      {syncResult && <p className="mb-4 text-sm text-muted-foreground">{syncResult}</p>}

      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-6 py-4 font-semibold">Company</th>
              <th className="px-6 py-4 font-semibold">GST</th>
              <th className="px-6 py-4 font-semibold">Contact</th>
              <th className="px-6 py-4 font-semibold">Date</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 font-semibold">Linked company</th>
              <th className="px-6 py-4 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : error ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">{error}</td></tr>
            ) : applications.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">No applications found.</td></tr>
            ) : (
              applications.map((app) => (
                <tr key={app.id} className="border-b border-border hover:bg-muted/20">
                  <td className="px-6 py-4 font-medium">{app.company_name}</td>
                  <td className="px-6 py-4">{app.gst_number}</td>
                  <td className="px-6 py-4">{app.contact_name || "—"}{app.phone ? ` · ${app.phone}` : ""}</td>
                  <td className="px-6 py-4 text-muted-foreground">{new Date(app.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <Badge variant={getStatusColor(app.status) as any}>{app.status.toUpperCase()}</Badge>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {app.b2b_companies
                      ? `${app.b2b_companies.payment_terms === "pay_later" ? app.b2b_companies.payment_terms_template_name ?? "Pay Later" : "Pay Now"}`
                      : "New company"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="outline" size="sm" onClick={() => openDetail(app)}>View</Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl">{selected.company_name}</DialogTitle>
            </DialogHeader>

            <div className="space-y-6 mt-2">
              <div>
                <h3 className="font-semibold text-base border-b pb-2 mb-3">Application details</h3>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-muted-foreground">GST Number:</span> <span className="font-medium">{selected.gst_number}</span>
                  <span className="text-muted-foreground">Contact:</span> <span className="font-medium">{selected.contact_name || "—"}</span>
                  <span className="text-muted-foreground">Phone:</span> <span className="font-medium">{selected.phone || "—"}</span>
                  <span className="text-muted-foreground">Submitted:</span> <span className="font-medium">{new Date(selected.created_at).toLocaleString()}</span>
                  {selected.b2b_companies && (
                    <>
                      <span className="text-muted-foreground">Existing company:</span>
                      <span className="font-medium">This GST already has an approved company -- add this customer as another contact in Shopify.</span>
                    </>
                  )}
                  {selected.status === "rejected" && selected.rejection_reason && (
                    <>
                      <span className="text-muted-foreground">Rejection reason:</span> <span className="font-medium">{selected.rejection_reason}</span>
                    </>
                  )}
                </div>
              </div>

              {selected.status === "pending" && (
                <>
                  <div className="space-y-3">
                    <h3 className="font-semibold text-base border-b pb-2 mb-3">Approve in Shopify</h3>
                    <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1">
                      <li>In Shopify Admin, open Customers → Companies and add or open the company (GSTIN {selected.gst_number}).</li>
                      <li>Add this customer as a contact and give them a role at a location.</li>
                      <li>Set the catalog and payment terms on that location.</li>
                      <li>Come back and press Check Shopify status.</li>
                    </ol>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="outline" onClick={() => navigator.clipboard?.writeText(`${selected.company_name}\nGSTIN: ${selected.gst_number}\n${selected.contact_name ?? ""} ${selected.phone ?? ""}\n${[selected.address_line1, selected.address_line2, selected.city, selected.state, selected.pin, selected.country].filter(Boolean).join(", ")}`)}>
                        Copy details
                      </Button>
                      {String(selected.shopify_customer_id ?? "").startsWith("gid://shopify/Customer/") && (
                        <Button variant="outline" asChild>
                          <a href={`https://admin.shopify.com/store/har1k4-di/customers/${String(selected.shopify_customer_id).split("/").pop()}`} target="_blank" rel="noreferrer">Open customer in Shopify</a>
                        </Button>
                      )}
                      <Button onClick={checkStatus} disabled={submitting}>Check Shopify status</Button>
                    </div>
                    {checkResult && <p className="text-sm">{checkResult}</p>}
                  </div>

                  <div>
                    <h3 className="font-semibold text-base border-b pb-2 mb-3">Or reject</h3>
                    <Textarea
                      placeholder="Reason (optional, shown internally only)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <Button variant="destructive" className="mt-3" onClick={reject} disabled={submitting}>
                      Reject
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
