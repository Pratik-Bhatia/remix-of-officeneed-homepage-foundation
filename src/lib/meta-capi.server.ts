import { createHash } from "crypto";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export interface CapiEventInput {
  eventName: string;
  eventId: string;
  eventSourceUrl?: string | undefined;
  customData?: Record<string, unknown>;
  email?: string | undefined;
  phone?: string | undefined;
  clientIp?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
}

/** Sends one event to Meta Conversions API. Returns false (never throws) on failure. */
export async function sendCapiEvent(pixelId: string, token: string, e: CapiEventInput) {
  const user_data: Record<string, unknown> = {};
  if (e.email) user_data["em"] = [sha256(e.email.trim().toLowerCase())];
  if (e.phone) {
    let digits = e.phone.replace(/\D/g, "");
    if (digits.length === 10) digits = `91${digits}`; // India-only store
    if (digits) user_data["ph"] = [sha256(digits)];
  }
  if (e.clientIp) user_data["client_ip_address"] = e.clientIp;
  if (e.userAgent) user_data["client_user_agent"] = e.userAgent;
  if (e.fbp) user_data["fbp"] = e.fbp;
  if (e.fbc) user_data["fbc"] = e.fbc;

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: e.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: e.eventId,
        action_source: "website",
        event_source_url: e.eventSourceUrl,
        user_data,
        custom_data: e.customData ?? {},
      },
    ],
  };
  const testCode = process.env["META_TEST_EVENT_CODE"];
  if (testCode) body["test_event_code"] = testCode;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    );
    if (!res.ok) {
      console.error("[MetaCAPI] rejected", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[MetaCAPI] request failed", err);
    return false;
  }
}
