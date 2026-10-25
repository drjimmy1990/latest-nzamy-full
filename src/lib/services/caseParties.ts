/**
 * caseParties.ts — the parties a case file actually records, by NAME only.
 *
 * Used by the canvas «استيراد من القضية» drawer (N3.5) and the office graph
 * (N3.11). What the platform stores about parties, and nothing more:
 *   * the client — `service_requests.requester.name` (AddCaseModal writes the
 *     موكل's name there and links `lawyer_client_id`);
 *   * on an intake that has them, `metadata.intake.parties.one` (the client's
 *     own side — StepCase labels it «الطرف الأول» under the client's role) and
 *     `.parties.two` (the other side), plus a contracts intake's
 *     `metadata.intake.otherParty`.
 * A case added from the lawyer dashboard records NO opponent at all; the
 * screens say so instead of guessing one.
 *
 * Identity numbers, commercial registers and addresses on PartyData are never
 * read into the result — a party here is a key, a display name and a side.
 */

export type PartyRole = "client" | "opponent";

export interface CaseParty {
  /** Stable within a case: `client:<lawyer_client_id|requester>` or `<role>:<normalised name>`. */
  key: string;
  name: string;
  role: PartyRole;
}

export interface CasePartySource {
  requester?: { name?: unknown; [k: string]: unknown } | null;
  metadata?: Record<string, unknown> | null;
  lawyerClientId?: string | null;
}

/**
 * Comparison form of a name: no diacritics or tatweel, one alef, ى→ي, ة→ه,
 * single spaces, Latin lower-cased. For matching only — never displayed.
 */
export function normalizePartyName(name: string): string {
  return name
    .normalize("NFC")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** A PartyData's display name — never its id or register number. */
function partyName(p: unknown): string {
  if (!isRecord(p)) return "";
  return text(p.fullName) || text(p.companyName) || text(p.entityName);
}

export function extractCaseParties(src: CasePartySource): CaseParty[] {
  const out: CaseParty[] = [];
  const seen = new Set<string>();
  const add = (role: PartyRole, name: string, key?: string) => {
    const norm = normalizePartyName(name);
    if (!norm) return;
    // The same person on the same side is one party. The same name on BOTH
    // sides is kept twice — that is exactly what a conflict hint looks for.
    const dedup = `${role}:${norm}`;
    if (seen.has(dedup)) return;
    seen.add(dedup);
    out.push({ key: key ?? dedup, name, role });
  };

  const requesterName = text(src.requester?.name);
  if (requesterName) add("client", requesterName, `client:${src.lawyerClientId || "requester"}`);

  const intake = isRecord(src.metadata) && isRecord(src.metadata.intake) ? src.metadata.intake : null;
  if (intake) {
    const parties = isRecord(intake.parties) ? intake.parties : null;
    if (parties) {
      add("client", partyName(parties.one));
      add("opponent", partyName(parties.two));
    }
    add("opponent", text(intake.otherParty));
  }
  return out;
}
