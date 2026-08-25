import { generateEnquiryPDF } from "./src/lib/pdf-generator";
import * as fs from "fs";

async function main() {
  const data = {
    enquiryId: "ON-AI-ABCD123",
    date: "21 August 2026",
    customer: {
      name: "Pratik Bhatia",
      company: "Acme Corp",
      email: "pratik@example.com",
      phone: "1234567890",
    },
    requirements: {
      purpose: "Office Setup",
      quantity: 50,
      budget: "10,00,000",
      timeline: "ASAP",
      notes: "Please deliver on time. This is a very long note to test wrapping in the PDF file.",
    },
    products: [
      {
        name: "Ergonomic Chair with Lumbar Support and Headrest (Black)",
        category: "Chairs & Seating",
        sku: "CHR-001",
        quantity: 12,
        unitPriceStr: "Rs. 14,999",
        unitPrice: 14999,
      },
      {
        name: "Office Desk",
        category: "Tables",
        sku: "DESK-002",
        quantity: 5,
        unitPriceStr: "Rs. 25,000",
        unitPrice: 25000.5,
      },
    ],
  };

  const buffer = await generateEnquiryPDF(data);
  fs.writeFileSync("test-out.pdf", buffer);
  console.log("PDF generated!");
}

main().catch(console.error);
