import { Resend } from "resend";

/** Escape user-supplied values before interpolating them into email HTML. */
function esc(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let resendClient: Resend | null = null;

function getResendClient() {
  if (resendClient) return resendClient;
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return null;
  resendClient = new Resend(apiKey);
  return resendClient;
}

function getEmailFrom() {
  return process.env["EMAIL_FROM"] || "OfficeNeed Assistant <assistant@officeneed.in>";
}

function getInternalEmail() {
  return process.env["OFFICENEED_ENQUIRY_EMAIL"] || "marketing@officeneed.in";
}

export async function sendCustomerConfirmationEmail(params: {
  email: string;
  name: string;
  enquiryId: string;
  purpose?: string;
  quantity?: number;
  timeline?: string;
  pdfBuffer: Buffer;
}): Promise<boolean> {
  const resend = getResendClient();
  if (!resend) {
    console.warn("[EmailService] RESEND_API_KEY is not set. Skipping customer email.");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: params.email,
      subject: `Your OfficeNeed enquiry has been received — #${params.enquiryId}`,
      html: `
        <div style="font-family: sans-serif; max-w-2xl; margin: 0 auto; color: #333;">
          <h2 style="color: #000;">OfficeNeed</h2>
          <p>Hi ${esc(params.name)},</p>
          <p>Thank you for sharing your requirements with OfficeNeed.</p>
          <p>We've received your enquiry and our team will review the products and requirements you've shared.</p>
          <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;" />
          <p><strong>Enquiry ID:</strong> ${esc(params.enquiryId)}</p>
          <p><strong>Requirement:</strong> ${esc(params.purpose)}</p>
          <p><strong>Quantity:</strong> ${esc(params.quantity)}</p>
          <p><strong>Timeline:</strong> ${esc(params.timeline)}</p>
          <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;" />
          <p>We've included your enquiry summary for reference as a PDF attachment.</p>
          <p>Our team will get back to you shortly.</p>
          <p>Regards,<br/>Team OfficeNeed</p>
        </div>
      `,
      attachments: [
        {
          filename: `OfficeNeed-Enquiry-${params.enquiryId}.pdf`,
          content: params.pdfBuffer,
        },
      ],
    });
    if (error) {
      console.error("[EmailService] Customer email error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[EmailService] Customer email exception:", err);
    return false;
  }
}

export async function sendInternalNotificationEmail(params: {
  enquiryId: string;
  customerName: string;
  companyName?: string;
  email: string;
  phone?: string;
  purpose?: string;
  quantity?: number;
  budget?: string;
  timeline?: string;
  notes?: string;
  subtotal: number;
  pdfBuffer: Buffer;
}): Promise<boolean> {
  const resend = getResendClient();
  if (!resend) {
    console.warn("[EmailService] RESEND_API_KEY is not set. Skipping internal email.");
    return false;
  }

  const companyDisplay = params.companyName ? params.companyName : params.customerName;

  try {
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: getInternalEmail(),
      subject: `New AI Enquiry — ${String(companyDisplay).replace(/[\r\n]+/g, " ").slice(0, 120)} — #${params.enquiryId}`,
      html: `
        <div style="font-family: sans-serif; color: #333;">
          <h2>NEW AI SHOPPING ENQUIRY</h2>
          
          <h3>Customer Details</h3>
          <p><strong>Customer:</strong> ${esc(params.customerName)}</p>
          <p><strong>Company:</strong> ${esc(params.companyName)}</p>
          <p><strong>Email:</strong> ${esc(params.email)}</p>
          <p><strong>Phone:</strong> ${esc(params.phone)}</p>
          
          <h3>Requirements</h3>
          <p><strong>Purpose:</strong> ${esc(params.purpose)}</p>
          <p><strong>Quantity:</strong> ${esc(params.quantity)}</p>
          <p><strong>Budget:</strong> ${esc(params.budget)}</p>
          <p><strong>Timeline:</strong> ${esc(params.timeline)}</p>
          
          <h3>Pricing Summary</h3>
          <p><strong>Subtotal:</strong> ₹${params.subtotal.toLocaleString("en-IN")}</p>
          
          <h3>Additional Notes</h3>
          <p>${esc(params.notes)}</p>
          
          <p><em>The complete enquiry PDF (including product breakdown) is attached to this email.</em></p>
        </div>
      `,
      attachments: [
        {
          filename: `OfficeNeed-Enquiry-${params.enquiryId}.pdf`,
          content: params.pdfBuffer,
        },
      ],
    });
    if (error) {
      console.error("[EmailService] Internal email error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[EmailService] Internal email exception:", err);
    return false;
  }
}
