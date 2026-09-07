const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

// Remove everything from `{error && (` to the end of the file.
const index = text.indexOf('            {error && (');
const bottom = `            {error && (
              <p className="mt-3 text-sm text-destructive text-center font-medium" role="alert">
                {error}
              </p>
            )}
          </div>
            </>
          )}
          </div>
        </div>
    </>
  );
}`;

text = text.substring(0, index) + bottom;
fs.writeFileSync(path, text);
console.log("Fixed JSX syntax manually");
