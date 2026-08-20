import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
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

  // Header: Logo / Branding
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("OFFICENEED", marginX, currentY);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  currentY += 6;
  doc.text("AI Shopping Recommendation / Enquiry", marginX, currentY);
  
  // Header: Right Side Metadata
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  doc.text(`Enquiry ID: ${data.enquiryId}`, 130, 20);
  doc.text(`Date: ${data.date}`, 130, 26);
  
  currentY += 15;
  doc.setDrawColor(220, 220, 220);
  doc.line(marginX, currentY, 190, currentY);
  currentY += 10;

  // Customer Details & Requirements (Two columns)
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Customer Details", marginX, currentY);
  doc.text("Requirement Details", 110, currentY);
  
  currentY += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const leftCol = [
    `Name: ${data.customer.name}`,
    `Company: ${data.customer.company || "—"}`,
    `Email: ${data.customer.email}`,
    `Phone: ${data.customer.phone || "—"}`,
  ];
  
  const rightCol = [
    `Purpose: ${data.requirements.purpose || "—"}`,
    `Quantity: ${data.requirements.quantity || "—"}`,
    `Budget: ${data.requirements.budget || "—"}`,
    `Timeline: ${data.requirements.timeline || "—"}`,
  ];

  for (let i = 0; i < Math.max(leftCol.length, rightCol.length); i++) {
    if (leftCol[i]) doc.text(leftCol[i]!, marginX, currentY);
    if (rightCol[i]) doc.text(rightCol[i]!, 110, currentY);
    currentY += 6;
  }
  
  if (data.requirements.notes) {
    currentY += 4;
    doc.setFont("helvetica", "bold");
    doc.text("Additional Notes:", marginX, currentY);
    currentY += 6;
    doc.setFont("helvetica", "normal");
    const splitNotes = doc.splitTextToSize(data.requirements.notes, 170);
    doc.text(splitNotes, marginX, currentY);
    currentY += (splitNotes.length * 6);
  }

  currentY += 10;

  // Products Table
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
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
      p.unitPriceStr,
      formatCurrency(lineTotal)
    ];
  });

  // @ts-expect-error jsPDF-autotable types
  autoTable(doc, {
    startY: currentY,
    head: [['Product', 'Category', 'SKU', 'Qty', 'Unit Price', 'Total']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [40, 40, 40], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 50 },
      3: { halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'right' }
    }
  });

  // @ts-expect-error autoTable adds lastAutoTable property
  let finalY = doc.lastAutoTable.finalY + 10;
  
  // Pricing Summary
  if (finalY > 250) {
    doc.addPage();
    finalY = 20;
  }
  
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", 140, finalY);
  doc.text(formatCurrency(subtotal), 190, finalY, { align: "right" });
  
  finalY += 6;
  doc.text("GST (if applicable):", 140, finalY);
  doc.text("Included", 190, finalY, { align: "right" }); // Using existing logic, assuming inclusive
  
  finalY += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Grand Total:", 140, finalY);
  doc.text(formatCurrency(subtotal), 190, finalY, { align: "right" });
  
  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    const footerText = `Thank you for choosing OfficeNeed. This document is an enquiry summary and not a final tax invoice. | Page ${i} of ${pageCount}`;
    doc.text(footerText, marginX, 285);
  }

  // Output as Buffer
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
