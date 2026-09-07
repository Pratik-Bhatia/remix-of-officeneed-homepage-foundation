const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

const start = text.indexOf('async function finish(final: ChatAnswers) {');
const end = text.indexOf('} else if (phase === "refinement") {');

const newFunc = `async function finish(final: ChatAnswers) {
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
  }

  const answer = async (opt: string) => {
`;

text = text.slice(0, start) + newFunc + text.slice(end - 47); // We have to be careful with the exact slice end
fs.writeFileSync(path, text);
console.log("Replaced finish function");
