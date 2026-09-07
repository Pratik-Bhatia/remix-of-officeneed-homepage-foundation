const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  'onClick={() => setOpen(false)}',
  'onClick={() => { setOpen(false); if (phase === "fragrance") setPhase("qualification"); }}'
);

text = text.replace(
  'onClick={() => setOpen(false)}', // Replace second occurrence if any
  'onClick={() => { setOpen(false); if (phase === "fragrance") setPhase("qualification"); }}'
);

// We need to find the specific close button in the header and update it.
// Actually, let's just make useEffect that runs when open changes.
const hook = `  useEffect(() => {
    if (!open && phase === "fragrance") {
      setPhase("qualification");
    }
  }, [open, phase]);`;

if (!text.includes("if (!open && phase ===")) {
  text = text.replace(
    'const [stepIndex, setStepIndex] = useState(0);',
    'const [stepIndex, setStepIndex] = useState(0);\n' + hook
  );
}

fs.writeFileSync(path, text);
console.log("Added state reset on close");
