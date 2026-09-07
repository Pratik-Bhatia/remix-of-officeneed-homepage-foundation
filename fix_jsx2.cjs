const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.slice(0, text.lastIndexOf("          </div>"));
text += `          </div>
          </>
        )}
        </div>
      </div>
    </>
  );
}
`;
fs.writeFileSync(path, text);
console.log("Fixed JSX closing tags for real");
