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

// 4. Update finish function
const oldFinish = `  async function finish(final: ChatAnswers) {
    const selected = currentRecommendations.filter(p => selectedProductSlugs.has(p.slug));
    const top = selected.length > 0 ? selected[0] : currentRecommendations[0];
    
    setTyping(true);
    setLoadingMsg("Preparing your enquiry...");
    try {
      if (!top) throw new Error("No matching products");
      
      const qtyNum = parseQuantity(final.quantity);

      const productPayload = selected.length > 0 ? selected : [top];
      const selectedProducts = productPayload.map(p => ({
        slug: p.slug,
        name: p.name,
        category: p.category,
        quantity: qtyNum || 1,
        priceStr: p.price ?? "POA",
        priceNum: p.price ? parseInt(p.price.replace(/[^0-9]/g, ''), 10) || 0 : 0
      }));

      setTimeout(() => setLoadingMsg("Creating your summary..."), 1500);
      setTimeout(() => setLoadingMsg("Sending confirmation..."), 3000);

      const result = await submitEnquiry({
        data: {
          productSlug: top.slug,
          productName: top.name,
          category: top.category,
          quantity: qtyNum,
          name: final.name ?? "Chat visitor",
          company: final.company ?? "",
          email: final.email ?? "",
          phone: final.phone,
          message: buildEnquiryMessage(final, selected),
          purpose: final.purpose,
          budget: final.budget,
          timeline: final.timeline,
          notes: final.message,
          file: final.file,
          ...(attachmentsRef.current.length ? { attachments: attachmentsRef.current } : {}),
          selectedProducts,
        },
      });

      if (result?.ok) {
        setPhase("done");
        pushBot("Your enquiry has been successfully submitted! I've sent a confirmation PDF to your email.", 500);
      } else {
        throw new Error(result?.error || "Failed to submit enquiry.");
      }
    } catch (err: any) {
      console.error(err);
      pushBot(err.message || "I'm sorry, I couldn't submit your enquiry. Please try again.", 500);
    } finally {
      setTyping(false);
    }
  }`;

const newFinish = `  async function finish(final: ChatAnswers) {
    const selected = currentRecommendations.filter(p => selectedProductSlugs.has(p.slug));
    const top = selected.length > 0 ? selected[0] : undefined;
    
    setTyping(true);
    setLoadingMsg("Preparing your enquiry...");
    try {
      const qtyNum = parseQuantity(final.quantity);

      const productPayload = selected;
      const selectedProducts = productPayload.map(p => ({
        slug: p.slug,
        name: p.name,
        category: p.category,
        quantity: qtyNum || 1,
        priceStr: p.price ?? "POA",
        priceNum: p.price ? parseInt(p.price.replace(/[^0-9]/g, ''), 10) || 0 : 0
      }));

      setTimeout(() => setLoadingMsg("Creating your summary..."), 1500);
      setTimeout(() => setLoadingMsg("Sending confirmation..."), 3000);

      const result = await submitEnquiry({
        data: {
          productSlug: top ? top.slug : "general-enquiry",
          productName: top ? top.name : "General Enquiry",
          category: top ? top.category : "General",
          quantity: qtyNum,
          name: final.name ?? "Chat visitor",
          company: final.company ?? "",
          email: final.email ?? "",
          phone: final.phone,
          message: buildEnquiryMessage(final, selected),
          purpose: final.purpose,
          budget: final.budget,
          timeline: final.timeline,
          notes: final.message,
          file: final.file,
          ...(attachmentsRef.current.length ? { attachments: attachmentsRef.current } : {}),
          selectedProducts,
        },
      });

      if (result?.ok) {
        setPhase("done");
        pushBot("Your enquiry has been successfully submitted! I've sent a confirmation PDF to your email.", 500);
      } else {
        throw new Error(result?.error || "Failed to submit enquiry.");
      }
    } catch (err: any) {
      console.error(err);
      pushBot(err.message || "I'm sorry, I couldn't submit your enquiry. Please try again.", 500);
    } finally {
      setTyping(false);
    }
  }`;

if (text.includes(oldFinish)) {
    text = text.replace(oldFinish, newFinish);
    fs.writeFileSync(path, text);
    console.log("Successfully applied all fixes to ChatWidget.tsx cleanly.");
} else {
    console.log("oldFinish not found in ChatWidget.tsx! Could not apply replace.");
}
