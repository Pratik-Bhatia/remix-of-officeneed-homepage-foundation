/** Standard 15-character Indian GSTIN format: 2-digit state code, 10-char
 * PAN (5 letters + 4 digits + 1 letter), 1-digit entity number, literal
 * "Z", 1 alphanumeric checksum. Shared between client-side form validation
 * and the server function so neither can drift out of sync with the other. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGstin(value: string): boolean {
  return GSTIN_PATTERN.test(value.trim().toUpperCase());
}

export function normalizeGstin(value: string): string {
  return value.trim().toUpperCase();
}
