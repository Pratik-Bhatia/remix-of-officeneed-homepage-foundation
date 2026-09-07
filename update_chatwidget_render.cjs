const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

const startRender = text.indexOf('{/* Messages Area */}');
const endRender = text.indexOf('{/* Footer Area */}');

if (startRender > -1 && endRender > -1) {
    const oldBlock = text.slice(startRender, endRender);
    const newBlock = `{phase === "fragrance" ? (
            <FragranceQuiz 
              products={shopifyProducts} 
              onClose={() => setOpen(false)} 
              onReset={restart} 
            />
          ) : (
            <>
              ` + oldBlock.trim() + `
            </>
          )}
          `;
    text = text.slice(0, startRender) + newBlock + text.slice(endRender);
    fs.writeFileSync(path, text);
    console.log("Updated ChatWidget.tsx render");
} else {
    console.log("Could not find render boundaries");
}
