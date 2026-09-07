const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

const startStr = 'step?.inputType === "file" ? (';
const endStr = '<form onSubmit={onSubmit}';

const startIdx = text.indexOf(startStr);
// Find the exact index of the ) : ( before <form
const endIdx = text.lastIndexOf(') : (', text.indexOf(endStr));

if (startIdx === -1 || endIdx === -1) {
  console.log("Could not find start or end index", startIdx, endIdx);
  process.exit(1);
}

const newFileUI = `step?.inputType === "file" ? (
              <div className="flex flex-col gap-4 bg-white border border-border/80 p-4 rounded-xl shadow-sm">
                <div className="flex flex-col gap-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="radio" name="branding" value="yes" checked={brandingChoice === "yes"} onChange={() => setBrandingChoice("yes")} className="mt-1" />
                    <span className="text-[14px] font-medium text-foreground">Yes, I need custom branding</span>
                  </label>
                  
                  {brandingChoice === "yes" && (
                    <div className="pl-7 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="relative">
                        <input
                          type="file"
                          multiple
                          id="file-upload"
                          accept=".png, .jpg, .jpeg, .svg, .webp"
                          className="peer sr-only"
                          disabled={typing}
                          onChange={(e) => {
                            if (e.target.files?.length) {
                              handleFileUpload(e.target.files, true);
                            }
                          }}
                        />
                        <label
                          htmlFor="file-upload"
                          className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-[#FAFAF8] px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-secondary peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                        >
                          <div className="rounded-full bg-white p-2 shadow-sm">
                            <Paperclip size={18} className="text-primary" />
                          </div>
                          <div>
                            <p className="text-[14px] font-semibold text-foreground">Click or drag logo to upload</p>
                            <p className="text-[12px] font-medium text-muted-foreground mt-1">
                              Optional: Upload your logo now, or we can collect it via email later.
                            </p>
                            <p className="text-[11px] font-medium text-muted-foreground/80 mt-1">
                              Accepted formats: PNG, JPEG, SVG, WebP
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  <label className="flex items-start gap-3 cursor-pointer mt-1">
                    <input type="radio" name="branding" value="no" checked={brandingChoice === "no"} onChange={() => setBrandingChoice("no")} className="mt-1" />
                    <span className="text-[14px] font-medium text-foreground">No, standard products are fine</span>
                  </label>
                </div>
                
                <button
                  type="button"
                  disabled={typing || !brandingChoice}
                  onClick={() => {
                    if (brandingChoice === "yes") void answer("Yes (Will provide via email later)");
                    else void answer("No");
                  }}
                  className="mt-2 w-full rounded-xl bg-foreground text-background py-2.5 text-[14px] font-semibold transition-colors hover:bg-foreground/90 disabled:opacity-50"
                >
                  {brandingChoice === "yes" ? "Skip Upload & Continue" : "Continue"}
                </button>
              </div>
            `;

text = text.slice(0, startIdx) + newFileUI + text.slice(endIdx);

fs.writeFileSync(path, text);
console.log("Successfully replaced the UI block!");
