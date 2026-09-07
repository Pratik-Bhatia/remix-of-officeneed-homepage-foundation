import { createServerFn } from "@tanstack/react-start";
import { decode, encode } from "fast-png";

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

// Max ~5MB of binary image data (base64 is ~4/3 larger). Prevents abuse of the paid API.
const MAX_BASE64_LENGTH = 7 * 1024 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/=\s]+$/;

export const processLogoServer = createServerFn({ method: "POST" })
  .validator((data: { imageBase64: string }) => {
    if (!data || typeof data.imageBase64 !== "string") {
      throw new Error("Invalid request: image data is required.");
    }
    return data;
  })
  .handler(async ({ data }) => {
    try {
      const apiKey = process.env['REMOVE_BG_API_KEY'];
      
      if (!apiKey) {
        return { success: false, error: "Image processing is not configured." };
      }
      
      // Strip an optional data URL prefix, then enforce a hard size cap before
      // forwarding anything to the paid remove.bg API.
      const base64Data = data.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      
      if (base64Data.length > MAX_BASE64_LENGTH) {
        return { success: false, error: "Image is too large. Please upload a logo under 5MB." };
      }
      if (!BASE64_RE.test(base64Data)) {
        return { success: false, error: "Invalid image data." };
      }
      
      const response = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey,
          "Content-Type": "application/json",
          "Accept": "image/png"
        },
        body: JSON.stringify({
          image_file_b64: base64Data,
          size: "auto"
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Remove.bg API failed: ${response.status} ${errorText}` };
      }
      
      const uvArrayBuffer = await response.arrayBuffer();
      const uvBase64 = `data:image/png;base64,${arrayBufferToBase64(uvArrayBuffer)}`;
      
      const pngImage = decode(uvArrayBuffer);
      const pixels = pngImage.data;
      
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3]! > 0) {
          const r = pixels[i]!;
          const g = pixels[i + 1]!;
          const b = pixels[i + 2]!;
          
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          const silverBase = Math.floor(160 + (luminance / 255) * 60);
          
          pixels[i] = silverBase;
          pixels[i + 1] = silverBase;
          pixels[i + 2] = silverBase;
        }
      }
      
      const laserUint8 = encode(pngImage);
      const laserBase64 = `data:image/png;base64,${arrayBufferToBase64(laserUint8)}`;
      
      return {
        success: true,
        uvLogoUrl: uvBase64,
        laserLogoUrl: laserBase64
      };
    } catch (e: any) {
      return { success: false, error: "Server error: " + (e.message || String(e)) };
    }
  });
