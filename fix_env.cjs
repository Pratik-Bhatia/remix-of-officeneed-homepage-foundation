const fs = require('fs');

// Update .env
let envContent = fs.readFileSync('.env', 'utf8');
if (!envContent.includes('VITE_REMOVE_BG_API_KEY')) {
  envContent += '\nVITE_REMOVE_BG_API_KEY=b2ehAYXPRTRtNGXhbk7vWovt\n';
  fs.writeFileSync('.env', envContent, 'utf8');
}

// Update server function
const filePath = 'src/lib/image-processing.functions.ts';
let code = fs.readFileSync(filePath, 'utf8');
code = code.replace(/const apiKey = process\.env\.REMOVE_BG_API_KEY \|\| \(import\.meta as any\)\.env\?\.REMOVE_BG_API_KEY;/g, 'const apiKey = process.env.REMOVE_BG_API_KEY || (import.meta as any).env?.REMOVE_BG_API_KEY || (import.meta as any).env?.VITE_REMOVE_BG_API_KEY || process.env.VITE_REMOVE_BG_API_KEY;');
fs.writeFileSync(filePath, code, 'utf8');

console.log("Updated .env and server function to use VITE_REMOVE_BG_API_KEY");
