import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
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

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + RATE_LIMIT_WINDOW;
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  record.count += 1;
  return true;
}

export const processLogoServer = createServerFn({ method: "POST" })
  .validator((data: { imageBase64: string }) => {
    if (!data || typeof data.imageBase64 !== "string") {
      throw new Error("Invalid request: image data is required.");
    }
    return data;
  })
  .handler(async ({ data }) => {
    try {
      const ip = getRequestIP() || getRequestHeader("x-forwarded-for") || "unknown";
      if (!checkRateLimit(ip)) {
        return { success: false, error: "Too many requests. Please try again later." };
      }

      const apiKey = process.env['REMOVE_BG_API_KEY'];
      
      if (!apiKey) {
        return { success: false, error: "Image processing is not configured." };
      }
      
      // Strip an optional data URL prefix
      const base64Data = data.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      
      let binaryString;
      try {
        binaryString = atob(base64Data);
      } catch (e) {
        return { success: false, error: "Invalid image encoding." };
      }

      const len = binaryString.length;
      
      if (len > 5 * 1024 * 1024) {
        return { success: false, error: "Image is too large. Please upload a logo under 5MB." };
      }

      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      let isPng = false;
      let isJpeg = false;

      if (len >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        isPng = true;
      }
      if (len >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        isJpeg = true;
      }

      if (!isPng && !isJpeg) {
        return { success: false, error: "Invalid image format. Only PNG and JPEG are supported." };
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
