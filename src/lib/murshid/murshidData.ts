/**
 * murshidData — validation and the public shape of «المرشد القضائي» grievance
 * data (batch 2026-11-08, task A2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Source: the owner's corrected murshid package (2026-10-28) — 32 sector files
 * (424 procedure cards) and unified_channels.json (15 national channels).
 * scripts/murshid-import.mjs writes them into src/data/murshid/ through
 * slimRawSector / slimChannels (bottom of this file): same field names, only
 * the fields the routes serve, so nothing withheld is ever committed (the
 * repository is public). The projection below runs again when the server
 * serves them (src/lib/murshid/murshidStore.ts), never in the browser.
 *
 * What the browser receives is narrower than the files:
 *   - links: https only, a real dotted host, no IP literal, no social "share"
 *     endpoints (the scrape caught Twitter/LinkedIn/Facebook/WhatsApp share
 *     buttons wrapping http links) and no readspeaker player URL. A link that
 *     fails is dropped — never upgraded to https, which would claim a working
 *     site nobody checked. A bare http URL written inside free text is cut out
 *     of the text too.
 *   - the two my.gov.sa test records (agency.is_test_record, ids 319731 and
 *     18143 in coverage_map.json) are removed.
 *   - legal_basis[].quote (~1.2 MB of statute text) and legal_basis[].source
 *     (a path inside the owner's own library folder) are not sent: article text
 *     is server-only on this platform since 20260929_01. The instrument and
 *     article stay, so a deadline can still say which article sets it.
 *
 * Nothing here renders HTML; every string reaches React as text.
 *
 * Pure, relative imports only: `node --test` loads it directly.
 */

import { searchRows } from "../../app/ai/procedures/_circuitsSearch.ts";

// ─── Raw file shapes (as the owner's package writes them) ────────────────────

export interface RawDeadline {
  duration?: unknown;
  from_event?: unknown;
  legal_basis_id?: unknown;
}

export interface RawStep {
  n?: unknown;
  action?: unknown;
  channel?: unknown;
  where?: unknown;
  deadline?: RawDeadline | null;
  source?: unknown;
}

export interface RawEscalation {
  body?: unknown;
  channel?: unknown;
  where?: unknown;
  deadline?: RawDeadline | null;
}

export interface RawCard {
  card_id?: unknown;
  card_kind?: unknown;
  sector_no?: unknown;
  agency?: { name?: unknown; my_gov_id?: unknown; website?: unknown; is_test_record?: unknown } | null;
  problem_type?: unknown;
  stage?: unknown;
  who_can_file?: unknown;
  steps?: unknown;
  escalation?: unknown;
  final_forum?: unknown;
  documents_required?: unknown;
  fees?: unknown;
  legal_basis?: unknown;
  contacts?: {
    emails?: unknown;
    phones?: unknown;
    portals?: unknown;
  } | null;
  unverified_items?: unknown;
  unverified_contacts?: unknown;
  related_najiz_classification?: unknown;
  last_verified?: unknown;
  confidence?: unknown;
}

export interface RawSector {
  sector_no?: unknown;
  sector_code?: unknown;
  title?: unknown;
  generated_at?: unknown;
  total_cards_count?: unknown;
  cards?: unknown;
}

// ─── Public shapes (what the API routes return) ──────────────────────────────

export interface MurshidDeadline {
  duration: string;
  fromEvent: string;
  /** «المادة الثامنة — نظام المرافعات أمام ديوان المظالم», when the card names it. */
  basis: string | null;
}

export interface MurshidStep {
  n: number;
  action: string;
  channel: string;
  /** Text of `where` when it is not a link; "" when it was an unsafe link. */
  where: string;
  whereUrl: string | null;
  deadline: MurshidDeadline | null;
  source: string;
}

export interface MurshidEscalation {
  body: string;
  channel: string;
  where: string;
  whereUrl: string | null;
  deadline: MurshidDeadline | null;
}

export interface MurshidCard {
  id: string;
  kind: "problem" | "agency";
  sectorNo: number;
  agency: { name: string; website: string | null };
  problemType: string;
  stage: string;
  whoCanFile: string;
  steps: MurshidStep[];
  escalation: MurshidEscalation[];
  finalForum: string;
  documents: string[];
  fees: string;
  legalBasis: { id: string; label: string }[];
  contacts: { phones: string[]; emails: string[]; portals: { name: string; url: string }[] };
  unverified: string[];
  najiz: string[];
  lastVerified: string;
  confidence: string;
}

export interface MurshidSectorSummary {
  no: number;
  code: string;
  title: string;
  problemCards: number;
  agencyCards: number;
  total: number;
}

export interface MurshidSector extends MurshidSectorSummary {
  generatedAt: string;
  cards: MurshidCard[];
}

export interface MurshidSearchEntry {
  cardId: string;
  sectorNo: number;
  sectorTitle: string;
  agency: string;
  problemType: string;
  kind: "problem" | "agency";
}

export interface MurshidChannel {
  id: string;
  name: string;
  operator: string;
  category: string;
  scope: string;
  phones: { value: string; type: string }[];
  emails: string[];
  portals: { name: string; url: string }[];
  notes: string;
}

// ─── Links ───────────────────────────────────────────────────────────────────

/** Hosts/paths that are a social "share this page" button, not a channel. */
const SHARE_ENDPOINTS: readonly RegExp[] = [
  /^(?:www\.)?(?:twitter|x)\.com\/intent\//i,
  /^(?:www\.)?linkedin\.com\/(?:sharing|shareArticle)/i,
  /^(?:www\.)?facebook\.com\/sharer/i,
  /^(?:api\.)?wa\.me\//i,
  /^(?:api\.)?whatsapp\.com\/send/i,
  /readspeaker\.com\//i,
];

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * The URL itself when it is safe to render as a link, otherwise null.
 * https only; a dotted, non-IP host; no credentials; no share endpoint.
 */
export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!/^https:\/\//i.test(raw) || /\s/.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || IPV4.test(host) || host.startsWith("[")) return null;
  if (raw.includes("&amp;")) return null; // an HTML-escaped scrape, not a working URL
  const hostAndPath = host + u.pathname;
  if (SHARE_ENDPOINTS.some((re) => re.test(hostAndPath))) return null;
  return raw;
}

const URL_IN_TEXT = /\b(?:https?|ftp|javascript|data|file):[^\s"'<>،)]+/gi;

/** Free text with every embedded link that fails safeHttpsUrl cut out. */
export function stripUnsafeUrls(text: string): string {
  return text
    .replace(URL_IN_TEXT, (m) => (safeHttpsUrl(m) ? m : ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function str(value: unknown): string {
  return typeof value === "string" ? stripUnsafeUrls(value) : "";
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter((s) => s.length > 0) : [];
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** Anything in a string that looks like markup. The files contain none today. */
const MARKUP = /<\s*\/?\s*[a-z!]/i;

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectStrings(v, out));
}

/**
 * Structural problems with one sector file; [] when it is usable.
 * Every card needs an id, an agency name and numbered steps with an action.
 */
export function validateSectorFile(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return ["not an object"];
  const s = raw as RawSector;
  const no = s.sector_no;
  if (typeof no !== "number" || !Number.isInteger(no) || no < 1) errors.push("sector_no is not a positive integer");
  if (typeof s.title !== "string" || !s.title.trim()) errors.push("title missing");
  if (!Array.isArray(s.cards) || s.cards.length === 0) return [...errors, "cards missing"];
  if (typeof s.total_cards_count === "number" && s.total_cards_count !== s.cards.length) {
    errors.push(`total_cards_count ${s.total_cards_count} ≠ ${s.cards.length} cards`);
  }
  const ids = new Set<string>();
  (s.cards as RawCard[]).forEach((c, i) => {
    const at = typeof c?.card_id === "string" && c.card_id ? c.card_id : `cards[${i}]`;
    if (typeof c?.card_id !== "string" || !c.card_id.trim()) errors.push(`${at}: card_id missing`);
    else if (ids.has(c.card_id)) errors.push(`${at}: duplicate card_id`);
    else ids.add(c.card_id);
    if (c?.sector_no !== no) errors.push(`${at}: sector_no ${String(c?.sector_no)} ≠ file ${String(no)}`);
    if (typeof c?.agency?.name !== "string" || !c.agency.name.trim()) errors.push(`${at}: agency.name missing`);
    if (!Array.isArray(c?.steps) || c.steps.length === 0) {
      errors.push(`${at}: steps missing`);
    } else {
      (c.steps as RawStep[]).forEach((st, j) => {
        if (typeof st?.n !== "number" || !Number.isInteger(st.n) || st.n < 1) errors.push(`${at}: steps[${j}].n is not a step number`);
        if (typeof st?.action !== "string" || !st.action.trim()) errors.push(`${at}: steps[${j}].action missing`);
      });
    }
  });
  const strings: string[] = [];
  collectStrings(raw, strings);
  if (strings.some((t) => MARKUP.test(t))) errors.push("a string contains markup");
  return errors;
}

// ─── Public projection ───────────────────────────────────────────────────────

/** The owner's coverage_map flags these two my.gov.sa records as tests. */
export const TEST_RECORD_AGENCY_IDS: readonly string[] = ["319731", "18143"];

export function isTestRecordCard(card: RawCard): boolean {
  if (card.agency?.is_test_record === true) return true;
  const id = card.agency?.my_gov_id;
  return typeof id === "string" && TEST_RECORD_AGENCY_IDS.includes(id);
}

function articleLabel(article: unknown, instrument: unknown): string {
  const inst = str(instrument);
  let art = str(article).replace(/[:：]\s*$/, "").trim();
  if (art && !art.startsWith("المادة")) art = `المادة ${art}`;
  return [art, inst].filter(Boolean).join(" — ");
}

function deadlineOf(raw: unknown, basis: Map<string, string>): MurshidDeadline | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as RawDeadline;
  const duration = str(d.duration);
  const fromEvent = str(d.from_event);
  if (!duration && !fromEvent) return null;
  const id = typeof d.legal_basis_id === "string" ? d.legal_basis_id : "";
  return { duration, fromEvent, basis: basis.get(id) ?? null };
}

/** `where` is either a link or a short description of the place. */
function whereOf(value: unknown): { where: string; whereUrl: string | null } {
  if (typeof value !== "string") return { where: "", whereUrl: null };
  const t = value.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) {
    const url = safeHttpsUrl(t);
    return { where: url ? t : "", whereUrl: url };
  }
  return { where: stripUnsafeUrls(t), whereUrl: null };
}

export function toPublicCard(card: RawCard): MurshidCard {
  const basisList = Array.isArray(card.legal_basis)
    ? (card.legal_basis as { id?: unknown; instrument?: unknown; article?: unknown }[])
        .filter((b) => b && typeof b.id === "string")
        .map((b) => ({ id: b.id as string, label: articleLabel(b.article, b.instrument) }))
        .filter((b) => b.label)
    : [];
  const basis = new Map(basisList.map((b) => [b.id, b.label]));

  const steps = (Array.isArray(card.steps) ? (card.steps as RawStep[]) : []).map((st) => ({
    n: typeof st.n === "number" ? st.n : 0,
    action: str(st.action),
    channel: str(st.channel),
    ...whereOf(st.where),
    deadline: deadlineOf(st.deadline, basis),
    source: str(st.source),
  }));
  const escalation = (Array.isArray(card.escalation) ? (card.escalation as RawEscalation[]) : []).map((e) => ({
    body: str(e.body),
    channel: str(e.channel),
    ...whereOf(e.where),
    deadline: deadlineOf(e.deadline, basis),
  }));

  const contacts = card.contacts ?? {};
  const values = (list: unknown) =>
    Array.isArray(list) ? list.map((x) => str((x as { value?: unknown })?.value)).filter(Boolean) : [];
  const portals = Array.isArray(contacts.portals)
    ? (contacts.portals as { name?: unknown; url?: unknown }[])
        .map((p) => ({ name: str(p?.name), url: safeHttpsUrl(p?.url) }))
        .filter((p): p is { name: string; url: string } => p.url !== null)
    : [];

  return {
    id: String(card.card_id),
    kind: card.card_kind === "specialized_problem_procedure" ? "problem" : "agency",
    sectorNo: Number(card.sector_no),
    agency: { name: str(card.agency?.name), website: safeHttpsUrl(card.agency?.website) },
    problemType: str(card.problem_type),
    stage: str(card.stage),
    whoCanFile: str(card.who_can_file),
    steps,
    escalation,
    finalForum: str(card.final_forum),
    documents: strList(card.documents_required),
    fees: str(card.fees),
    legalBasis: basisList,
    contacts: {
      phones: [...new Set(values(contacts.phones))],
      emails: [...new Set(values(contacts.emails).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))],
      portals: portals.filter((p, i) => portals.findIndex((q) => q.url === p.url) === i),
    },
    unverified: [...strList(card.unverified_items), ...strList(card.unverified_contacts)],
    najiz: strList(card.related_najiz_classification),
    lastVerified: str(card.last_verified),
    confidence: str(card.confidence),
  };
}

/** «القطاع 12: الإفلاس …» → «الإفلاس …» (the number is shown on its own). */
export function shortSectorTitle(title: string): string {
  return title.replace(/^\s*القطاع\s*[0-9٠-٩]+\s*[:：-]\s*/, "").trim();
}

/** The public sector, or null when the file fails validation. */
export function toPublicSector(raw: unknown): MurshidSector | null {
  if (validateSectorFile(raw).length > 0) return null;
  const s = raw as RawSector;
  const cards = (s.cards as RawCard[]).filter((c) => !isTestRecordCard(c)).map(toPublicCard);
  return {
    no: s.sector_no as number,
    code: str(s.sector_code),
    title: shortSectorTitle(str(s.title)),
    generatedAt: str(s.generated_at),
    problemCards: cards.filter((c) => c.kind === "problem").length,
    agencyCards: cards.filter((c) => c.kind === "agency").length,
    total: cards.length,
    cards,
  };
}

export function sectorSummary(s: MurshidSector): MurshidSectorSummary {
  return { no: s.no, code: s.code, title: s.title, problemCards: s.problemCards, agencyCards: s.agencyCards, total: s.total };
}

// ─── Search across sectors ───────────────────────────────────────────────────

export const SEARCH_RESULT_LIMIT = 50;
export const SEARCH_QUERY_MAX = 120;

export function searchEntries(sectors: readonly MurshidSector[]): MurshidSearchEntry[] {
  return sectors.flatMap((s) =>
    s.cards.map((c) => ({
      cardId: c.id,
      sectorNo: s.no,
      sectorTitle: s.title,
      agency: c.agency.name,
      problemType: c.problemType,
      kind: c.kind,
    })),
  );
}

const entryFields = (e: MurshidSearchEntry) => [e.agency, e.problemType, e.sectorTitle];

/** Cards whose agency, problem type or sector title match `query` (the page's search grammar). */
export function searchMurshid(entries: readonly MurshidSearchEntry[], query: string) {
  const q = query.slice(0, SEARCH_QUERY_MAX);
  const r = searchRows(entries, q, entryFields);
  return {
    total: r.matches.length,
    matches: r.matches.slice(0, SEARCH_RESULT_LIMIT),
    suggestions: r.suggestions,
    unmatchedTerms: r.unmatchedTerms.map((t) => t.label),
  };
}

// ─── National channels ───────────────────────────────────────────────────────

export function toPublicChannels(raw: unknown): MurshidChannel[] {
  const list = (raw as { channels?: unknown })?.channels;
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && typeof c === "object" && typeof c.channel_id === "string" && typeof c.name === "string")
    .map((c) => ({
      id: c.channel_id as string,
      name: str(c.name),
      operator: str(c.operator_agency),
      category: str(c.category),
      scope: str(c.scope),
      phones: Array.isArray(c.phones)
        ? (c.phones as { value?: unknown; type?: unknown }[])
            .map((p) => ({ value: str(p?.value), type: str(p?.type) }))
            .filter((p) => p.value)
        : [],
      emails: Array.isArray(c.emails)
        ? (c.emails as { value?: unknown }[]).map((e) => str(e?.value)).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        : [],
      portals: Array.isArray(c.portals)
        ? (c.portals as { name?: unknown; url?: unknown }[])
            .map((p) => ({ name: str(p?.name), url: safeHttpsUrl(p?.url) }))
            .filter((p): p is { name: string; url: string } => p.url !== null)
        : [],
      notes: str(c.notes),
    }));
}

// ─── Import-time slimming (controller ruling #7, batch 2026-11-08) ───────────
//
// The repository is public, so what is committed under src/data/murshid/ must
// already be what the routes may serve: scripts/murshid-import.mjs runs the
// owner's files through these two functions. Same field names as the owner's
// files (so a later package still diffs field by field), but ONLY the fields
// the routes serve — statute quotes, owner-library paths, source_url / mx_ok
// bookkeeping, my.gov.sa ids, test records and unsafe links never land in git.
// toPublicSector / toPublicChannels still run on the result when served (a
// second layer; both are idempotent on slim input).

function slimDeadline(raw: unknown): { duration: string; from_event: string; legal_basis_id: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as RawDeadline;
  return {
    duration: str(d.duration),
    from_event: str(d.from_event),
    legal_basis_id: typeof d.legal_basis_id === "string" ? d.legal_basis_id : "",
  };
}

function slimWhere(value: unknown): string {
  const { where, whereUrl } = whereOf(value);
  return whereUrl ?? where;
}

function slimCard(c: RawCard) {
  const contacts = c.contacts ?? {};
  const valueList = (list: unknown) =>
    Array.isArray(list)
      ? list.map((x) => ({ value: str((x as { value?: unknown })?.value) })).filter((x) => x.value)
      : [];
  return {
    card_id: String(c.card_id),
    card_kind: str(c.card_kind),
    sector_no: c.sector_no as number,
    agency: { name: str(c.agency?.name), website: safeHttpsUrl(c.agency?.website) },
    problem_type: str(c.problem_type),
    stage: str(c.stage),
    who_can_file: str(c.who_can_file),
    steps: (c.steps as RawStep[]).map((s) => ({
      n: s.n as number,
      action: str(s.action),
      channel: str(s.channel),
      where: slimWhere(s.where),
      deadline: slimDeadline(s.deadline),
      source: str(s.source),
    })),
    escalation: (Array.isArray(c.escalation) ? (c.escalation as RawEscalation[]) : []).map((e) => ({
      body: str(e.body),
      channel: str(e.channel),
      where: slimWhere(e.where),
      deadline: slimDeadline(e.deadline),
    })),
    final_forum: str(c.final_forum),
    documents_required: strList(c.documents_required),
    fees: str(c.fees),
    legal_basis: Array.isArray(c.legal_basis)
      ? (c.legal_basis as { id?: unknown; instrument?: unknown; article?: unknown }[])
          .filter((b) => b && typeof b.id === "string")
          .map((b) => ({ id: b.id as string, instrument: str(b.instrument), article: str(b.article) }))
      : [],
    contacts: {
      emails: valueList(contacts.emails),
      phones: valueList(contacts.phones),
      portals: Array.isArray(contacts.portals)
        ? (contacts.portals as { name?: unknown; url?: unknown }[])
            .map((p) => ({ name: str(p?.name), url: safeHttpsUrl(p?.url) }))
            .filter((p): p is { name: string; url: string } => p.url !== null)
        : [],
    },
    unverified_items: strList(c.unverified_items),
    unverified_contacts: strList(c.unverified_contacts),
    related_najiz_classification: strList(c.related_najiz_classification),
    last_verified: str(c.last_verified),
    confidence: str(c.confidence),
  };
}

/** One owner sector file → the committed slim file. Throws if the source is invalid. */
export function slimRawSector(raw: unknown) {
  const errors = validateSectorFile(raw);
  if (errors.length) throw new Error(`invalid sector file: ${errors.slice(0, 5).join("; ")}`);
  const s = raw as RawSector;
  const cards = (s.cards as RawCard[]).filter((c) => !isTestRecordCard(c)).map(slimCard);
  return {
    sector_no: s.sector_no as number,
    sector_code: str(s.sector_code),
    title: str(s.title),
    generated_at: str(s.generated_at),
    specialized_problem_cards_count: cards.filter((c) => c.card_kind === "specialized_problem_procedure").length,
    agency_specific_cards_count: cards.filter((c) => c.card_kind !== "specialized_problem_procedure").length,
    total_cards_count: cards.length,
    cards,
  };
}

/** unified_channels.json → the committed slim file. */
export function slimChannels(raw: unknown) {
  const list = (raw as { channels?: unknown })?.channels;
  if (!Array.isArray(list)) throw new Error("unified_channels: no channels list");
  const channels = list
    .filter((c) => c && typeof c === "object" && typeof c.channel_id === "string" && typeof c.name === "string")
    .map((c) => ({
      channel_id: c.channel_id as string,
      name: str(c.name),
      operator_agency: str(c.operator_agency),
      category: str(c.category),
      scope: str(c.scope),
      phones: Array.isArray(c.phones)
        ? (c.phones as { value?: unknown; type?: unknown }[]).map((p) => ({ value: str(p?.value), type: str(p?.type) })).filter((p) => p.value)
        : [],
      emails: Array.isArray(c.emails)
        ? (c.emails as { value?: unknown }[]).map((e) => ({ value: str(e?.value) })).filter((e) => e.value)
        : [],
      portals: Array.isArray(c.portals)
        ? (c.portals as { name?: unknown; url?: unknown }[])
            .map((p) => ({ name: str(p?.name), url: safeHttpsUrl(p?.url) }))
            .filter((p): p is { name: string; url: string } => p.url !== null)
        : [],
      notes: str(c.notes),
    }));
  return { generated_at: str((raw as { generated_at?: unknown }).generated_at), total_channels: channels.length, channels };
}

/** Every key the committed files may contain (a unit test walks them). */
export const COMMITTED_KEYS: ReadonlySet<string> = new Set([
  // sector file
  "sector_no", "sector_code", "title", "generated_at", "specialized_problem_cards_count",
  "agency_specific_cards_count", "total_cards_count", "cards",
  // card
  "card_id", "card_kind", "agency", "name", "website", "problem_type", "stage", "who_can_file",
  "steps", "n", "action", "channel", "where", "deadline", "duration", "from_event", "legal_basis_id",
  "source", "escalation", "body", "final_forum", "documents_required", "fees", "legal_basis", "id",
  "instrument", "article", "contacts", "emails", "phones", "portals", "value", "url",
  "unverified_items", "unverified_contacts", "related_najiz_classification", "last_verified", "confidence",
  // channels file
  "total_channels", "channels", "channel_id", "operator_agency", "category", "scope", "type", "notes",
]);
