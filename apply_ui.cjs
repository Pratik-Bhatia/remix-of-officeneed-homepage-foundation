const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

// 1. ArrowRight Import
text = text.replace(
  '} from "lucide-react";',
  ', ArrowRight } from "lucide-react";'
);

// 2. Remove ChevronRight default
text = text.replace(
  'const Icon = iconMap[opt] || ChevronRight;',
  'const Icon = iconMap[opt];'
);
text = text.replace(
  '<Icon className="size-4 opacity-50 group-hover:opacity-80 group-active:opacity-100 transition-opacity" strokeWidth={1.5} />',
  '{Icon && <Icon className="size-4 opacity-50 group-hover:opacity-80 group-active:opacity-100 transition-opacity" strokeWidth={1.5} />}'
);

// 3. Custom UI for refine
const findStr = ') : step?.options && step.id !== "quantity" ? (';
const customRefineUI = `) : step?.id === "refine" && step.options ? (
              <div className="flex flex-col gap-3 px-2 pb-2 pt-2">
                <button
                  type="button"
                  disabled={typing}
                  onClick={() => void answer("Prepare Enquiry")}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-black text-white px-4 py-3 text-[14px] font-semibold transition-all hover:bg-black/90 active:scale-[0.98] disabled:opacity-50"
                >
                  Prepare Enquiry
                  <ArrowRight className="size-4" strokeWidth={2} />
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={typing}
                    onClick={() => void answer("Show Premium Options")}
                    className="flex w-full items-center justify-center rounded-xl border border-gray-300 bg-transparent p-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                  >
                    Show Premium
                  </button>
                  <button
                    type="button"
                    disabled={typing}
                    onClick={() => void answer("Show Budget Options")}
                    className="flex w-full items-center justify-center rounded-xl border border-gray-300 bg-transparent p-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                  >
                    Show Budget
                  </button>
                </div>
                <button
                  type="button"
                  disabled={typing}
                  onClick={() => void answer("Start Over")}
                  className="mt-1 flex w-full items-center justify-center p-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  Start Over
                </button>
              </div>
            ) : step?.options && step.id !== "quantity" ? (`;
text = text.replace(findStr, customRefineUI);

fs.writeFileSync(path, text);
console.log("Applied UI fixes");
