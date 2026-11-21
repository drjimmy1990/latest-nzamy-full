const enc = new TextEncoder();
/** Normalise so the same paragraph hashes the same after Word whitespace noise. */
export function normalise(t        )         { return t.replace(/\s+/g, " ").trim(); }
export async function sha256Hex(t        )                  {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(normalise(t)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function idempotencyKey(parts          )                  {
  const h = await sha256Hex(parts.join("\u0001"));
  return `word-${h.slice(0, 40)}`; // 45 chars, within 8..128
}
