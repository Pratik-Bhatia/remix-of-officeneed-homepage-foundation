import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getUploadClient } from "./attachments.server";
import { sendCustomerHtmlEmail, sendInternalHtmlEmail } from "./email-service";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

function base64ToUint8Array(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const submitQuoteSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(120),
  company: z.string().min(1, "Company name is required").max(160),
  email: z.string().email("Invalid email format"),
  phone: z.string().min(1, "Phone number is required"),
  quantity: z.number().int().positive().min(1),
  deliveryDate: z.string().optional(),
  location: z.string().min(1, "Delivery location is required"),
  requirements: z.string().optional(),
  printingMethod: z.string().optional(),
  
  product: z.object({
    id: z.string(),
    name: z.string(),
    variant: z.string().optional()
  }),
  
  logo: z.object({
    name: z.string(),
    mimeType: z.string(),
    content: z.string(), // base64
    scale: z.number().optional(),
    rotation: z.number().optional(),
    flipH: z.boolean().optional(),
    flipV: z.boolean().optional(),
    x: z.number().optional(),
    y: z.number().optional()
  }).optional(),

  previewImage: z.string().optional(), // base64
});

export const submitCorporateQuote = createServerFn({ method: "POST" })
  .validator((data) => submitQuoteSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const client = getUploadClient();
      if (!client) {
        return { ok: false as const, error: "Database/Storage client not configured." };
      }

      let logoPath = null;
      let previewPath = null;
      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 8);
      const safeCompanyName = data.company.replace(/[^a-z0-9]/gi, "_").toLowerCase();

      // 1. Upload Logo if exists
      if (data.logo) {
        const logoBuffer = base64ToUint8Array(data.logo.content);
        if (logoBuffer.length > MAX_BYTES) return { ok: false as const, error: "Logo file is too large (max 10MB)." };
        
        const safeName = data.logo.name.replace(/[^a-z0-9.]/gi, "_");
        const path = `logos/${timestamp}-${random}-${safeName}`;
        
        const { error: uploadError } = await client.storage
          .from("corporate-quote-assets")
          .upload(path, logoBuffer, { contentType: data.logo.mimeType });
          
        if (uploadError) {
          console.error("Logo upload failed:", uploadError);
          return { ok: false as const, error: "Failed to upload logo to Supabase: " + (uploadError.message || JSON.stringify(uploadError)) };
        }
        logoPath = path;
      }

      // 2. Upload Preview Image if exists
      if (data.previewImage) {
        // Strip data:image/png;base64, if present
        const base64Data = data.previewImage.replace(/^data:image\/\w+;base64,/, "");
        const previewBuffer = base64ToUint8Array(base64Data);
        const path = `previews/${timestamp}-${random}-${safeCompanyName}-preview.png`;
        
        const { error: previewError } = await client.storage
          .from("corporate-quote-assets")
          .upload(path, previewBuffer, { contentType: "image/png" });
          
        if (previewError) {
          console.error("Preview upload failed:", previewError);
          return { ok: false as const, error: "Failed to upload preview to Supabase: " + (previewError.message || JSON.stringify(previewError)) };
        }
        previewPath = path;
      }

      // 3. Insert into database
      const { data: dbData, error: dbError } = await client
        .from("corporate_quote_requests")
        .insert({
          customer_name: data.fullName,
          company_name: data.company,
          work_email: data.email,
          phone: data.phone,
          quantity: data.quantity,
          required_delivery_date: data.deliveryDate || null,
          delivery_location: data.location,
          additional_requirements: data.requirements || null,
          printing_method: data.printingMethod || null,
          product_id: data.product.id,
          product_name: data.product.name,
          product_variant: data.product.variant || null,
          logo_storage_path: logoPath,
          logo_filename: data.logo?.name || null,
          logo_position_x: data.logo?.x || null,
          logo_position_y: data.logo?.y || null,
          logo_scale: data.logo?.scale || null,
          logo_rotation: data.logo?.rotation || null,
          logo_flip_horizontal: data.logo?.flipH || false,
          logo_flip_vertical: data.logo?.flipV || false,
          preview_image_path: previewPath,
          status: 'new'
        })
        .select('id')
        .single();

      if (dbError) {
        console.error("Database insert failed:", dbError);
        return { ok: false as const, error: "Failed to save quote request to database." };
      }

      const quoteId = dbData.id;
      const refNumber = `ON-${new Date().getFullYear()}-${quoteId.split('-')[0].toUpperCase()}`;

      // 4. Generate public URLs for emails
      let previewUrl = "";
      if (previewPath) {
        const { data: publicUrlData } = client.storage.from("corporate-quote-assets").getPublicUrl(previewPath);
        previewUrl = publicUrlData.publicUrl;
      }
      
      let logoUrl = "";
      if (logoPath) {
        const { data: publicLogoData } = client.storage.from("corporate-quote-assets").getPublicUrl(logoPath);
        logoUrl = publicLogoData.publicUrl;
      }

      // 5. Send Emails
      try {
        // Internal Notification
        const internalHtml = `
          <h2>New Corporate Quote Request: ${refNumber}</h2>
          <h3>Customer Details</h3>
          <p><strong>Name:</strong> ${data.fullName}</p>
          <p><strong>Company:</strong> ${data.company}</p>
          <p><strong>Email:</strong> ${data.email}</p>
          <p><strong>Phone:</strong> ${data.phone}</p>
          
          <h3>Requirements</h3>
          <p><strong>Product:</strong> ${data.product.name}</p>
          <p><strong>Quantity:</strong> ${data.quantity}</p>
          <p><strong>Printing Method:</strong> ${data.printingMethod || "Standard"}</p>
          <p><strong>Delivery Location:</strong> ${data.location}</p>
          <p><strong>Required By:</strong> ${data.deliveryDate || 'Not specified'}</p>
          <p><strong>Additional Notes:</strong> ${data.requirements || 'None'}</p>
          
          ${logoUrl ? `<h3>Attached Logo</h3><p><img src="${logoUrl}" alt="Logo" style="max-width: 300px; max-height: 300px; border: 1px solid #ccc; background-color: #f9f9f9; padding: 10px;" /></p><p><a href="${logoUrl}" target="_blank">Download Original Logo</a></p>` : '<p>No logo was attached.</p>'}
          
          ${previewUrl ? `<h3>Customization Preview</h3><img src="${previewUrl}" alt="Preview" style="max-width: 600px; width: 100%; border: 1px solid #eee; border-radius: 8px;" />` : '<p>No branding preview available.</p>'}
        `;
        
        await sendInternalHtmlEmail(
          `New Corporate Quote Request - ${data.company} - ${data.product.name}`,
          internalHtml
        );

        // Customer Confirmation
        const customerHtml = `
          <h2>We've received your corporate quote request.</h2>
          <p>Hi ${data.fullName},</p>
          <p>Thank you for submitting your corporate gifting requirements.</p>
          <p>Our team will review your product, quantity, and customization requirements and contact you shortly with pricing and availability.</p>
          <hr />
          <h3>Request Details</h3>
          <p><strong>Reference Number:</strong> ${refNumber}</p>
          <p><strong>Company:</strong> ${data.company}</p>
          <p><strong>Product:</strong> ${data.product.name}</p>
          <p><strong>Quantity:</strong> ${data.quantity}</p>
          <p><strong>Printing Method:</strong> ${data.printingMethod || "Standard"}</p>
          ${previewUrl ? `<img src="${previewUrl}" alt="Preview" style="max-width: 400px; width: 100%; border: 1px solid #eee; border-radius: 8px; margin-top: 20px;" />` : ''}
        `;

        await sendCustomerHtmlEmail(
          data.email,
          `Quote Request Received: ${data.product.name}`,
          customerHtml
        );
      } catch (emailError) {
        console.error("Failed to send emails:", emailError);
        // We still return success since the quote is saved, but we might want to log this.
      }

      return { ok: true as const, refNumber };
    } catch (e: any) {
      console.error("Unhandled error in quote submission:", e);
      return { ok: false as const, error: e.message || "An unexpected error occurred." };
    }
  });
