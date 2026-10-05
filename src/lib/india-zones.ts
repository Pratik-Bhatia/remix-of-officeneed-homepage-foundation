/** Shopify zone codes for India (Admin API CompanyAddressInput.zoneCode). */
const INDIA_ZONES: Record<string, string> = {
  "andaman and nicobar islands": "AN", "andhra pradesh": "AP", "arunachal pradesh": "AR",
  assam: "AS", bihar: "BR", chandigarh: "CH", chhattisgarh: "CG",
  "dadra and nagar haveli": "DN", "dadra and nagar haveli and daman and diu": "DN", "daman and diu": "DD",
  delhi: "DL", "new delhi": "DL", goa: "GA", gujarat: "GJ", haryana: "HR", "himachal pradesh": "HP",
  "jammu and kashmir": "JK", jharkhand: "JH", karnataka: "KA", kerala: "KL", ladakh: "LA",
  lakshadweep: "LD", "madhya pradesh": "MP", maharashtra: "MH", manipur: "MN", meghalaya: "ML",
  mizoram: "MZ", nagaland: "NL", odisha: "OR", orissa: "OR", puducherry: "PY", pondicherry: "PY",
  punjab: "PB", rajasthan: "RJ", sikkim: "SK", "tamil nadu": "TN", telangana: "TS", tripura: "TR",
  "uttar pradesh": "UP", uttarakhand: "UK", uttaranchal: "UK", "west bengal": "WB",
};
const VALID_CODES = new Set(Object.values(INDIA_ZONES));

/** Converts a state name or code ("Maharashtra", "maharashtra, india", "MH") to Shopify's zone code, or null if unrecognised. */
export function toIndiaZoneCode(input: string): string | null {
  const raw = input.trim();
  if (VALID_CODES.has(raw.toUpperCase())) return raw.toUpperCase();
  const key = raw.toLowerCase().replace(/,?\s*india$/, "").replace(/&/g, "and").replace(/\s+/g, " ").trim();
  return INDIA_ZONES[key] ?? null;
}
