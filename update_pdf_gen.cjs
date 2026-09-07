const fs = require("fs");
const path = "src/lib/pdf-generator.ts";
let text = fs.readFileSync(path, "utf8");

const startProductsBlock = text.indexOf('// Products Table');
const autoTableCall = text.indexOf('autoTable(doc, {', startProductsBlock);
const endAutoTable = text.indexOf('});', autoTableCall) + 3;

const replaceWith = `if (data.products && data.products.length > 0) {
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
  }`;

text = text.slice(0, startProductsBlock) + replaceWith + text.slice(endAutoTable);

text = text.replace(
  'products: Array<{',
  'products?: Array<{'
);

fs.writeFileSync(path, text);
console.log("Updated pdf-generator.ts");
