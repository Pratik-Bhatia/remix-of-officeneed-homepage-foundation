const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

// 1. Remove the old FragranceQuiz block
const oldQuizBlock = `      {phase === "fragrance" && (
        <FragranceQuiz 
          products={shopifyProducts} 
          onClose={() => setOpen(false)} 
          onReset={() => {
            setPhase("qualification");
            setAnswers({});
            setStepIndex(0);
          }} 
        />
      )}`;
text = text.replace(oldQuizBlock, "");

// 2. Wrap the chat transcript and input area
// Find where the Header ends and Transcript begins.
const transcriptStart = `          {/* Transcript / Conversation */}`;
// Find where the dialog ends.
const dialogEnd = `          </div>
        </div>
      </div>
    </>
  );
}`;

const newTranscriptStart = `          {phase === "fragrance" ? (
            <FragranceQuiz 
              products={shopifyProducts} 
              onClose={() => setOpen(false)} 
              onReset={() => {
                setPhase("qualification");
                setAnswers({});
                setStepIndex(0);
              }} 
            />
          ) : (
            <>
              {/* Transcript / Conversation */}`;

const newDialogEnd = `            </>
          )}
          </div>
        </div>
      </div>
    </>
  );
}`;

text = text.replace(transcriptStart, newTranscriptStart);
text = text.replace(dialogEnd, newDialogEnd);

// Also remove any `cn("flex-1 overflow-hidden relative", phase === "fragrance" ? "hidden" : "block")` that we might have added earlier
text = text.replace(
  '<div className={cn("flex-1 overflow-hidden relative", phase === "fragrance" ? "hidden" : "block")}>',
  ''
);

fs.writeFileSync(path, text);
console.log("ChatWidget layout restructured");
