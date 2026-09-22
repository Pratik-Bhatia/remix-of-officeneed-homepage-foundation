/**
 * Remembers the visitor's phone number once they've shared it (chat / enquiry),
 * so browse-abandon WhatsApp triggers have a number to send to.
 */
const PHONE_KEY = "officeneed_contact_phone";

export function normalizeIndianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `91${digits}`;
}

export function rememberContactPhone(phone: string | null | undefined) {
  if (typeof window === "undefined") return;
  const normalized = normalizeIndianPhone(phone);
  if (!normalized) return;
  try {
    window.localStorage.setItem(PHONE_KEY, normalized);
  } catch {
    /* storage unavailable -- non-critical */
  }
}

export function getRememberedContactPhone(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeIndianPhone(window.localStorage.getItem(PHONE_KEY));
  } catch {
    return null;
  }
}
