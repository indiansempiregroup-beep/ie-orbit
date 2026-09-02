/** Indian GSTIN (15 chars) — format + checksum (GSTN mod-36). */

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function normalizeGstin(value: string): string {
  return value.replace(/[^0-9a-zA-Z]/g, '').toUpperCase().slice(0, 15);
}

/** Empty is allowed (B2C). Non-empty must be a valid 15-char GSTIN. */
export function validateGstin(value: string): { ok: true; gstin: string } | { ok: false; message: string } {
  const gstin = normalizeGstin(value);
  if (!gstin) return { ok: true, gstin: '' };
  if (gstin.length < 15) {
    return { ok: false, message: 'GSTIN must be 15 characters (e.g. 29AABCU9603R1ZJ).' };
  }
  if (!GSTIN_PATTERN.test(gstin)) {
    return {
      ok: false,
      message: 'Invalid GSTIN format. Use state code + PAN + entity + Z + check digit.',
    };
  }
  if (!gstinChecksumOk(gstin)) {
    return { ok: false, message: 'Invalid GSTIN check digit. Please verify the number.' };
  }
  return { ok: true, gstin };
}

function gstinChecksumOk(gstin: string): boolean {
  const mod = GSTIN_CHARS.length;
  let factor = 1;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const codePoint = GSTIN_CHARS.indexOf(gstin[i]);
    if (codePoint < 0) return false;
    let product = factor * codePoint;
    factor = factor === 1 ? 2 : 1;
    product = Math.floor(product / mod) + (product % mod);
    sum += product;
  }
  const check = (mod - (sum % mod)) % mod;
  return GSTIN_CHARS[check] === gstin[14];
}
