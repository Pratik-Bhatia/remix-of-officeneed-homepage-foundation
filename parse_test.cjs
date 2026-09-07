const html = `
<p>Upgrade your corporate gifting...</p>
<p><b>Product Features:</b></p>
<ul type="disc">
<li>A5 Premium Notebook Diary</li>
<li>Colors: Black, Brown, Grey, Blue</li>
</ul>
`;

// In Node, we can use regex to simulate what DOMParser would do, or just regex.
const sections = [];
let currentSection = { title: "DESCRIPTION", content: "" };

// A simple robust splitter for known headers:
// We look for <h3>...</h3>, <strong>...</strong>, or <b>...</b> that act as section headers.
const headerRegex = /<(h[2-4]|b|strong)[^>]*>\s*(Product Features|Key Features|Features|Specifications|Fragrance Notes|Product Details|Material|Dimensions|Compatibility|What's Included)[^\w]*\s*<\/\1>/gi;

let lastIndex = 0;
let match;
while ((match = headerRegex.exec(html)) !== null) {
  if (match.index > lastIndex) {
    currentSection.content += html.substring(lastIndex, match.index);
  }
  
  if (currentSection.content.trim()) {
    sections.push({ ...currentSection });
  }
  
  currentSection = { title: match[2].toUpperCase(), content: "" };
  lastIndex = headerRegex.lastIndex;
}
currentSection.content += html.substring(lastIndex);
if (currentSection.content.trim()) {
  sections.push(currentSection);
}

console.log(JSON.stringify(sections, null, 2));
