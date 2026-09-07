const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

// We need to inject the closing tags at the very bottom
const index = text.lastIndexOf("</>");
if (index !== -1) {
  // Before </> we need to close the <> that we opened.
  // Wait, the structure is:
  //           </div>
  //         </div>
  //       </div>
  //     </>
  //   );
  // }
  
  const bottom = text.substring(index - 50);
  const fixed = bottom.replace(
    /<\/div>\s*<\/div>\s*<\/div>\s*<\/>/,
    `</div>\n            </>\n          )}\n          </div>\n        </div>\n      </div>\n    </>`
  );
  text = text.substring(0, index - 50) + fixed;
  fs.writeFileSync(path, text);
  console.log("Fixed JSX syntax via lastIndexOf");
}
