const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
const match = text.match(/const handleAnswer = [\s\S]*?(?=const handleSkip = |const handleDraftSubmit = |return \()/);
if (match) console.log(match[0]);
