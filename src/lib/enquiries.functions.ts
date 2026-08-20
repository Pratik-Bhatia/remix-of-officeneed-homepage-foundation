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
  selectedProducts: z.array(productItemSchema).optional(),
  enquiryId: z.string().optional(),
});

/**
 * Public B2B product enquiry submission.
 */
export const submitEnquiry = createServerFn({ method: "POST" })
  .validator((data) => enquirySchema.parse(data))
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
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
    
    if (data.enquiryId) {
      // It's a retry of a partial failure, we skip inserting to avoid duplicates.
      dbEnquiryId = data.enquiryId.replace("ON-AI-", "");
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
      dbEnquiryId = generatedId.split("-")[0]!.toUpperCase(); // e.g. "2D9E0D9F"
    }

    const fullEnquiryId = `ON-AI-${dbEnquiryId}`;

    let pdfBuffer: Buffer | null = null;
    let pdfError = false;

    // 2. Generate PDF
    if (data.selectedProducts && data.selectedProducts.length > 0) {
      try {
        const today = new Date().toLocaleDateString("en-IN", {
          day: "2-digit", month: "long", year: "numeric"
        });

        pdfBuffer = await generateEnquiryPDF({
          enquiryId: fullEnquiryId,
          date: today,
          customer: {
            name: data.name,
            company: data.company,
            email: data.email,
            phone: data.phone,
          },
          requirements: {
            purpose: data.purpose,
            quantity: data.quantity,
            budget: data.budget,
            timeline: data.timeline,
            notes: data.notes,
          },
          products: data.selectedProducts.map(p => ({
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

    // 3 & 4. Send Emails
    let customerEmailSent = false;
    let internalEmailSent = false;

    if (pdfBuffer) {
      customerEmailSent = await sendCustomerConfirmationEmail({
        email: data.email,
        name: data.name,
        enquiryId: fullEnquiryId,
        purpose: data.purpose,
        quantity: data.quantity,
        timeline: data.timeline,
        pdfBuffer,
      });

      const subtotal = data.selectedProducts!.reduce((acc, p) => acc + (p.priceNum * p.quantity), 0);
      
      internalEmailSent = await sendInternalNotificationEmail({
        enquiryId: fullEnquiryId,
        customerName: data.name,
        companyName: data.company,
        email: data.email,
        phone: data.phone,
        purpose: data.purpose,
        quantity: data.quantity,
        budget: data.budget,
        timeline: data.timeline,
        notes: data.notes,
        subtotal,
        pdfBuffer,
      });
    }

    return { 
      ok: true as const,
      enquiryId: fullEnquiryId,
      pdfGenerated: !pdfError && pdfBuffer !== null,
      customerEmailSent,
      internalEmailSent
    };
  });
