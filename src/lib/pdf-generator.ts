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
  products: Array<{
    name: string;
    category: string;
    sku?: string;
    quantity: number;
    unitPriceStr: string;
    unitPrice: number;
  }>;
}

function sanitizeText(text: string | number | undefined): string {
  if (!text && text !== 0) return "—";
  return String(text)
    .replace(/[\u202F\u00A0]/g, " ")
    .trim();
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

  if (data.requirements.file) {
    currentY += 4;
    doc.setFont("Roboto", "bold");
    doc.text("Reference Files", marginX, currentY);
    currentY += 6;
    doc.setFont("Roboto", "normal");
    const files = data.requirements.file.split(", ");
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

  currentY += 10;

  // Products Table
  doc.setFontSize(14);
  doc.setFont("Roboto", "bold");
  doc.text("Recommended Products", marginX, currentY);
  currentY += 6;

  let subtotal = 0;
  
  const tableData = data.products.map(p => {
    const lineTotal = p.quantity * p.unitPrice;
    subtotal += lineTotal;
    return [
      p.name,
      p.category,
      p.sku || "—",
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
      0: { cellWidth: 'auto' },
      1: { cellWidth: 35 },
      2: { cellWidth: 20 },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 25, halign: 'right' }
    },
    margin: { left: marginX, right: 20 }
  });

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
