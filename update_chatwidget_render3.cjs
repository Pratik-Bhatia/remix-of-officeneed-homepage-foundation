const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  '{/* Transcript / Conversation */}',
  `{phase === "fragrance" ? (
              <FragranceQuiz 
                products={[]} 
                onClose={() => setOpen(false)} 
                onReset={restart} 
              />
            ) : (
              <>
            {/* Transcript / Conversation */}`
);

text = text.replace(
  '{/* Footer Area */}',
  `              </>
            )}
            {/* Footer Area */}`
);

fs.writeFileSync(path, text);
console.log("Updated ChatWidget.tsx render correctly");
