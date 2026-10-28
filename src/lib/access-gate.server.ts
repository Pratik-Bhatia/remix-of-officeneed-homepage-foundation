// Temporary, website-wide pre-launch access gate. Server-only -- never
// imported by client code. Wired into the global request pipeline from
// src/start.ts, so it runs for every incoming request (page navigations
// and server-function RPC calls alike) before the real app sees any of
// them.
//
// ---- Launch-day switch ----
// OFF by default (unset, or any value other than "true"). To turn it ON,
// set in the deployment environment:
//   OFFICENEED_ACCESS_GATE_ENABLED=true
//   OFFICENEED_ACCESS_CODE=<the real access code -- never commit this>
//   OFFICENEED_ACCESS_GATE_SECRET=<a long random string, used only to sign cookies>
// To go live on launch day, set OFFICENEED_ACCESS_GATE_ENABLED=false (or
// remove it) and redeploy -- the site then behaves exactly as it does
// today, with nothing left running. No code needs to be reverted.
//
// The logo is served from public/officeneed-logo.png (a plain copy of
// src/assets/officeneed-logo.png) rather than a Vite asset import: this
// page is rendered before the real app/bundle exists for an unauthenticated
// visitor, and a stable, unhashed path keeps it independent of the build.
const logoUrl = "/officeneed-logo.png";

const SESSION_COOKIE = "officeneed_gate_session";
const ATTEMPTS_COOKIE = "officeneed_gate_attempts";
export const ACCESS_GATE_VERIFY_PATH = "/__officeneed-access-gate/verify";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const MAX_ATTEMPTS_BEFORE_LOCKOUT = 8;
const LOCKOUT_SECONDS = 15 * 60; // 15 minutes
const VERIFY_RESPONSE_DELAY_MS = 400; // flattens timing differences, mildly slows scripted guessing
const IP_WINDOW_MS = 60_000;
const IP_MAX_PER_WINDOW = 20;

export function isAccessGateEnabled(): boolean {
  return process.env["OFFICENEED_ACCESS_GATE_ENABLED"] === "true";
}

function getAccessCode(): string | null {
  return process.env["OFFICENEED_ACCESS_CODE"] || null;
}

function getSigningSecret(): string | null {
  return process.env["OFFICENEED_ACCESS_GATE_SECRET"] || null;
}

// ---- base64url + HMAC-SHA256, via Web Crypto -- available as a global
// in both Node and the Cloudflare Workers runtime, so this needs no new
// dependency and works identically in dev and production. ----

function toBase64Url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): Uint8Array {
  const b64 = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function signToken(secret: string, payload: unknown): Promise<string> {
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSha256(secret, payloadB64);
  return `${payloadB64}.${toBase64Url(sig)}`;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length, 1);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function verifySignedToken<T>(secret: string, token: string | undefined | null): Promise<T | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let expectedSig: Uint8Array;
  let actualSig: Uint8Array;
  try {
    expectedSig = await hmacSha256(secret, payloadB64);
    actualSig = fromBase64Url(sigB64);
  } catch {
    return null;
  }
  if (!timingSafeEqualBytes(expectedSig, actualSig)) return null;
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as T;
  } catch {
    return null;
  }
}

// Never a plain `===` for the submitted code -- avoids leaking length/
// prefix-match information through comparison timing.
function timingSafeEqualCode(submitted: string, expected: string): boolean {
  return timingSafeEqualBytes(new TextEncoder().encode(submitted), new TextEncoder().encode(expected));
}

// ---- cookies ----

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function buildSetCookie(name: string, value: string, opts: { maxAgeSeconds: number; secure: boolean }): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${opts.maxAgeSeconds}`];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

function buildClearCookie(name: string, secure: boolean): string {
  const parts = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

// Secure cookies require HTTPS -- detect protocol rather than hardcoding
// so local http:// dev still works (the browser silently drops Secure
// cookies set over plain HTTP, which would otherwise look like a broken
// gate locally).
function isHttps(request: Request): boolean {
  if (new URL(request.url).protocol === "https:") return true;
  return request.headers.get("x-forwarded-proto") === "https";
}

// ---- brute-force mitigation ----
//
// Two independent, intentionally simple layers -- see the "Security
// limitations" note this ships with in the task report for what they do
// NOT cover.
//
// 1) A signed, client-held lockout cookie (ATTEMPTS_COOKIE): survives a
//    Worker cold start, but a visitor who clears cookies resets their own
//    counter. Tamper-evident (HMAC-signed), not tamper-proof against
//    deletion.
// 2) A per-isolate in-memory IP window below: resets on cold start, not
//    shared across edge locations/isolates. A cheap first line of
//    defense against a burst hitting one warm isolate, nothing more.
const ipWindow = new Map<string, { count: number; windowStart: number }>();

function ipRateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = ipWindow.get(ip);
  if (!rec || now - rec.windowStart > IP_WINDOW_MS) {
    ipWindow.set(ip, { count: 1, windowStart: now });
    return false;
  }
  rec.count += 1;
  return rec.count > IP_MAX_PER_WINDOW;
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function sanitizeRedirectTarget(raw: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("://") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw) || raw.startsWith(ACCESS_GATE_VERIFY_PATH)) return "/";
  return raw;
}

// ---- the gate page (fully self-contained: inline CSS, no external JS
// bundle, one small progressive-enhancement <script> for the button's
// loading state -- the form works with JS disabled too) ----

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderGatePage({ redirectTo, error, locked }: { redirectTo: string; error?: string; locked?: boolean }): string {
  const safeRedirect = escapeHtml(redirectTo);
  const errorHtml = error ? `<p class="gate-error" role="alert">${escapeHtml(error)}</p>` : "";
  const disabledAttr = locked ? "disabled" : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Officeneed — Private Preview</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    color: #111111;
    font-family: "Open Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: 24px;
  }
  .gate-card { width: 100%; max-width: 380px; text-align: center; }
  .gate-logo { height: 36px; width: auto; margin: 0 auto 32px; display: block; }
  .gate-heading { font-size: 1.5rem; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 12px; color: #111111; }
  .gate-body { font-size: 0.95rem; line-height: 1.5; color: #555555; margin: 0 0 28px; }
  form { margin: 0; }
  .gate-field { text-align: left; margin-bottom: 16px; }
  label { display: block; font-size: 0.8rem; font-weight: 500; color: #111111; margin-bottom: 6px; }
  input[type="password"] {
    width: 100%;
    padding: 12px 14px;
    font-size: 0.95rem;
    border: 1px solid #d4d4d4;
    border-radius: 6px;
    outline: none;
    background: #ffffff;
    color: #111111;
  }
  input[type="password"]:focus { border-color: #111111; }
  button[type="submit"] {
    width: 100%;
    padding: 12px 14px;
    font-size: 0.95rem;
    font-weight: 600;
    border: none;
    border-radius: 6px;
    background: #111111;
    color: #ffffff;
    cursor: pointer;
  }
  button[type="submit"]:disabled { opacity: 0.6; cursor: not-allowed; }
  button[type="submit"]:hover:not(:disabled) { background: #000000; }
  .gate-error { color: #b42318; font-size: 0.85rem; margin: 0 0 16px; text-align: left; }
  .gate-support { margin: 24px 0 0; font-size: 0.78rem; color: #8a8a8a; letter-spacing: 0.01em; }
  @media (max-width: 420px) { .gate-heading { font-size: 1.3rem; } }
</style>
</head>
<body>
  <main class="gate-card">
    <img class="gate-logo" src="${logoUrl}" alt="Officeneed" />
    <h1 class="gate-heading">Something exceptional is coming.</h1>
    <p class="gate-body">We're preparing the new Officeneed experience. Enter your access code to explore the website before launch.</p>
    ${errorHtml}
    <form method="POST" action="${ACCESS_GATE_VERIFY_PATH}" id="gate-form">
      <input type="hidden" name="redirect" value="${safeRedirect}" />
      <div class="gate-field">
        <label for="gate-code">Access code</label>
        <input id="gate-code" name="code" type="password" autocomplete="off" autofocus required aria-label="Access code" ${disabledAttr} />
      </div>
      <button type="submit" id="gate-submit" ${disabledAttr}>Unlock website</button>
    </form>
    <p class="gate-support">Private preview · Official launch coming soon</p>
  </main>
  <script>
    (function () {
      var form = document.getElementById("gate-form");
      var btn = document.getElementById("gate-submit");
      if (!form || !btn) return;
      form.addEventListener("submit", function () {
        btn.disabled = true;
        btn.textContent = "Unlocking…";
      });
    })();
  </script>
</body>
</html>`;
}

function htmlResponse(body: string, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", ...extraHeaders },
  });
}

async function handleVerify({ request, secret, code, https }: { request: Request; secret: string; code: string; https: boolean }): Promise<Response> {
  const ip = clientIp(request);
  const cookies = parseCookies(request.headers.get("cookie"));
  const attempts = (await verifySignedToken<{ count: number; lockUntil: number }>(secret, cookies[ATTEMPTS_COOKIE])) ?? { count: 0, lockUntil: 0 };
  const now = Date.now();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    form = new FormData();
  }
  const submitted = String(form.get("code") ?? "");
  const redirectTo = sanitizeRedirectTarget(String(form.get("redirect") ?? "/"));

  // Deliberately never logged -- submitted codes must never reach logs.
  await new Promise((resolve) => setTimeout(resolve, VERIFY_RESPONSE_DELAY_MS));

  const overIpLimit = ipRateLimited(ip);
  const stillLockedOut = attempts.lockUntil > now;

  if (overIpLimit || stillLockedOut) {
    const retryAfterSeconds = stillLockedOut ? Math.ceil((attempts.lockUntil - now) / 1000) : 60;
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return htmlResponse(
      renderGatePage({ redirectTo, error: `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, locked: true }),
      429,
    );
  }

  if (submitted && timingSafeEqualCode(submitted, code)) {
    const sessionToken = await signToken(secret, { exp: now + SESSION_TTL_SECONDS * 1000 });
    const headers = new Headers({ location: redirectTo });
    headers.append("set-cookie", buildSetCookie(SESSION_COOKIE, sessionToken, { maxAgeSeconds: SESSION_TTL_SECONDS, secure: https }));
    headers.append("set-cookie", buildClearCookie(ATTEMPTS_COOKIE, https));
    return new Response(null, { status: 303, headers });
  }

  const newCount = attempts.count + 1;
  const locked = newCount >= MAX_ATTEMPTS_BEFORE_LOCKOUT;
  const newAttempts = locked ? { count: 0, lockUntil: now + LOCKOUT_SECONDS * 1000 } : { count: newCount, lockUntil: 0 };
  const attemptsToken = await signToken(secret, newAttempts);

  const response = htmlResponse(
    renderGatePage({
      redirectTo,
      error: locked ? `Too many attempts. Please try again in ${Math.ceil(LOCKOUT_SECONDS / 60)} minutes.` : "That access code isn't correct. Please try again.",
      locked,
    }),
    locked ? 429 : 401,
  );
  response.headers.append("set-cookie", buildSetCookie(ATTEMPTS_COOKIE, attemptsToken, { maxAgeSeconds: LOCKOUT_SECONDS * 4, secure: https }));
  return response;
}

/**
 * The single entry point the request middleware (src/start.ts) calls for
 * every incoming request. Returns a Response to short-circuit (gate page,
 * verify result, or a misconfiguration failure), or `null` to mean "let
 * the real app handle this" -- either because the gate is disabled, or
 * because this request already carries a valid unlock session.
 */
export async function handleAccessGateRequest({
  request,
  pathname,
  handlerType,
}: {
  request: Request;
  pathname: string;
  handlerType: "serverFn" | "router";
}): Promise<Response | null> {
  if (!isAccessGateEnabled()) return null;

  const secret = getSigningSecret();
  const code = getAccessCode();
  if (!secret || !code) {
    // Fail CLOSED: a half-configured gate (enabled but missing its
    // secrets) must never silently fall through to the public site.
    console.error("[access-gate] OFFICENEED_ACCESS_GATE_ENABLED=true but OFFICENEED_ACCESS_CODE / OFFICENEED_ACCESS_GATE_SECRET is not set.");
    return htmlResponse(renderGatePage({ redirectTo: pathname, error: "The access gate is temporarily unavailable. Please try again shortly.", locked: true }), 503);
  }

  const https = isHttps(request);

  if (pathname === ACCESS_GATE_VERIFY_PATH) {
    if (request.method === "POST") return handleVerify({ request, secret, code, https });
    return new Response(null, { status: 303, headers: { location: "/" } });
  }

  const cookies = parseCookies(request.headers.get("cookie"));
  const session = await verifySignedToken<{ exp: number }>(secret, cookies[SESSION_COOKIE]);
  if (session && session.exp > Date.now()) return null; // unlocked -- proceed exactly as if the gate didn't exist

  // Not unlocked. A direct hit on a serverFn RPC path (not a normal page
  // navigation) gets a minimal response -- no HTML page, nothing about
  // the gate's existence or copy -- since no legitimate browser session
  // reaches this pre-unlock (the real app bundle is never served to an
  // unauthenticated visitor in the first place).
  if (handlerType === "serverFn") {
    return new Response("Unauthorized", { status: 401 });
  }

  const redirectTo = sanitizeRedirectTarget(pathname + new URL(request.url).search);
  return htmlResponse(renderGatePage({ redirectTo }), 401);
}
