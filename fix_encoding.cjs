const fs = require("fs");

function fixEncoding(file) {
  try {
    const buffer = fs.readFileSync(file);
    // If it's UTF-16LE, convert to UTF-8
    let text;
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      text = buffer.toString('utf16le');
      console.log(`Fixed encoding for ${file}`);
    } else {
      // Sometimes Set-Content in PS5 writes ANSI/ASCII, let's just force rewrite via Node anyway if it's garbled, but Node's readFileSync(file, "utf8") might fail. Let's just read it without utf8 and see if there are null bytes.
      let hasNull = false;
      for (let i = 0; i < 20 && i < buffer.length; i++) {
        if (buffer[i] === 0) hasNull = true;
      }
      if (hasNull) {
        text = buffer.toString('utf16le');
        console.log(`Fixed encoding for ${file} (no BOM)`);
      } else {
        text = buffer.toString('utf8');
      }
    }
    fs.writeFileSync(file, text, "utf8");
  } catch (e) {
    console.error(e);
  }
}

fixEncoding("src/routes/returns-refunds.tsx");
fixEncoding("src/routes/cancellation-policy.tsx");
