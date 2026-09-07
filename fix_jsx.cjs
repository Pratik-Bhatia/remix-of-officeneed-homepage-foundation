const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  `          </div>
        </div>
      </div>
    </>
  );
}`,
  `          </div>
          </>
        )}
        </div>
      </div>
    </>
  );
}`
);

fs.writeFileSync(path, text);
console.log("Fixed JSX closing tags");
