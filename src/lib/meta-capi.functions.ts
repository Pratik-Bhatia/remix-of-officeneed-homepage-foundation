import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { sendCapiEvent } from "./meta-capi.server";

const ALLOWED = ["PageView", "ViewContent", "Search", "AddToCart", "InitiateCheckout", "Lead"] as const;

const schema = z.object({
  eventName: z.enum(ALLOWED),
  eventId: z.string().min(8).max(100),
  eventSourceUrl: z.string().url().max(2000).optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(30).optional(),
});

function cookie(header: string | null, name: string) {
  const m = header?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]!) : undefined;
}

/** Browser -> server relay for Meta Conversions API. Access token never leaves the server. */
export const sendMetaCapiEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    const token = process.env["META_CAPI_ACCESS_TOKEN"];
    const pixelId = import.meta.env.VITE_META_PIXEL_ID;
    if (!token || !pixelId) return { ok: false as const };
    const req = getRequest();
    const h = req.headers;
    const ok = await sendCapiEvent(pixelId, token, {
      ...data,
      clientIp: h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
      fbp: cookie(h.get("cookie"), "_fbp"),
      fbc: cookie(h.get("cookie"), "_fbc"),
    });
    return { ok };
  });
