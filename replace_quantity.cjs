const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

const startStr = 'step?.id === "quantity" && step.options ? (';
const endStr = '              </div>\n            ) : step?.inputType === "file"';

const startIdx = text.indexOf(startStr);
const endIdx = text.lastIndexOf(') : step?.inputType === "file"', text.indexOf('step?.inputType === "file" ? ('));

if (startIdx === -1 || endIdx === -1) {
  console.log("Could not find start or end index", startIdx, endIdx);
  process.exit(1);
}

const newQuantityUI = `step?.id === "quantity" && step.options ? (
              <div className="flex flex-col gap-4 px-2 pb-2 pt-2 bg-white border border-border/80 rounded-xl shadow-sm">
                <div className="flex flex-col gap-2">
                  <input
                    type="number"
                    min="1"
                    disabled={typing}
                    value={exactQuantity}
                    onChange={(e) => {
                      setExactQuantity(e.target.value);
                      if (exactQuantityError) setExactQuantityError("");
                    }}
                    className="w-full rounded-xl border border-border/80 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/5"
                    placeholder="Enter exact quantity"
                  />
                  {exactQuantityError && <p className="text-[12px] font-medium text-destructive">{exactQuantityError}</p>}
                </div>

                <button
                  type="button"
                  disabled={typing || !exactQuantity}
                  onClick={() => {
                    const val = parseInt(exactQuantity, 10);
                    if (isNaN(val) || val < 1) {
                      setExactQuantityError("Please enter a valid quantity.");
                      return;
                    }
                    void answer(val.toString());
                  }}
                  className="mt-2 w-full rounded-xl bg-foreground text-background py-2.5 text-[14px] font-semibold transition-colors hover:bg-foreground/90 disabled:opacity-50"
                >
                  Confirm Quantity
                </button>
              </div>
            `;

text = text.slice(0, startIdx) + newQuantityUI + text.slice(endIdx);

fs.writeFileSync(path, text);
console.log("Successfully replaced the quantity UI block!");
