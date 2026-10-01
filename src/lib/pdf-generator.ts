import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { officeneedLogoBase64 } from "./pdf-logo";
import { robotoRegularBase64, robotoBoldBase64 } from "./pdf-fonts";

export interface EnquiryPDFData {
  enquiryId: string;
  date: string;
  customer: {
    name: string;
    company?: string;
    email: string;
    phone?: string;
    city?: string;
    industry?: string;
  };
  requirements: {
    purpose?: string;
    quantity?: number;
    budget?: string;
    timeline?: string;
    notes?: string;
    file?: string;
    fileLinks?: Array<{ label: string; url: string }>;
  };
  products?: Array<{
    name: string;
    category: string;
    sku?: string;
    quantity: number;
    unitPriceStr: string;
    unitPrice: number;
  }>;
  attachments?: Array<{
    fileName: string;
    mimeType: string;
    fileSize?: number;
    /** Data URL for embeddable images (PNG/JPEG only). */
    dataUrl?: string;
    imageFormat?: "PNG" | "JPEG";
    signedUrl?: string;
    status: "stored" | "failed";
  }>;
}

function sanitizeText(text: string | number | undefined): string {
  if (!text && text !== 0) return "—";
  return String(text)
    .replace(/[\u202F\u00A0]/g, " ")
    .trim();
}

/** One decimal place, trailing ".0" stripped -- e.g. 30 -> "30", 29.84 -> "29.8". Mirrors the exact rounding the customizer's own Logo Size inputs display, so the PDF can never show a different number than what the customer saw. */
function formatMm(mm: number): string {
  return parseFloat(mm.toFixed(1)).toString();
}

function formatCurrency(amount: number) {
  const isInteger = amount % 1 === 0;
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: isInteger ? 0 : 2,
    minimumFractionDigits: isInteger ? 0 : 2,
  }).format(amount);
  
  // Format precisely without breaking general text:
  // 1. Convert any thin spaces to normal spaces
  // 2. Remove all spaces in the entire string to ensure ₹1,38,000 (no spaces anywhere)
  // Since it's just currency, removing all spaces is safe.
  return formatted.replace(/[\u202F\u00A0\s]+/g, "");
}

export interface CorporateQuotePDFData {
  refNumber: string;
  date: string;
  customer: {
    name: string;
    company: string;
    email: string;
    phone: string;
  };
  order: {
    productName: string;
    variant?: string | undefined;
    quantity: number;
    printingMethod?: string | undefined;
    deliveryDate?: string | undefined;
    location: string;
  };
  requirements?: string | undefined;
  logo?: {
    fileName: string;
    positionX?: number | undefined;
    positionY?: number | undefined;
    /** The exact Width/Height (mm) shown in the customizer's Logo Size
     * fields -- NOT the internal logoScale%, and never recalculated from
     * position/pixel data. Absent on an older quote (pre-dating this field)
     * or a non-Corporate-Gifting product; the PDF falls back gracefully. */
    widthMm?: number | undefined;
    heightMm?: number | undefined;
    rotation?: number | undefined;
    flipHorizontal?: boolean | undefined;
    flipVertical?: boolean | undefined;
  } | undefined;
  /** Exact rendered customization snapshot captured client-side (PNG data URL). */
  previewImageDataUrl?: string | undefined;
  /**
   * Multi-component gift sets only (see ProductCustomizer.tsx's
   * isMultiComponentGiftSet). One entry per real Shopify gift-set
   * component, in order. Absent entirely for a single-item product --
   * the existing `logo`/`previewImageDataUrl` fields above are untouched
   * and still fully describe a single-item quote exactly as before.
   */
  giftSetComponents?: Array<{
    name: string;
    customized: boolean;
    /** The Shopify variant selected when this quote was submitted (same
     * value for every component in the set -- one variant is active at a
     * time), shown alongside each component's own line for clarity. */
    variant?: string | undefined;
    logoFileName?: string | undefined;
    widthMm?: number | undefined;
    heightMm?: number | undefined;
    rotation?: number | undefined;
    flip?: string | undefined;
    /** This component's own captured mockup (PNG data URL) -- the exact
     * rendered composition for that item, never redrawn from x/y/scale. */
    previewImageDataUrl?: string | undefined;
  }> | undefined;
}

/**
 * Corporate quote PDF -- reuses the exact same jsPDF/autoTable/font/logo
 * setup as `generateEnquiryPDF` above rather than a second PDF toolchain.
 * The "Customization Preview" section embeds the PNG data URL captured
 * client-side from the customizer's own rendered DOM (see
 * ProductCustomizer.tsx's captureCustomizationSnapshot) -- the exact
 * composition the customer saw, not independently recalculated from the
 * technical logo fields also included below.
 */
export async function generateCorporateQuotePDF(data: CorporateQuotePDFData): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const marginX = 20;
  let currentY = 20;

  doc.addFileToVFS("Roboto-Regular.ttf", robotoRegularBase64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Bold.ttf", robotoBoldBase64);
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");

  // Header: Logo / Branding
  doc.addImage(officeneedLogoBase64, 'PNG', marginX, 12, 48, 10);

  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");
  doc.setTextColor(100, 100, 100);
  currentY = 28;
  doc.text("Corporate Gifting - Quote Request", marginX, currentY);

  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  doc.text(`Reference: ${data.refNumber}`, 190, 16, { align: "right" });
  doc.text(`Date: ${data.date}`, 190, 22, { align: "right" });

  currentY += 15;
  doc.setDrawColor(220, 220, 220);
  doc.line(marginX, currentY, 190, currentY);
  currentY += 10;

  // Customer Details & Order Details (two columns)
  doc.setFontSize(12);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Customer Details", marginX, currentY);
  doc.text("Order Details", 110, currentY);

  currentY += 8;
  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");

  const leftCol = [
    `Name: ${sanitizeText(data.customer.name)}`,
    `Company: ${sanitizeText(data.customer.company)}`,
    `Email: ${sanitizeText(data.customer.email)}`,
    `Phone: ${sanitizeText(data.customer.phone)}`,
  ];

  const rightCol = [
    `Product: ${sanitizeText(data.order.productName)}`,
    `Variant: ${sanitizeText(data.order.variant)}`,
    `Quantity: ${sanitizeText(data.order.quantity)}`,
    `Printing Method: ${sanitizeText(data.order.printingMethod)}`,
    `Delivery Date: ${sanitizeText(data.order.deliveryDate)}`,
    `Delivery Location: ${sanitizeText(data.order.location)}`,
  ];

  for (let i = 0; i < Math.max(leftCol.length, rightCol.length); i++) {
    if (leftCol[i]) doc.text(leftCol[i]!, marginX, currentY);
    if (rightCol[i]) doc.text(rightCol[i]!, 110, currentY);
    currentY += 6;
  }

  if (data.requirements) {
    currentY += 4;
    doc.setFont("Roboto", "bold");
    doc.text("Additional Requirements:", marginX, currentY);
    currentY += 6;
    doc.setFont("Roboto", "normal");
    const splitNotes = doc.splitTextToSize(data.requirements, 170);
    doc.text(splitNotes, marginX, currentY);
    currentY += splitNotes.length * 6;
  }

  // Logo & Customization Data -- the stable technical fields (kept for
  // internal reference), independent of the visual preview below.
  if (data.logo) {
    currentY += 6;
    doc.setFontSize(12);
    doc.setFont("Roboto", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Logo & Customization Data", marginX, currentY);
    currentY += 8;
    doc.setFontSize(10);
    doc.setFont("Roboto", "normal");

    const hasSize = typeof data.logo.widthMm === "number" && isFinite(data.logo.widthMm)
      && typeof data.logo.heightMm === "number" && isFinite(data.logo.heightMm);
    const logoRows = [
      `Logo File: ${sanitizeText(data.logo.fileName)}`,
      // Backward-safe: an older quote saved before this field existed simply
      // omits the line rather than showing "— mm x — mm" or crashing.
      ...(hasSize ? [`Logo Size: ${formatMm(data.logo.widthMm!)} mm × ${formatMm(data.logo.heightMm!)} mm`] : []),
      `Position (X, Y): ${sanitizeText(data.logo.positionX)}, ${sanitizeText(data.logo.positionY)}`,
      `Rotation: ${sanitizeText(data.logo.rotation)}°`,
      `Flip: ${data.logo.flipHorizontal ? "Horizontal " : ""}${data.logo.flipVertical ? "Vertical" : ""}${!data.logo.flipHorizontal && !data.logo.flipVertical ? "None" : ""}`,
    ];
    for (const row of logoRows) {
      doc.text(row, marginX, currentY);
      currentY += 6;
    }
  }

  // Customization Preview -- the exact rendered composition captured from
  // the customizer, not independently redrawn from the fields above.
  currentY += 6;
  doc.setFontSize(12);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Customization Preview", marginX, currentY);
  currentY += 8;

  if (data.previewImageDataUrl) {
    try {
      const props = doc.getImageProperties(data.previewImageDataUrl);
      const maxWidth = 170;
      const maxHeight = 100;
      const ratio = Math.min(maxWidth / props.width, maxHeight / props.height, 1);
      const w = props.width * ratio;
      const h = props.height * ratio;
      if (currentY + h > 272) {
        doc.addPage();
        currentY = 20;
      }
      doc.addImage(data.previewImageDataUrl, "PNG", marginX, currentY, w, h);
      currentY += h + 10;
    } catch (err) {
      console.error("[OfficeNeed] failed to embed customization preview", err);
      doc.setFontSize(10);
      doc.setFont("Roboto", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text("Preview image could not be embedded.", marginX, currentY);
      doc.setTextColor(0, 0, 0);
      currentY += 10;
    }
  } else {
    doc.setFontSize(10);
    doc.setFont("Roboto", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text("No customization preview available for this request.", marginX, currentY);
    doc.setTextColor(0, 0, 0);
    currentY += 10;
  }

  // Gift Set Components -- multi-component gift sets only (data.giftSetComponents
  // is undefined for every single-item quote, so this section simply doesn't
  // render then, exactly as before this feature existed). Each customized
  // component's own captured mockup is embedded directly, same pattern as
  // the single Customization Preview above -- this is what makes it visually
  // unambiguous which items actually received the logo, not X/Y/rotation text.
  if (data.giftSetComponents?.length) {
    const contentBottom = 272;
    const ensureSpace = (needed: number) => {
      if (currentY + needed > contentBottom) {
        doc.addPage();
        currentY = 20;
      }
    };

    ensureSpace(20);
    currentY += 6;
    doc.setFontSize(14);
    doc.setFont("Roboto", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Gift Set Components", marginX, currentY);
    currentY += 10;

    for (const comp of data.giftSetComponents) {
      ensureSpace(16);
      doc.setFontSize(11);
      doc.setFont("Roboto", "bold");
      doc.setTextColor(0, 0, 0);
      // "A5 Notebook Diary — Brown" (component + variant), per the user's
      // own requested format.
      doc.text(comp.variant ? `${comp.name} — ${comp.variant}` : comp.name, marginX, currentY);
      currentY += 6;

      if (!comp.customized) {
        doc.setFontSize(9);
        doc.setFont("Roboto", "normal");
        doc.setTextColor(120, 120, 120);
        doc.text("Not customized", marginX, currentY);
        doc.setTextColor(0, 0, 0);
        currentY += 9;
        continue;
      }

      // "30 x 30 mm" on its own line, exactly as requested -- never a percentage.
      if (comp.widthMm && comp.heightMm) {
        doc.setFontSize(10);
        doc.setFont("Roboto", "normal");
        doc.setTextColor(90, 90, 90);
        doc.text(`${comp.widthMm.toFixed(1)} × ${comp.heightMm.toFixed(1)} mm`, marginX, currentY);
        doc.setTextColor(0, 0, 0);
        currentY += 7;
      }

      if (comp.previewImageDataUrl) {
        try {
          const props = doc.getImageProperties(comp.previewImageDataUrl);
          const maxWidth = 150;
          const maxHeight = 90;
          const ratio = Math.min(maxWidth / props.width, maxHeight / props.height, 1);
          const w = props.width * ratio;
          const h = props.height * ratio;
          ensureSpace(h + 10);
          doc.addImage(comp.previewImageDataUrl, "PNG", marginX, currentY, w, h);
          currentY += h + 10;
        } catch (err) {
          console.error(`[OfficeNeed] failed to embed preview for gift-set component "${comp.name}"`, err);
          doc.setFontSize(9);
          doc.setFont("Roboto", "normal");
          doc.setTextColor(120, 120, 120);
          doc.text("Preview image could not be embedded.", marginX, currentY);
          doc.setTextColor(0, 0, 0);
          currentY += 8;
        }
      } else {
        doc.setFontSize(9);
        doc.setFont("Roboto", "normal");
        doc.setTextColor(120, 120, 120);
        doc.text("No captured preview available for this item.", marginX, currentY);
        doc.setTextColor(0, 0, 0);
        currentY += 8;
      }
    }
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("Roboto", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    const footerText = `Thank you for choosing OfficeNeed. This document is a quote request summary, not a final tax invoice. | Page ${i} of ${pageCount}`;
    doc.text(footerText, marginX, 285);
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

export async function generateEnquiryPDF(data: EnquiryPDFData): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Base Settings
  const marginX = 20;
  let currentY = 20;

  // Setup Fonts
  doc.addFileToVFS("Roboto-Regular.ttf", robotoRegularBase64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Bold.ttf", robotoBoldBase64);
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");

  // Header: Logo / Branding
  doc.addImage(officeneedLogoBase64, 'PNG', marginX, 12, 48, 10);
  
  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");
  doc.setTextColor(100, 100, 100);
  currentY = 28;
  doc.text("AI Shopping Recommendation / Enquiry", marginX, currentY);
  
  // Header: Right Side Metadata
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  doc.text(`Enquiry ID: ${data.enquiryId}`, 190, 16, { align: "right" });
  doc.text(`Date: ${data.date}`, 190, 22, { align: "right" });
  
  currentY += 15;
  doc.setDrawColor(220, 220, 220);
  doc.line(marginX, currentY, 190, currentY);
  currentY += 10;

  // Customer Details & Requirements (Two columns)
  doc.setFontSize(12);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Customer Details", marginX, currentY);
  doc.text("Requirement Details", 110, currentY);
  
  currentY += 8;
  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");
  
  const leftCol = [
    `Name: ${data.customer.name}`,
    `Company: ${data.customer.company || "—"}`,
    `Email: ${data.customer.email}`,
    `Phone: ${data.customer.phone || "—"}`,
  ];
  
  const rightCol = [
    `Purpose: ${sanitizeText(data.requirements.purpose)}`,
    `Quantity: ${sanitizeText(data.requirements.quantity)}`,
    `Budget: ${sanitizeText(data.requirements.budget)}`,
    `Timeline: ${sanitizeText(data.requirements.timeline)}`,
  ];

  for (let i = 0; i < Math.max(leftCol.length, rightCol.length); i++) {
    if (leftCol[i]) doc.text(leftCol[i]!, marginX, currentY);
    if (rightCol[i]) doc.text(rightCol[i]!, 110, currentY);
    currentY += 6;
  }
  
  if (data.requirements.notes) {
    currentY += 4;
    doc.setFont("Roboto", "bold");
    doc.text("Additional Notes:", marginX, currentY);
    currentY += 6;
    doc.setFont("Roboto", "normal");
    const splitNotes = doc.splitTextToSize(data.requirements.notes, 170);
    doc.text(splitNotes, marginX, currentY);
    currentY += (splitNotes.length * 6);
  }

  const fileLinks = data.requirements.fileLinks;
  if (!data.attachments?.length && ((fileLinks && fileLinks.length) || data.requirements.file)) {
    currentY += 4;
    doc.setFont("Roboto", "bold");
    doc.text("Reference Files", marginX, currentY);
    currentY += 6;
    doc.setFont("Roboto", "normal");

    if (fileLinks && fileLinks.length) {
      doc.text(fileLinks.length === 1 ? "Customer attachment:" : "Customer attachments:", marginX, currentY);
      currentY += 6;
      fileLinks.forEach(({ label, url }) => {
        doc.setTextColor(20, 80, 200);
        doc.textWithLink(label, marginX + 4, currentY, { url });
        const w = doc.getTextWidth(label);
        doc.setDrawColor(20, 80, 200);
        doc.line(marginX + 4, currentY + 1, marginX + 4 + w, currentY + 1);
        doc.setTextColor(0, 0, 0);
        currentY += 6;
      });
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text("Download links are valid for 7 days.", marginX + 4, currentY);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      currentY += 6;
    } else {
      const files = data.requirements.file!.split(", ");
      if (files.length === 1) {
        doc.text(`Customer attachment: ${files[0]}`, marginX, currentY);
        currentY += 6;
      } else {
        doc.text("Customer attachments:", marginX, currentY);
        currentY += 6;
        files.forEach(f => {
          doc.text(f, marginX + 4, currentY);
          currentY += 6;
        });
      }
    }
  }

   currentY += 10;
 
   let subtotal = 0;
 
   if (data.products && data.products.length > 0) {
    // Products Table
    doc.setFontSize(14);
    doc.setFont("Roboto", "bold");
    doc.text("Recommended Products", marginX, currentY);
    currentY += 6;
  
    
    const tableData = data.products.map(p => {
      const lineTotal = p.quantity * p.unitPrice;
      subtotal += lineTotal;
      return [
        p.name,
        p.category,
        p.sku || "N/A",
        p.quantity.toString(),
        formatCurrency(p.unitPrice),
        formatCurrency(lineTotal)
      ];
    });
  
    autoTable(doc, {
      startY: currentY,
      head: [['Product', 'Category', 'SKU', 'Qty', 'Unit Price', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40], textColor: 255, font: "Roboto", fontStyle: "bold" },
      styles: { font: "Roboto", fontSize: 9, cellPadding: 4, valign: 'middle' },
      columnStyles: {
        3: { halign: 'center' },
        4: { halign: 'right' },
        5: { halign: 'right' }
      },
      margin: { left: marginX, right: marginX },
      didDrawPage: (data) => {
        currentY = data.cursor ? data.cursor.y : currentY;
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(14);
    doc.setFont("Roboto", "bold");
    doc.text("General Requirement Summary", marginX, currentY);
    currentY += 8;
    doc.setFontSize(11);
    doc.setFont("Roboto", "normal");
    doc.text("This enquiry does not have specific products attached. Please refer to the requirement details above to prepare a custom quotation for the customer.", marginX, currentY, { maxWidth: 170 });
    currentY += 15;
  }

  // @ts-expect-error autoTable adds lastAutoTable property
  let finalY = doc.lastAutoTable.finalY + 10;
  
  // Pricing Summary
  if (finalY > 250) {
    doc.addPage();
    finalY = 20;
  }
  
  const summaryXLabel = 155;
  const summaryXValue = 190;

  doc.setFontSize(11);
  doc.setFont("Roboto", "normal");
  doc.text("Subtotal:", summaryXLabel, finalY, { align: "right" });
  doc.text(formatCurrency(subtotal), summaryXValue, finalY, { align: "right" });
  
  finalY += 6;
  doc.text("GST (if applicable):", summaryXLabel, finalY, { align: "right" });
  doc.text("Included", summaryXValue, finalY, { align: "right" });
  
  finalY += 8;
  doc.setFont("Roboto", "bold");
  doc.setFontSize(12);
  doc.text("Grand Total:", summaryXLabel, finalY, { align: "right" });
  doc.text(formatCurrency(subtotal), summaryXValue, finalY, { align: "right" });

  // Customer Reference Files (attachments)
  const attachments = data.attachments ?? [];
  if (attachments.length) {
    const contentBottom = 272; // keep clear of the footer at y=285
    const contentWidth = 170;
    let y = finalY + 14;

    const ensureSpace = (needed: number) => {
      if (y + needed > contentBottom) {
        doc.addPage();
        y = 20;
      }
    };

    ensureSpace(16);
    doc.setFontSize(14);
    doc.setFont("Roboto", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Customer Reference Files", marginX, y);
    y += 8;

    for (const att of attachments) {
      // Measure the image up front so its caption never orphans on a page break.
      let imgDims: { w: number; h: number } | null = null;
      if (att.dataUrl && att.imageFormat) {
        try {
          const props = doc.getImageProperties(att.dataUrl);
          const ratio = Math.min(Math.min(contentWidth, 120) / props.width, 110 / props.height, 1);
          imgDims = { w: props.width * ratio, h: props.height * ratio };
        } catch (err) {
          console.error("[OfficeNeed] failed to read attachment image", att.fileName, err);
        }
      }
      ensureSpace(23 + (imgDims ? imgDims.h + 8 : 0));
      doc.setFontSize(10);
      doc.setFont("Roboto", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(`Attachment: ${att.fileName}`, marginX, y);
      y += 6;

      doc.setFont("Roboto", "normal");
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      const typeLabel = att.mimeType.split("/").pop()?.toUpperCase() ?? "FILE";
      const sizeLabel = att.fileSize ? ` · ${(att.fileSize / 1024).toFixed(0)} KB` : "";
      doc.text(`File type: ${typeLabel}${sizeLabel}`, marginX, y);
      y += 5;
      doc.setTextColor(0, 0, 0);

      if (att.status === "failed") {
        doc.setTextColor(180, 40, 40);
        doc.text("This attachment could not be stored. Please request it from the customer.", marginX, y);
        doc.setTextColor(0, 0, 0);
        y += 8;
        continue;
      }

      if (att.signedUrl) {
        doc.setTextColor(20, 80, 200);
        const linkLabel = "Download original file (link valid for 7 days)";
        doc.textWithLink(linkLabel, marginX, y, { url: att.signedUrl });
        const w = doc.getTextWidth(linkLabel);
        doc.setDrawColor(20, 80, 200);
        doc.line(marginX, y + 1, marginX + w, y + 1);
        doc.setTextColor(0, 0, 0);
        y += 6;
      } else {
        doc.text("Available in the enquiry attachment storage.", marginX, y);
        y += 6;
      }

      if (imgDims && att.dataUrl && att.imageFormat) {
        try {
          doc.addImage(att.dataUrl, att.imageFormat, marginX, y, imgDims.w, imgDims.h);
          y += imgDims.h + 8;
        } catch (err) {
          console.error("[OfficeNeed] failed to embed attachment image", att.fileName, err);
          y += 2;
        }
      } else {
        y += 2;
      }
    }
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("Roboto", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    const footerText = `Thank you for choosing OfficeNeed. This document is an enquiry summary and not a final tax invoice. | Page ${i} of ${pageCount}`;
    doc.text(footerText, marginX, 285);
  }

  // Output as Buffer
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
