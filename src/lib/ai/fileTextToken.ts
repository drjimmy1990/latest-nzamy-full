/**
 * fileTextToken.ts — the credential on the link n8n fetches extracted text from
 * (/api/v1/ai/file-text/<token>). Like a storage signed URL, the token is the
 * whole credential: n8n has no session. It names exactly one file or one run's
 * pasted field, one owner, and an expiry, under an HMAC of NZAMY_AI_KEY. It goes
 * in the package to n8n only, and is never sent to the browser or stored.
 *
 *   base64url(JSON) + "." + base64url(HMAC-SHA256(secret, base64url(JSON)))
 *
 * The check compares the signature as text, not as decoded bytes: base64url's
 * last character has spare bits, so several spellings decode to the same bytes.
 *
 * Pure (node:crypto only), so `node --test` runs it. Server code only.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type FileTextClaim =
  /** An attachment: `a` its id, `u` its owner, `e` the expiry in epoch ms. */
  | { a: string; u: string; e: number }
  /** A pasted text: `r` the run, `f` the input field, `u` its owner, `e` the expiry in epoch ms. */
  | { r: string; f: string; u: string; e: number };

/** The same life as a storage signed URL (aiFiles.SIGNED_URL_SECONDS). */
export const FILE_TEXT_TTL_MS = 15 * 60 * 1000;
/** The one bucket a link may read. */
export const AI_FILES_BUCKET = "documents";

const MAX_TOKEN_CHARS = 1024;

const mac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function signFileTextToken(claim: FileTextClaim, secret: string): string {
  if (!secret) throw new Error("file-text token: no secret");
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${payload}.${mac(payload, secret)}`;
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function asClaim(v: unknown): FileTextClaim | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!isText(o.u) || !Number.isSafeInteger(o.e)) return null;
  const keys = Object.keys(o).length;
  if (keys === 3 && isText(o.a)) return { a: o.a, u: o.u, e: o.e as number };
  if (keys === 4 && isText(o.r) && isText(o.f)) return { r: o.r, f: o.f, u: o.u, e: o.e as number };
  return null;
}

/** The claim, or null for anything but an unexpired token this secret signed. */
export function verifyFileTextToken(token: string, secret: string, nowMs: number): FileTextClaim | null {
  if (!secret || typeof token !== "string" || token.length > MAX_TOKEN_CHARS) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (!sameText(parts[1], mac(parts[0], secret))) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const claim = asClaim(parsed);
  return claim && claim.e > nowMs ? claim : null;
}

/**
 * The AI files area: a file in the owner's own folder of the bucket, the rule
 * public.storage_path_in_folder holds for session writes (20261026_65). Older
 * or service-written rows are not bound by that trigger, so it is checked again
 * before the service client reads anything.
 */
export function storagePathInOwnFolder(path: string | null | undefined, owner: string): boolean {
  if (typeof path !== "string" || !owner) return false;
  const segments = path.split("/");
  if (segments.length < 2 || segments[0] !== owner) return false;
  return segments.every((s) => s !== "" && s !== "." && s !== "..");
}
