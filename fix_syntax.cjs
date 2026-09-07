const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

// Remove everything from the first "async function finish" to the end of the second "async function finish" block
// Actually, let's just find the exact text we want to replace.
// Let's find "async function proceedEnquiry" and replace everything until "const restart = () => {"
const start = text.indexOf('async function proceedEnquiry');
const end = text.indexOf('const restart = () => {');

const newCode = `async function proceedEnquiry(next: ChatAnswers) {
      const nextIndex = stepIndex + 1;
      if (nextIndex < enquirySteps.length) {
        setStepIndex(nextIndex);
        pushBot(enquirySteps[nextIndex]!.question, 600);
        return;
      }
      await finish(next);
    }
  
    async function finish(final: ChatAnswers) {
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
      if (typing) return;
      const step = phase === "qualification" ? chatSteps[stepIndex] : phase === "enquiry" ? enquirySteps[stepIndex] : refineStep;
      if (!step) return;
  
      const val = opt;
      const clean = val.replace(/<[^>]+>/g, "").trim();
      const next = { ...answers, [step.id]: clean };
      setAnswers(next);
      pushUser(clean);
  
      if (phase === "qualification") {
        const nextIndex = stepIndex + 1;
        if (step.id === "purpose") {
          // If purpose changes, reset occasion
          if (answers.purpose && answers.purpose !== clean) {
             delete next.occasion;
             setAnswers(next);
          }
        }
        if (nextIndex < chatSteps.length) {
          setStepIndex(nextIndex);
          pushBot(chatSteps[nextIndex]!.question, 500);
        } else {
          // We finished qualification, show recommendations
          setPhase("refinement");
          const picks = recommendProducts(shopifyProducts, next);
          setCurrentRecommendations(picks);
          pushBot("Based on what you've told me, here are a few options I'd recommend.", 800, picks, true);
          pushBot(refineStep.question, 1800);
        }
      } else if (phase === "refinement") {
        if (clean === "Start Over") {
           restart();
        } else if (clean === "Prepare Enquiry") {
           setPhase("enquiry");
           setStepIndex(0);
           pushBot(enquirySteps[0]!.question, 600);
        } else {
           // Show Premium / Show Budget
           const picks = recommendProducts(shopifyProducts, next, clean);
           setCurrentRecommendations(picks);
           pushBot(\`Here are some options based on your preference for "\${clean}":\`, 800, picks, true);
           pushBot(refineStep.question, 1800);
        }
      } else if (phase === "enquiry") {
        await proceedEnquiry(next);
      }
    }
  
    `;

text = text.slice(0, start) + newCode + text.slice(end);
fs.writeFileSync(path, text);
console.log("Fixed the double function syntax error.");
