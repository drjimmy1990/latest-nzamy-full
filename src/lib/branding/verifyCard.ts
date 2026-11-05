/**
 * verifyCard.ts — q343: the short card a verified, unpublished lawyer's QR
 * opens. Pure, so verifyCard.test.ts pins it; the routes only carry these
 * answers. Mirrors supabase/migrations/20261103_69_letterhead_verify_card.sql.
 *
 * What the public may learn: the name, the licence number and «موثّق». Every
 * other case (unknown token, switch off, unverified, a firm, a database error)
 * is the same `{"state":"home"}`, so a token reveals nothing and an old printed
 * page never leads to a 404. The token is 160 random bits, never the user id.
 */

export const VERIFY_TOKEN_RE = /^[a-z2-7]{32}$/;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export const HOME_ANSWER = { state: "home" } as const;

export type VerifyCardAnswer =
  | typeof HOME_ANSWER
  | { state: "card"; name: string; licence: string | null; published: boolean; slug: string | null };

export function isVerifyToken(value: unknown): value is string {
  return typeof value === "string" && VERIFY_TOKEN_RE.test(value);
}

/** 20 random bytes → 32 lowercase base32 characters (RFC 4648, no padding). */
export function base32Token(bytes: Uint8Array): string {
  if (bytes.length !== 20) throw new Error("base32Token: exactly 20 bytes");
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return out;
}

/** Only the listed keys, whatever came back. Anything that is not a named card is home. */
export function publicCardAnswer(raw: unknown): VerifyCardAnswer {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!r || r.state !== "card" || typeof r.name !== "string" || !r.name.trim()) return HOME_ANSWER;
  const published = r.published === true;
  return {
    state: "card",
    name: r.name,
    licence: typeof r.licence === "string" && r.licence ? r.licence : null,
    published,
    slug: published && typeof r.slug === "string" && r.slug ? r.slug : null,
  };
}

/**
 * The public route's whole decision. A bad shape never reaches the database,
 * and a failure of any kind reads exactly like an unknown token.
 */
export async function readPublicCard(
  token: string,
  rpc: (token: string) => Promise<{ data: unknown; error: unknown }>,
): Promise<VerifyCardAnswer> {
  if (!isVerifyToken(token)) return HOME_ANSWER;
  try {
    const { data, error } = await rpc(token);
    return error ? HOME_ANSWER : publicCardAnswer(data);
  } catch {
    return HOME_ANSWER;
  }
}

export function parseVerifyCardBody(body: unknown): { enabled: boolean } | null {
  const enabled = body && typeof body === "object" ? (body as { enabled?: unknown }).enabled : undefined;
  return typeof enabled === "boolean" ? { enabled } : null;
}

export interface VerifyCardState {
  token: string | null;
  enabled: boolean;
}

interface VerifyCardRow {
  id: string;
  verify_token: string | null;
  qr_verify_card: boolean;
}

/**
 * What GET /api/v1/branding tells a lawyer. A token is minted only when it can
 * be used: verified, unpublished, switch on, none yet. The stored token is the
 * one returned, so two requests in a race agree. With the switch off no token
 * leaves the server. Null = 20261103_69 has not run or the read failed: no
 * card, and the letterhead prints as it does today.
 */
export async function resolveLawyerVerifyCard(
  who: { verified: boolean; marketplaceVisible: boolean },
  deps: {
    read: () => Promise<{ data: VerifyCardRow | null; error: { code?: string } | null }>;
    mint: (vaultId: string, token: string) => Promise<{ data: string | null; error: { code?: string } | null }>;
    newToken: () => string;
  },
): Promise<VerifyCardState | null> {
  const { data: row, error } = await deps.read();
  if (error) return null;
  if (!row) return { token: null, enabled: true };
  if (!row.qr_verify_card) return { token: null, enabled: false };
  if (!who.verified || who.marketplaceVisible) return { token: null, enabled: true };
  if (row.verify_token) return { token: row.verify_token, enabled: true };
  const minted = await deps.mint(row.id, deps.newToken());
  if (minted.error) return minted.error.code === "PGRST202" ? null : { token: null, enabled: true };
  return { token: minted.data, enabled: true };
}

/** PostgREST / Postgres codes for "the switch's column is not there yet" (20261103_69 not run). */
export function isMissingVerifyCardColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}
