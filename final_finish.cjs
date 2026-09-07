const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

const start = text.indexOf('  async function finish(final: ChatAnswers) {');
const end = text.indexOf('  function restart() {');

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

      if (!result.ok) throw new Error(result.error);
      setTyping(false);
      setLoadingMsg("");
      setPhase("done");
      setResultStatus({ enquiryId: result.enquiryId!, emailSent: result.customerEmailSent! });
      
      const successText = result.customerEmailSent 
        ? \`Your enquiry has been submitted successfully.\\n\\nWe've sent a confirmation to \${final.email}.\\n\\nEnquiry ID: \${result.enquiryId}\` 
        : \`Your enquiry was received successfully.\\n\\nWe couldn't send the confirmation email right now, but our team has received your enquiry.\\n\\nEnquiry ID: \${result.enquiryId}\`;

      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "bot",
          text: successText,
        },
      ]);
    } catch (err) {
      setTyping(false);
      setLoadingMsg("");
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setMessages((m) => [
        ...m,
        { id: uid(), role: "bot", text: "We couldn't submit your enquiry right now. Please try again." },
      ]);
    }
  }

`;

text = text.slice(0, start) + newFinish + text.slice(end);
fs.writeFileSync(path, text);
console.log("Successfully replaced finish function.");
