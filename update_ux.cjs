const fs = require('fs');
let code = fs.readFileSync('src/components/officeneed/ProductCustomizer.tsx', 'utf8');

// 1. Update DialogContent classes
code = code.replace(
  /className="max-w-6xl p-0 overflow-hidden gap-0 bg-background sm:rounded-2xl shadow-2xl h-\[90vh\] md:h-\[85vh\] max-h-\[900px\] w-\[95vw\] md:w-\[90vw\]"/,
  'className="max-w-6xl p-0 gap-0 bg-background sm:rounded-2xl shadow-2xl h-[100dvh] w-screen max-w-none m-0 border-0 md:h-[85vh] md:max-h-[900px] md:w-[90vw] md:border md:overflow-hidden overflow-y-auto overflow-x-hidden"'
);

// 2. Fix Step 1 (customize) layout
code = code.replace(
  /<div className="w-full md:w-\[60%\] lg:w-\[65%\] h-\[50vh\] md:h-full bg-\[#F9FAFB\] relative flex items-center justify-center p-4 md:p-8 shrink-0">/,
  '<div className="w-full md:w-[60%] lg:w-[65%] min-h-[50vh] md:h-full bg-[#F9FAFB] relative flex items-center justify-center p-4 md:p-8 shrink-0">'
);
code = code.replace(
  /<div className="w-full md:w-\[40%\] lg:w-\[35%\] flex flex-col h-\[50vh\] md:h-full border-t md:border-t-0 md:border-l border-border bg-background">/,
  '<div className="w-full md:w-[40%] lg:w-[35%] flex flex-col min-h-[50vh] md:h-full border-t md:border-t-0 md:border-l border-border bg-background">'
);

// 3. Fix scroll wrappers in Step 1
code = code.replace(
  /<div className="flex-1 overflow-y-auto">/,
  '<div className="flex-1 overflow-y-visible md:overflow-y-auto">'
);

// 4. Update form submission success handling
// Replace setStep("success") with toast.success and onOpenChange(false)
code = code.replace(
  /setRefNumber\(res\.refNumber\);\s*setStep\("success"\);/,
  'toast.success("Quote request submitted successfully! We will contact you shortly.");\n        setTimeout(() => {\n          onOpenChange(false);\n          setTimeout(() => setStep("customize"), 300);\n        }, 500);'
);

// 5. Remove the "success" step entirely to clean up code
code = code.replace(
  /\{step === "success" && \([\s\S]*?<\/div>\s*\)\}/,
  ''
);

fs.writeFileSync('src/components/officeneed/ProductCustomizer.tsx', code, 'utf8');
console.log("Updated ProductCustomizer.tsx");
