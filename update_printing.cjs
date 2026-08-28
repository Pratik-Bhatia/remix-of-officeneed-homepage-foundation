const fs = require('fs');
const filePath = 'src/components/officeneed/ProductCustomizer.tsx';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add state variable
if (!code.includes('userSelectedPrintingMethod')) {
  code = code.replace(
    'const [isProcessingLaser, setIsProcessingLaser] = useState(false);',
    'const [isProcessingLaser, setIsProcessingLaser] = useState(false);\n  const [userSelectedPrintingMethod, setUserSelectedPrintingMethod] = useState<"Laser Engraving" | "UV Printing">("Laser Engraving");'
  );
}

// 2. Change printingMethod logic
code = code.replace(
  /const quantityNum = parseInt\(formData\.quantity, 10\) \|\| 1;\s*const printingMethod = quantityNum <= 10 \? "Laser Engraving" : "UV Printing";/,
  `const quantityNum = parseInt(formData.quantity, 10) || 1;
  const isUvAvailable = quantityNum >= 25;
  const printingMethod = isUvAvailable ? userSelectedPrintingMethod : "Laser Engraving";`
);

// 3. Replace the UI box
const oldUI = `<div className="mb-6 p-4 rounded-xl border border-primary/10 bg-primary/5 flex flex-col transition-all duration-300">
                    <div className="flex justify-between items-center mb-1">
                      <Label className="text-sm font-semibold">Printing Method</Label>
                      <span className="text-sm font-bold text-primary">{printingMethod}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      *Automatically selected for orders {printingMethod === "Laser Engraving" ? "of 1-10 units" : "above 10 units"}.
                    </p>
                  </div>`;

const newUI = `<div className="mb-6 space-y-3">
                    <Label className="text-sm font-semibold">Printing Method</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setUserSelectedPrintingMethod("Laser Engraving")}
                        className={\`p-3 rounded-lg border flex flex-col items-center justify-center text-sm font-medium transition-all \${
                          printingMethod === "Laser Engraving"
                            ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/20"
                            : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
                        }\`}
                      >
                        Laser Engraving
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserSelectedPrintingMethod("UV Printing")}
                        disabled={!isUvAvailable}
                        className={\`p-3 rounded-lg border flex flex-col items-center justify-center text-sm font-medium transition-all \${
                          !isUvAvailable 
                            ? "opacity-50 cursor-not-allowed bg-muted/50 border-border" 
                            : printingMethod === "UV Printing"
                              ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/20"
                              : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
                        }\`}
                      >
                        <span>UV Printing</span>
                        {!isUvAvailable && <span className="text-[10px] mt-1 font-normal">Min. 25 units</span>}
                      </button>
                    </div>
                  </div>`;

// Use a more flexible regex to replace the UI block in case formatting is slightly different
const regex = /<div className="mb-6 p-4 rounded-xl border border-primary\/10[^>]*>[\s\S]*?<\/div>\s*<\/div>/;
if (regex.test(code)) {
    code = code.replace(regex, newUI);
} else {
    // If exact match fails, let's try a fallback replacement
    // Because sometimes there is a unicode char replacing the hyphen: "of 1?"10 units"
    const fallbackRegex = /<div className="mb-6 p-4 rounded-xl border border-primary\/10[\s\S]*?<\/div>\s*<\/div>/;
    code = code.replace(fallbackRegex, newUI);
}

fs.writeFileSync(filePath, code, 'utf8');
console.log("Printing method logic updated successfully.");
