/**
 * zatcaQr.ts — the QR payload of a simplified tax invoice in the ZATCA
 * e-invoicing TLV form (batch l7; owner 18 Nov 2026: «الفاتورة الضريبية
 * تلقائية»).
 *
 * Five fields, each Tag (1 byte) · Length (1 byte, the UTF-8 BYTE count, not
 * the JS string length — an Arabic seller name is 2 bytes a letter) · Value,
 * concatenated and base64-encoded:
 *   1 seller name · 2 VAT registration number · 3 time stamp (ISO 8601 UTC,
 *   no milliseconds) · 4 invoice total with VAT · 5 VAT total.
 * Amounts are Latin digits with two decimals and no grouping ("3445.40").
 *
 * This is the QR content of the simplified invoice only. It is NOT a claim of
 * ZATCA Phase-2 integration (no cryptographic stamp, no clearance); the page
 * never says otherwise.
 *
 * Pure: no imports, so `node --test` loads it.
 */

export interface ZatcaQrFields {
  sellerName: string;
  vatNumber: string;
  /** Any Date.parse-able time; written as ISO 8601 UTC without milliseconds. */
  timestamp: string;
  totalHalalas: number;
  vatHalalas: number;
}

/** 344540 → "3445.40" (Latin digits, no grouping). */
export function halalasToAmount(halalas: number): string {
  if (!Number.isSafeInteger(halalas) || halalas < 0) throw new RangeError("halalas must be a non-negative integer");
  return `${Math.floor(halalas / 100)}.${String(halalas % 100).padStart(2, "0")}`;
}

/** "2026-11-19T06:00:00.000Z" → "2026-11-19T06:00:00Z". */
export function zatcaTimestamp(value: string): string {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) throw new RangeError("invalid timestamp");
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** The base64 TLV payload; throws when a field is empty or longer than 255 bytes. */
export function zatcaQrPayload(f: ZatcaQrFields): string {
  const values = [f.sellerName.trim(), f.vatNumber.trim(), zatcaTimestamp(f.timestamp), halalasToAmount(f.totalHalalas), halalasToAmount(f.vatHalalas)];
  const encoder = new TextEncoder();
  const parts: number[] = [];
  values.forEach((value, i) => {
    const bytes = encoder.encode(value);
    if (bytes.length === 0 || bytes.length > 255) throw new RangeError(`TLV field ${i + 1} must be 1–255 bytes`);
    parts.push(i + 1, bytes.length, ...bytes);
  });
  return bytesToBase64(Uint8Array.from(parts));
}

/** The fields back from a payload (tests and support checks). */
export function decodeZatcaQr(payload: string): Record<number, string> {
  const bytes = base64ToBytes(payload);
  const decoder = new TextDecoder();
  const out: Record<number, string> = {};
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i];
    const len = bytes[i + 1];
    if (len === undefined || i + 2 + len > bytes.length) throw new RangeError("truncated TLV");
    out[tag] = decoder.decode(bytes.slice(i + 2, i + 2 + len));
    i += 2 + len;
  }
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return out;
}
function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/=+$/, "");
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new RangeError("invalid base64");
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buffer >> bits) & 255); }
  }
  return Uint8Array.from(out);
}
