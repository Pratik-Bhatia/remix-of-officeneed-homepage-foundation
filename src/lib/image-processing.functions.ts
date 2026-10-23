import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import type { ProcessLogoResult } from "@/lib/logo-processing-core.server";

// Browser-facing module: only the server-function wrapper lives here. The
// real work (processLogoCore) is in logo-processing-core.server.ts and is
// loaded lazily inside the handler, so it never enters the client bundle.
export type { ProcessLogoResult };

export const processLogoServer = createServerFn({ method: "POST" })
  .validator((data: { imageBase64: string }) => {
    if (!data || typeof data.imageBase64 !== "string") {
      throw new Error("Invalid request: image data is required.");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const ip = getRequestIP() || getRequestHeader("x-forwarded-for") || "unknown";
    const { processLogoCore } = await import("@/lib/logo-processing-core.server");
    return processLogoCore(data, ip);
  });
