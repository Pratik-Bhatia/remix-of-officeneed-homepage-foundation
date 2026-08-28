const fs = require("fs");
let content = fs.readFileSync("src/routes/products.$slug.tsx", "utf8");

const oldHook = `  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && !entry.isIntersecting && entry.boundingClientRect.top < 0) {
          setShowStickyBar(true);
        } else {
          setShowStickyBar(false);
        }
      },
      { threshold: 0 }
    );

    if (purchaseSectionRef.current) {
      observer.observe(purchaseSectionRef.current);
    }
    return () => observer.disconnect();
  }, []);`;

const newHook = `  useEffect(() => {
    const handleScroll = () => {
      if (!purchaseSectionRef.current) return;
      // When the bottom of the purchase section scrolls above the viewport, show the sticky bar.
      const rect = purchaseSectionRef.current.getBoundingClientRect();
      if (rect.bottom < 0) {
        setShowStickyBar(true);
      } else {
        setShowStickyBar(false);
      }
    };
    
    window.addEventListener("scroll", handleScroll, { passive: true });
    // Trigger once on mount in case the user loads the page already scrolled down
    handleScroll();
    
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);`;

if (content.includes(oldHook)) {
    content = content.replace(oldHook, newHook);
} else {
    // try a more fuzzy replace
    const start = content.indexOf('const observer = new IntersectionObserver(');
    if (start !== -1) {
        const useEffectStart = content.lastIndexOf('useEffect(() => {', start);
        const useEffectEnd = content.indexOf('}, []);', start) + 7;
        content = content.substring(0, useEffectStart) + newHook + content.substring(useEffectEnd);
    } else {
        console.log("Could not find observer code to replace");
        process.exit(1);
    }
}

// ALSO: verify if the sticky bar is hidden due to something else.
// Sometimes 'translate-y-full' doesn't get overridden properly if the sticky bar is wrapped weirdly.
// Let's ensure the z-index is high enough. I used z-40. Let's make it z-50 to be safe.
content = content.replace(
  '"fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border shadow-[0_-8px_30px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-in-out",',
  '"fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-in-out",'
);

fs.writeFileSync("src/routes/products.$slug.tsx", content);
console.log("Success");
