import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { generateEnquiryPDF } from "./pdf-generator";
import { sendCustomerConfirmationEmail, sendInternalNotificationEmail } from "./email-service";

const productItemSchema = z.object({
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  quantity: z.number(),
  priceStr: z.string(),
  priceNum: z.number(),
});

const enquirySchema = z.object({
  productSlug: z.string().min(1),
  productName: z.string().min(1),
  category: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  name: z.string().min(1).max(120),
  company: z.string().max(160).optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().min(1).max(4000),
  
  // Extended fields for PDF/Emails
  purpose: z.string().optional(),
  budget: z.string().optional(),
  timeline: z.string().optional(),
  notes: z.string().optional(),
  file: z.string().optional(),
  selectedProducts: z.array(productItemSchema).optional(),
  attachments: z
    .array(
      z.object({
        path: z.string().min(1),
        name: z.string().min(1).max(200),
        mimeType: z.string().max(160).optional(),
        size: z.number().nonnegative().optional(),
      }),
    )
    .max(5)
    .optional(),
  enquiryId: z.string().optional(),
  // Separate from enquiryId (the truncated "ON-AI-XXXXXXXX" display
  // reference, which is NOT a reliable database key -- its first-8-hex-char
  // prefix is only 32 bits of entropy and isn't guaranteed unique at scale).
  // Optional and additive: no existing caller supplies it, so this changes
  // nothing for them. A future retry caller that wants an exact, safe
  // lookup should pass back the enquiryRowId this function now returns on
  // every successful submission (see the return shape below).
  enquiryRowId: z.string().uuid().optional(),
});

/** "accepted" means Resend's API accepted the send request, NOT that it
 * was confirmed delivered to an inbox (this repo has no Resend
 * delivery/bounce webhook) -- never overclaim "sent"/"delivered" here. */
export function computeEnquiryEmailStatus(
  customerEmailSent: boolean,
  internalEmailSent: boolean,
  pdfAttempted: boolean,
): "accepted" | "partial" | "provider_error" | "not_attempted" {
  if (!pdfAttempted) return "not_attempted";
  if (customerEmailSent && internalEmailSent) return "accepted";
  if (customerEmailSent || internalEmailSent) return "partial";
  return "provider_error";
}

/** Decides, per email, whether a retry should skip re-sending because the
 * provider already accepted it on a prior attempt -- never all-or-nothing:
 * a "partial" prior result (one email accepted, the other not) must only
 * resend the one that still needs it. `existing` is whatever the retry
 * lookup found for the row (or null/undefined if no row was found, the
 * lookup failed, or no exact row id was available at all) -- any of those
 * "unknown" cases safely default to "don't skip", i.e. resend, which is
 * exactly today's original (pre-skip-logic) behavior. */
export function resolveEmailResendPlan(
  existing: { customer_email_sent?: boolean | null; internal_email_sent?: boolean | null } | null | undefined,
): { skipCustomerEmail: boolean; skipInternalEmail: boolean } {
  return {
    skipCustomerEmail: existing?.customer_email_sent === true,
    skipInternalEmail: existing?.internal_email_sent === true,
  };
}

/**
 * Public B2B product enquiry submission.
 */
export const submitEnquiry = createServerFn({ method: "POST" })
  .validator((data) => enquirySchema.parse(data))
  .handler(async ({ data }) => {
    // Custom Validation
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
      return { ok: false as const, error: "Invalid email format." };
    }
    if (data.phone) {
      let digits = data.phone.replace(/\D/g, "");
      if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
      if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
        return { ok: false as const, error: "Invalid phone number format." };
      }
    }

    const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
    const key =
      process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
      process.env["SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["SUPABASE_ANON_KEY"] ??
      process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) {
      throw new Error("Enquiry submission is not configured. Connect the backend in Lovable Cloud.");
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) {
            headers.delete('Authorization');
          }
          return fetch(input, { ...init, headers });
        }
      }
    });

    let dbEnquiryId = "";
    let enquiryRowId = "";
    // On a retry, skip re-sending only the specific email(s) the provider
    // already accepted -- per-email, never all-or-nothing, so a prior
    // "partial" result (one sent, one not) only resends the one that
    // still needs it. No current caller actually exercises the retry path
    // yet (confirmed: ChatWidget/EnquiryDialog/Footer never pass enquiryId
    // back in) -- this is forward-looking, not a live behavior change.
    let skipCustomerEmail = false;
    let skipInternalEmail = false;

    if (data.enquiryId) {
      // It's a retry of a partial failure, we skip inserting to avoid duplicates.
      dbEnquiryId = data.enquiryId.replace("ON-AI-", "");
      if (data.enquiryRowId) {
        // Exact lookup by the real row id -- never a prefix/guess. Also
        // lets the status-persisting update below (keyed on enquiryRowId)
        // work correctly on a retry too, not just on a fresh insert.
        enquiryRowId = data.enquiryRowId;
        try {
          const { data: existing } = await supabase
            .from("product_enquiries")
            .select("customer_email_sent, internal_email_sent")
            .eq("id", data.enquiryRowId)
            .maybeSingle();
          ({ skipCustomerEmail, skipInternalEmail } = resolveEmailResendPlan(existing));
        } catch (lookupErr) {
          console.error("[OfficeNeed] retry email-sent lookup failed, proceeding to resend both", lookupErr);
        }
      }
      // If enquiryRowId wasn't supplied (an older/legacy retry call that
      // only has the truncated display id), there is no reliable way to
      // look up the exact row -- both skip flags stay false, i.e. resend
      // both, exactly today's original behavior for that case. Not a
      // regression: this is what every retry did before email-sent
      // tracking existed at all.
    } else {
      // 1. Insert into Supabase
      // Generate ID locally so we don't have to use .select() which fails RLS for anon role
      const generatedId = crypto.randomUUID();
      const { error: dbError } = await supabase.from("product_enquiries").insert({
        id: generatedId,
        product_slug: data.productSlug,
        product_name: data.productName,
        category: data.category,
        quantity: data.quantity ?? null,
        name: data.name,
        company: data.company ?? null,
        email: data.email,
        message: data.message,
        status: "new",
      });

      if (dbError) {
        console.error("[OfficeNeed] enquiry insert failed", dbError);
        return { ok: false as const, error: "Could not submit your enquiry. Please try again." };
      }
      enquiryRowId = generatedId;
      dbEnquiryId = generatedId.split("-")[0]!.toUpperCase(); // e.g. "2D9E0D9F"
    }

    const fullEnquiryId = `ON-AI-${dbEnquiryId}`;

    let pdfBuffer: Buffer | null = null;
    let pdfError = false;

    // Persist customer attachments into enquiry-attachments/{enquiryId}/...
    type StoredAttachment = import("./attachments.server").StoredAttachment;
    let stored: StoredAttachment[] = [];
    if (enquiryRowId && data.attachments?.length) {
      try {
        const { persistEnquiryAttachments } = await import("./attachments.server");
        stored = await persistEnquiryAttachments({
          enquiryRowId,
          enquiryRef: fullEnquiryId,
          inputs: data.attachments,
        });
      } catch (err) {
        console.error("[OfficeNeed] attachment persistence failed", err);
      }
    }

    const pdfAttachments = stored.map((a) => ({
      fileName: a.fileName,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      status: a.status,
      ...(a.signedUrl ? { signedUrl: a.signedUrl } : {}),
      ...(a.bytes && (a.imageFormat === "PNG" || a.imageFormat === "JPEG")
        ? {
            imageFormat: a.imageFormat,
            dataUrl: `data:${a.imageFormat === "PNG" ? "image/png" : "image/jpeg"};base64,${a.bytes.toString("base64")}`,
          }
        : {}),
    }));

    const fileLinks: Array<{ label: string; url: string }> = stored
      .filter((a) => a.signedUrl)
      .map((a) => ({ label: a.fileName, url: a.signedUrl! }));

    // 2. Generate PDF
    if (true) {
      try {
        const today = new Date().toLocaleDateString("en-IN", {
          day: "2-digit", month: "long", year: "numeric"
        });

        pdfBuffer = await generateEnquiryPDF({
          enquiryId: fullEnquiryId,
          date: today,
          customer: {
            name: data.name,
            ...(data.company ? { company: data.company } : {}),
            email: data.email,
            ...(data.phone ? { phone: data.phone } : {}),
          },
          requirements: {
            ...(data.purpose ? { purpose: data.purpose } : {}),
            ...(data.quantity ? { quantity: data.quantity } : {}),
            ...(data.budget ? { budget: data.budget } : {}),
            ...(data.timeline ? { timeline: data.timeline } : {}),
            ...(data.notes ? { notes: data.notes } : {}),
            ...(data.file ? { file: data.file } : {}),
            ...(fileLinks.length ? { fileLinks } : {}),
          },
          ...(pdfAttachments.length ? { attachments: pdfAttachments } : {}),
          products: (data.selectedProducts ?? []).map(p => ({
            name: p.name,
            category: p.category,
            quantity: p.quantity,
            unitPrice: p.priceNum,
            unitPriceStr: p.priceStr,
          })),
        });

      } catch (err) {
        console.error("[OfficeNeed] PDF generation failed", err);
        pdfError = true;
      }
    }

    // 3 & 4. Send Emails -- each one independently: a retry must only
    // resend the specific email that wasn't already accepted, never both
    // just because one of them still needs it.
    let customerEmailSent = skipCustomerEmail;
    let internalEmailSent = skipInternalEmail;

    if (pdfBuffer && !skipCustomerEmail) {
      customerEmailSent = await sendCustomerConfirmationEmail({
        email: data.email,
        name: data.name,
        enquiryId: fullEnquiryId,
        ...(data.purpose ? { purpose: data.purpose } : {}),
        ...(data.quantity ? { quantity: data.quantity } : {}),
        ...(data.timeline ? { timeline: data.timeline } : {}),
        pdfBuffer,
      });
    }

    if (pdfBuffer && !skipInternalEmail) {
      const subtotal = (data.selectedProducts || []).reduce((acc, p) => acc + (p.priceNum * p.quantity), 0);

      internalEmailSent = await sendInternalNotificationEmail({
        enquiryId: fullEnquiryId,
        customerName: data.name,
        ...(data.company ? { companyName: data.company } : {}),
        email: data.email,
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.purpose ? { purpose: data.purpose } : {}),
        ...(data.quantity ? { quantity: data.quantity } : {}),
        ...(data.budget ? { budget: data.budget } : {}),
        ...(data.timeline ? { timeline: data.timeline } : {}),
        ...(data.notes ? { notes: data.notes } : {}),
        subtotal,
        pdfBuffer,
        attachments: stored
          .filter((a) => a.status === "stored" && a.bytes)
          .map((a) => ({ filename: a.fileName, content: a.bytes! })),
      });
    }

    // Record what actually happened with email delivery -- "accepted" means
    // Resend's API accepted the send request, NOT that it was confirmed
    // delivered to an inbox (this repo has no Resend delivery/bounce
    // webhook). Never blocks the response already decided above: any
    // failure here is logged only. "Attempted" counts a prior accepted
    // send (via skip) as having been attempted too, so a retry whose PDF
    // generation fails this time doesn't wrongly report "not_attempted"
    // when one of the two emails was already genuinely sent earlier.
    const pdfAttempted = pdfBuffer !== null || skipCustomerEmail || skipInternalEmail;
    const emailStatus = computeEnquiryEmailStatus(customerEmailSent, internalEmailSent, pdfAttempted);
    if (enquiryRowId) {
      try {
        await supabase
          .from("product_enquiries")
          .update({
            email_status: emailStatus,
            customer_email_sent: customerEmailSent,
            internal_email_sent: internalEmailSent,
          })
          .eq("id", enquiryRowId);
      } catch (statusErr) {
        console.error("[OfficeNeed] failed to record email_status (non-fatal)", statusErr);
      }
    }

    return {
      ok: true as const,
      enquiryId: fullEnquiryId,
      // Additive: lets a future retry caller pass this back for an exact,
      // safe lookup instead of the truncated enquiryId above. Empty string
      // on a retry that itself didn't supply enquiryRowId (nothing exact
      // to report back in that case).
      enquiryRowId,
      pdfGenerated: !pdfError && pdfBuffer !== null,
      customerEmailSent,
      internalEmailSent,
      emailStatus,
      attachmentsStored: stored.filter((a) => a.status === "stored").length,
      attachmentsFailed: stored.filter((a) => a.status === "failed").length
    };
  });
