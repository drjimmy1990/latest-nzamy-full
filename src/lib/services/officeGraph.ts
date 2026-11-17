/**
 * officeGraph.ts — «خريطة قضايا المكتب» (N3.11, rebuilt for N07-44..52): the
 * caller's cases, clients, opponents, contracts, consultations, upcoming
 * hearings, open tasks and fees as one read-only graph.
 *
 * Input is exactly what GET /api/v1/lawyer/office-graph read through the
 * caller's own RLS client. Nothing is inferred beyond what the rows say:
 *   * a case links to its client card (`lawyer_client_id`) or, without one, to
 *     the client name it records;
 *   * a case links to the opponents its file records (caseParties.ts);
 *   * a party on two or more cases is ONE node — the shared-party edges are
 *     simply its edges;
 *   * N07-49 — one client is one node. Before a client node is created the
 *     party is matched, in this order, to: the card the case names; the card
 *     carrying the platform account that filed the case (`client_user_id` =
 *     `requester_user_id`); the ONE card whose name matches after spelling
 *     normalisation (two cards with the same name: no merge — it would be a
 *     guess); the platform account's own node; the one unlinked node with
 *     that name. Only the client side merges — an opponent is never folded
 *     into a client card;
 *   * contracts, consultations, hearings, tasks and fees are drawn only when
 *     they hang on a case or a client already on the map (the route passes
 *     only hearings/tasks/invoices of the cases it drew, so a case the caller
 *     cannot read never leaks through its satellites);
 *   * «تشابه اسم» — the same name, after spelling normalisation, recorded as a
 *     client on one case and as the other side on another (or on the same
 *     one). It is a hint to check, the same rule the conflict-check screen
 *     applies to names (exact match, no fuzzy scoring), never a finding.
 *
 * No identity numbers, phones, registers or account ids are read into the
 * result. Pure — caseParties.ts only — so officeGraph.test.ts runs under
 * node --test.
 */
import { extractCaseParties, normalizePartyName } from "./caseParties.ts";

export interface OfficeCaseInput {
  id: string;
  title: string;
  status: string;
  lawyerClientId: string | null;
  /** The platform account that filed the case — never the caller himself (the route drops that). */
  requesterUserId?: string | null;
  requester: { name?: unknown } | null;
  metadata: Record<string, unknown> | null;
}

export interface OfficeClientInput {
  id: string;
  name: string;
  clientType: string;
  /** The platform account the card is linked to, if any. */
  clientUserId?: string | null;
  /** The agreed fee on the card — null when the caller may not see it (clientFeeVisibility.ts). */
  feeTotalSar?: number | null;
  feePaidSar?: number | null;
}

export interface OfficeContractInput {
  id: string;
  title: string;
  status: string;
  contractType: string;
  lawyerClientId: string | null;
  clientUserId: string | null;
  requestId: string | null;
  counterpartyName: string | null;
  /** null when the caller may not see it. */
  valueSar: number | null;
  endsOn: string | null;
}

export interface OfficeConsultationInput {
  id: string;
  status: string;
  mode: string | null;
  specialty: string | null;
  scheduledAt: string | null;
  lawyerClientId: string | null;
  requesterUserId: string | null;
  convertedCaseId: string | null;
  /** null when the caller may not see it. */
  feeSar: number | null;
  feePaid: boolean;
}

export interface OfficeHearingInput {
  id: string;
  caseId: string;
  title: string;
  kind: string;
  /** YYYY-MM-DD, a Riyadh wall-clock date. */
  date: string;
  time: string | null;
  courtName: string;
}

export interface OfficeTaskInput {
  id: string;
  caseId: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

/** One invoice (a `payments` row). `paid` is what was collected on it. */
export interface OfficeInvoiceInput {
  id: string;
  caseId: string | null;
  lawyerClientId: string | null;
  amount: number;
  paid: number;
}

export interface OfficeExtras {
  contracts?: OfficeContractInput[];
  consultations?: OfficeConsultationInput[];
  hearings?: OfficeHearingInput[];
  tasks?: OfficeTaskInput[];
  invoices?: OfficeInvoiceInput[];
}

export type OfficeNodeKind = "case" | "client" | "opponent" | "contract" | "consultation" | "hearing" | "task" | "fee";

/** Every kind, in the order the filters and the legend list them. */
export const OFFICE_NODE_KINDS: readonly OfficeNodeKind[] = ["case", "client", "opponent", "contract", "consultation", "hearing", "task", "fee"];

/** One line of the side panel: already Arabic, never an id number, phone or register. */
export interface OfficeFact {
  label: string;
  value: string;
}

/** Where «فتح الملف» goes; the view maps it to /dashboard/<lawyer|firm>/… */
export type OfficeLinkKind = "case" | "client" | "contract" | "consultation" | "hearings" | "tasks" | "finance";

export interface OfficeNode {
  id: string;
  kind: OfficeNodeKind;
  label: string;
  /** For a case: its id; for a client card: its id; for a contract / consultation: its id. */
  refId?: string;
  /** Number of cases the node is linked to as a party (0 for a client card with none). */
  caseCount: number;
  /** True when the node's name also appears on the other side somewhere. */
  nameClash?: boolean;
  /** Key fields for the side panel. */
  facts?: OfficeFact[];
  link?: { kind: OfficeLinkKind; id?: string };
}

export type OfficeEdgeRelation = "client" | "opponent" | "same_name" | "contract" | "consultation" | "hearing" | "task" | "fee";

export interface OfficeEdge {
  from: string;
  to: string;
  relation: OfficeEdgeRelation;
}

export interface NameClash {
  name: string;
  /** Case ids where the name is the client. */
  clientIn: string[];
  /** Case ids where the name is the other side. */
  opponentIn: string[];
  /** The client card(s) carrying the name. */
  clientCardIds: string[];
}

export interface OfficeGraph {
  nodes: OfficeNode[];
  edges: OfficeEdge[];
  clashes: NameClash[];
  /** Rows read but not drawn because they hang on nothing on the map. */
  unlinked?: { contracts: number; consultations: number };
}

/**
 * Which service_requests rows are CASES — the same denylist as the lawyer
 * cases page (dashboard/lawyer/cases/page.tsx, isLawyerCaseRow): tasks,
 * client stubs, invoices and hearings share the table.
 */
export function isCaseRow(type: string, metadata: Record<string, unknown> | null): boolean {
  if (type !== "service") return false;
  const m = metadata ?? {};
  if (m.task === true || m.client === true || m.invoice === true || m.hearing === true) return false;
  if ("caseName" in m && "time" in m) return false;
  return true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Receivers a lawyer's or a firm's own case carries. */
export const OFFICE_CASE_RECEIVERS = ["lawyer", "firm"] as const;

/**
 * The PostgREST `or=` filter of the rows that are the caller's OWN work: he
 * filed it, it is assigned to him, or it belongs to one of his firms. RLS
 * alone is not that set: "service_requests_select_policy" also lets a
 * verified lawyer read every unassigned pending marketplace request, which
 * must not be drawn as one of his cases (and its client as a name clash).
 * Ids that are not uuids are dropped, so nothing else reaches the filter.
 */
export function officeCaseOrFilter(uid: string, firmIds: string[]): string {
  const ids = [...new Set(firmIds.filter((id) => UUID_RE.test(id)))];
  const arms = [`requester_user_id.eq.${uid}`, `assigned_to.eq.${uid}`];
  if (ids.length > 0) arms.push(`firm_id.in.(${ids.join(",")})`);
  return arms.join(",");
}

/**
 * The same scope for a table whose "mine" column is not `requester_user_id`
 * (contracts: owner_user_id; consultations: lawyer_user_id): the caller's own
 * rows or his firms'. RLS on those tables also returns rows where the caller
 * is the CLIENT, which are not his office's work.
 */
export function officeOwnRowsFilter(column: string, uid: string, firmIds: string[]): string {
  const ids = [...new Set(firmIds.filter((id) => UUID_RE.test(id)))];
  const arms = [`${column}.eq.${uid}`];
  if (ids.length > 0) arms.push(`firm_id.in.(${ids.join(",")})`);
  return arms.join(",");
}

// ── Arabic labels (the vocabularies of the tables read) ────────────────────

const CASE_STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  in_review: "قيد المراجعة",
  pending_payment: "بانتظار الدفع",
  pending_assignment: "بانتظار الإسناد",
  assigned: "نشطة",
  completed: "منتهية",
  cancelled: "ملغاة",
};
const CLIENT_TYPE_AR: Record<string, string> = { individual: "فرد", company: "شركة", government: "جهة حكومية", ngo: "جهة غير ربحية" };
const CONTRACT_STATUS_AR: Record<string, string> = {
  draft: "مسودة", under_review: "قيد المراجعة", pending_signature: "بانتظار التوقيع",
  active: "ساري", expired: "منتهٍ", terminated: "مُنهى", cancelled: "ملغى",
};
const CONTRACT_TYPE_AR: Record<string, string> = {
  service_agreement: "اتفاقية خدمات", fee_agreement: "عقد أتعاب", power_of_attorney: "وكالة قانونية",
  nda: "اتفاقية سرية", employment: "عقد عمل", lease: "عقد إيجار", supply: "عقد توريد", partnership: "عقد شراكة", other: "آخر",
};
const CONSULTATION_STATUS_AR: Record<string, string> = {
  requested: "بانتظار الجدولة", scheduled: "مجدولة", completed: "مكتملة", cancelled: "ملغاة", no_show: "لم يحضر",
};
const CONSULTATION_MODE_AR: Record<string, string> = { ai: "ذكاء اصطناعي", video: "مرئية", voice: "صوتية", text: "نصية", "in-person": "حضورية" };
const HEARING_KIND_AR: Record<string, string> = {
  judicial: "جلسة قضائية", appointment: "موعد", deadline: "موعد نظامي", gov_review: "مراجعة جهة حكومية", client_meet: "لقاء موكّل", internal: "اجتماع داخلي",
};
const TASK_STATUS_AR: Record<string, string> = { todo: "لم تبدأ", in_progress: "قيد التنفيذ", done: "منجزة", archived: "مؤرشفة" };
const PRIORITY_AR: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "عالية", urgent: "عاجلة" };

const ARABIC_INDIC = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const ar = (v: number | string) => String(v).replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
const sar = (v: number) => `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(Math.max(0, v))} ر.س`;
/** YYYY-MM-DD (or an ISO instant's date part) in Arabic-Indic digits, day/month/year. */
function dayAr(iso: string | null | undefined): string | null {
  const m = typeof iso === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? ar(`${m[3]}/${m[2]}/${m[1]}`) : null;
}
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Hearings drawn per case (the soonest), and open tasks (soonest due first). */
export const HEARINGS_PER_CASE = 3;
export const TASKS_PER_CASE = 5;

export function buildOfficeGraph(cases: OfficeCaseInput[], clients: OfficeClientInput[], extras: OfficeExtras = {}): OfficeGraph {
  const nodes = new Map<string, OfficeNode>();
  const edges: OfficeEdge[] = [];
  const edgeKeys = new Set<string>();
  // normalised name → where it appears
  const byName = new Map<string, { label: string; clientIn: Set<string>; opponentIn: Set<string>; cards: Set<string>; nodeIds: Set<string> }>();

  const nameEntry = (label: string) => {
    const norm = normalizePartyName(label);
    let e = byName.get(norm);
    if (!e) {
      e = { label, clientIn: new Set(), opponentIn: new Set(), cards: new Set(), nodeIds: new Set() };
      byName.set(norm, e);
    }
    return e;
  };
  const addEdge = (from: string, to: string, relation: OfficeEdgeRelation) => {
    const k = `${from}|${to}|${relation}`;
    if (edgeKeys.has(k)) return;
    edgeKeys.add(k);
    edges.push({ from, to, relation });
  };

  // ── client cards ────────────────────────────────────────────────────────
  const cardByAccount = new Map<string, string>(); // account → node id
  const cardsByName = new Map<string, string[]>(); // norm → node ids
  const cardAccountLinked = new Set<string>();
  const cardInput = new Map<string, OfficeClientInput>();
  for (const c of clients) {
    const label = c.name.trim();
    if (!label) continue;
    const id = `client:${c.id}`;
    nodes.set(id, { id, kind: "client", label, refId: c.id, caseCount: 0, link: { kind: "client", id: c.id } });
    cardInput.set(id, c);
    const e = nameEntry(label);
    e.cards.add(c.id);
    e.nodeIds.add(id);
    const norm = normalizePartyName(label);
    cardsByName.set(norm, [...(cardsByName.get(norm) ?? []), id]);
    if (c.clientUserId) {
      cardByAccount.set(c.clientUserId, id);
      cardAccountLinked.add(id);
    }
  }

  // ── client resolution (N07-49) ──────────────────────────────────────────
  // Platform accounts with no card: one node per account, numbered in input
  // order (the account id itself never leaves the server).
  const accountNode = new Map<string, string>();
  const looseByName = new Map<string, Set<string>>(); // norm → non-card client node ids
  const viaAccount = new Set<string>(); // card nodes a platform case was merged into
  const noteLoose = (norm: string, id: string) => {
    if (!looseByName.has(norm)) looseByName.set(norm, new Set());
    looseByName.get(norm)!.add(id);
  };
  const ensureAccountNode = (account: string, label: string): string => {
    const known = accountNode.get(account);
    if (known) return known;
    const id = `client:acct:${accountNode.size + 1}`;
    accountNode.set(account, id);
    nodes.set(id, { id, kind: "client", label, caseCount: 0 });
    noteLoose(normalizePartyName(label), id);
    return id;
  };
  const uniqueCardByName = (norm: string): string | null => {
    const ids = cardsByName.get(norm);
    return ids && ids.length === 1 ? ids[0] : null;
  };

  // Pass 1: platform accounts with no card get their node first, so a later
  // name-only mention of the same person merges into it whatever the order.
  const caseParties = cases.map((k) => ({
    k,
    parties: extractCaseParties({ requester: k.requester, metadata: k.metadata, lawyerClientId: k.lawyerClientId }),
  }));
  const isRequesterParty = (k: OfficeCaseInput, key: string) => key === "client:requester" || (!!k.lawyerClientId && key === `client:${k.lawyerClientId}`);
  for (const { k, parties } of caseParties) {
    if (!k.requesterUserId || cardByAccount.has(k.requesterUserId)) continue;
    if (k.lawyerClientId && nodes.has(`client:${k.lawyerClientId}`)) continue;
    const p = parties.find((x) => x.role === "client" && isRequesterParty(k, x.key));
    if (!p) continue;
    if (uniqueCardByName(normalizePartyName(p.name))) continue;
    ensureAccountNode(k.requesterUserId, p.name);
  }

  const resolveClient = (k: OfficeCaseInput, key: string, name: string): string => {
    const norm = normalizePartyName(name);
    const requesterSide = isRequesterParty(k, key);
    if (requesterSide && k.lawyerClientId && nodes.has(`client:${k.lawyerClientId}`)) return `client:${k.lawyerClientId}`;
    if (requesterSide && k.requesterUserId) {
      const card = cardByAccount.get(k.requesterUserId);
      if (card) {
        viaAccount.add(card);
        return card;
      }
    }
    const card = uniqueCardByName(norm);
    if (card) return card;
    if (requesterSide && k.requesterUserId) return ensureAccountNode(k.requesterUserId, name);
    const loose = looseByName.get(norm);
    if (loose && loose.size === 1) return [...loose][0];
    const id = `client:name:${norm}`;
    if (!nodes.has(id)) {
      nodes.set(id, { id, kind: "client", label: name, caseCount: 0 });
      noteLoose(norm, id);
    }
    return id;
  };

  // ── cases and their parties ─────────────────────────────────────────────
  const caseNode = new Map<string, OfficeNode>();
  for (const { k, parties } of caseParties) {
    const caseNodeId = `case:${k.id}`;
    const node: OfficeNode = { id: caseNodeId, kind: "case", label: k.title.trim() || "قضية بلا عنوان", refId: k.id, caseCount: 0, link: { kind: "case", id: k.id } };
    nodes.set(caseNodeId, node);
    caseNode.set(k.id, node);
    for (const p of parties) {
      let partyId: string;
      if (p.role === "client") {
        partyId = resolveClient(k, p.key, p.name);
      } else {
        partyId = `opponent:${normalizePartyName(p.name)}`;
        if (!nodes.has(partyId)) nodes.set(partyId, { id: partyId, kind: "opponent", label: p.name, caseCount: 0 });
      }
      addEdge(caseNodeId, partyId, p.role);
      const e = nameEntry(p.name);
      e.nodeIds.add(partyId);
      (p.role === "client" ? e.clientIn : e.opponentIn).add(k.id);
    }
  }

  const partyCases = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.relation !== "client" && e.relation !== "opponent") continue;
    if (!partyCases.has(e.to)) partyCases.set(e.to, new Set());
    partyCases.get(e.to)!.add(e.from);
  }
  for (const [id, set] of partyCases) {
    const n = nodes.get(id);
    if (n) n.caseCount = set.size;
  }

  // The client a contract / consultation names, if it is on the map.
  const clientNodeFor = (lawyerClientId: string | null, account: string | null): string | null => {
    if (lawyerClientId && nodes.has(`client:${lawyerClientId}`)) return `client:${lawyerClientId}`;
    if (account) return cardByAccount.get(account) ?? accountNode.get(account) ?? null;
    return null;
  };

  // ── contracts ───────────────────────────────────────────────────────────
  let unlinkedContracts = 0;
  for (const c of extras.contracts ?? []) {
    const client = clientNodeFor(c.lawyerClientId, c.clientUserId);
    const kase = c.requestId && caseNode.has(c.requestId) ? `case:${c.requestId}` : null;
    if (!client && !kase) {
      unlinkedContracts++;
      continue;
    }
    const id = `contract:${c.id}`;
    const facts: OfficeFact[] = [
      { label: "النوع", value: CONTRACT_TYPE_AR[c.contractType] ?? "عقد" },
      { label: "الحالة", value: CONTRACT_STATUS_AR[c.status] ?? c.status },
    ];
    if (text(c.counterpartyName)) facts.push({ label: "الطرف الآخر", value: text(c.counterpartyName) });
    if (c.valueSar !== null && Number.isFinite(c.valueSar)) facts.push({ label: "القيمة", value: sar(c.valueSar) });
    const ends = dayAr(c.endsOn);
    if (ends) facts.push({ label: "ينتهي في", value: ends });
    nodes.set(id, { id, kind: "contract", label: c.title.trim() || CONTRACT_TYPE_AR[c.contractType] || "عقد", refId: c.id, caseCount: 0, facts, link: { kind: "contract", id: c.id } });
    if (client) addEdge(client, id, "contract");
    if (kase) addEdge(kase, id, "contract");
  }

  // ── consultations ───────────────────────────────────────────────────────
  let unlinkedConsultations = 0;
  for (const c of extras.consultations ?? []) {
    const client = clientNodeFor(c.lawyerClientId, c.requesterUserId);
    const kase = c.convertedCaseId && caseNode.has(c.convertedCaseId) ? `case:${c.convertedCaseId}` : null;
    if (!client && !kase) {
      unlinkedConsultations++;
      continue;
    }
    const id = `consultation:${c.id}`;
    const when = dayAr(c.scheduledAt);
    const facts: OfficeFact[] = [{ label: "الحالة", value: CONSULTATION_STATUS_AR[c.status] ?? c.status }];
    if (c.mode) facts.push({ label: "الطريقة", value: CONSULTATION_MODE_AR[c.mode] ?? c.mode });
    if (when) facts.push({ label: "الموعد", value: when });
    if (c.feeSar !== null && Number.isFinite(c.feeSar)) facts.push({ label: "الرسوم", value: `${sar(c.feeSar)} — ${c.feePaid ? "مدفوعة" : "غير مدفوعة"}` });
    if (kase) facts.push({ label: "تحوّلت إلى", value: "قضية" });
    const label = `استشارة${text(c.specialty) ? ` — ${text(c.specialty)}` : ""}`;
    nodes.set(id, { id, kind: "consultation", label, refId: c.id, caseCount: 0, facts, link: { kind: "consultation", id: c.id } });
    if (client) addEdge(client, id, "consultation");
    if (kase) addEdge(kase, id, "consultation");
  }

  // ── upcoming hearings (the soonest few per case) ────────────────────────
  const hearingsByCase = new Map<string, OfficeHearingInput[]>();
  for (const h of extras.hearings ?? []) {
    if (!caseNode.has(h.caseId)) continue;
    hearingsByCase.set(h.caseId, [...(hearingsByCase.get(h.caseId) ?? []), h]);
  }
  for (const [caseId, list] of hearingsByCase) {
    list.sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")) || a.id.localeCompare(b.id));
    const kase = caseNode.get(caseId)!;
    const next = list[0];
    kase.facts = [...(kase.facts ?? []), { label: "الجلسة القادمة", value: [dayAr(next.date), next.time ? ar(next.time.slice(0, 5)) : ""].filter(Boolean).join(" — ") }];
    if (list.length > 1) kase.facts.push({ label: "مواعيد قادمة", value: ar(list.length) });
    for (const h of list.slice(0, HEARINGS_PER_CASE)) {
      const id = `hearing:${h.id}`;
      const facts: OfficeFact[] = [
        { label: "النوع", value: HEARING_KIND_AR[h.kind] ?? "موعد" },
        { label: "التاريخ", value: dayAr(h.date) ?? h.date },
      ];
      if (h.time) facts.push({ label: "الوقت", value: ar(h.time.slice(0, 5)) });
      if (text(h.courtName)) facts.push({ label: "المحكمة", value: text(h.courtName) });
      nodes.set(id, { id, kind: "hearing", label: h.title.trim() || HEARING_KIND_AR[h.kind] || "موعد", refId: h.id, caseCount: 0, facts, link: { kind: "hearings" } });
      addEdge(`case:${caseId}`, id, "hearing");
    }
  }

  // ── open tasks (soonest due first) ──────────────────────────────────────
  const tasksByCase = new Map<string, OfficeTaskInput[]>();
  for (const t of extras.tasks ?? []) {
    if (!caseNode.has(t.caseId)) continue;
    tasksByCase.set(t.caseId, [...(tasksByCase.get(t.caseId) ?? []), t]);
  }
  for (const [caseId, list] of tasksByCase) {
    list.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.id.localeCompare(b.id));
    const kase = caseNode.get(caseId)!;
    kase.facts = [...(kase.facts ?? []), { label: "مهام مفتوحة", value: ar(list.length) }];
    for (const t of list.slice(0, TASKS_PER_CASE)) {
      const id = `task:${t.id}`;
      const facts: OfficeFact[] = [
        { label: "الحالة", value: TASK_STATUS_AR[t.status] ?? t.status },
        { label: "الأولوية", value: PRIORITY_AR[t.priority] ?? t.priority },
      ];
      const due = dayAr(t.dueDate);
      if (due) facts.push({ label: "الاستحقاق", value: due });
      nodes.set(id, { id, kind: "task", label: t.title.trim() || "مهمة", refId: t.id, caseCount: 0, facts, link: { kind: "tasks" } });
      addEdge(`case:${caseId}`, id, "task");
    }
  }

  // ── fees: one node per case (or per client, for an invoice with no case) ─
  const feeGroups = new Map<string, { anchor: string; amount: number; paid: number; count: number }>();
  for (const inv of extras.invoices ?? []) {
    let key: string | null = null;
    let anchor: string | null = null;
    if (inv.caseId && caseNode.has(inv.caseId)) {
      key = `fee:case:${inv.caseId}`;
      anchor = `case:${inv.caseId}`;
    } else if (!inv.caseId && inv.lawyerClientId && nodes.has(`client:${inv.lawyerClientId}`)) {
      key = `fee:client:${inv.lawyerClientId}`;
      anchor = `client:${inv.lawyerClientId}`;
    }
    if (!key || !anchor) continue;
    const g = feeGroups.get(key) ?? { anchor, amount: 0, paid: 0, count: 0 };
    const amount = Number.isFinite(inv.amount) ? Math.max(0, inv.amount) : 0;
    const paid = Number.isFinite(inv.paid) ? Math.min(Math.max(0, inv.paid), amount) : 0;
    g.amount += amount;
    g.paid += paid;
    g.count += 1;
    feeGroups.set(key, g);
  }
  for (const [id, g] of feeGroups) {
    const facts: OfficeFact[] = [
      { label: "الفواتير", value: ar(g.count) },
      { label: "المفوتَر", value: sar(g.amount) },
      { label: "المحصّل", value: sar(g.paid) },
      { label: "المتبقي", value: sar(g.amount - g.paid) },
    ];
    nodes.set(id, { id, kind: "fee", label: `أتعاب: ${sar(g.amount)}`, caseCount: 0, facts, link: { kind: "finance" } });
    addEdge(g.anchor, id, "fee");
  }

  // ── facts of cases and clients ──────────────────────────────────────────
  for (const k of cases) {
    const n = caseNode.get(k.id)!;
    const head: OfficeFact[] = [{ label: "الحالة", value: CASE_STATUS_AR[k.status] ?? k.status }];
    const court = text(k.metadata?.court);
    if (court) head.push({ label: "المحكمة", value: court });
    n.facts = [...head, ...(n.facts ?? [])];
  }
  for (const n of nodes.values()) {
    if (n.kind !== "client" && n.kind !== "opponent") continue;
    const facts: OfficeFact[] = [];
    const card = cardInput.get(n.id);
    if (card) {
      facts.push({ label: "النوع", value: CLIENT_TYPE_AR[card.clientType] ?? "موكّل" });
      const sources = ["بطاقة موكّل"];
      if (cardAccountLinked.has(n.id) || viaAccount.has(n.id)) sources.push("حساب على المنصة");
      facts.push({ label: "المصدر", value: sources.join(" + ") });
      if (typeof card.feeTotalSar === "number") facts.push({ label: "الأتعاب المتفق عليها", value: sar(card.feeTotalSar) });
      if (typeof card.feePaidSar === "number") facts.push({ label: "المدفوع منها", value: sar(card.feePaidSar) });
    } else if (n.kind === "client") {
      facts.push({ label: "المصدر", value: n.id.startsWith("client:acct:") ? "حساب على المنصة (بلا بطاقة موكّل)" : "اسم مسجّل في ملف القضية (بلا بطاقة)" });
    }
    if (n.caseCount > 0) facts.push({ label: "القضايا", value: ar(n.caseCount) });
    n.facts = facts;
  }

  const clashes: NameClash[] = [];
  for (const e of byName.values()) {
    const isClash = e.opponentIn.size > 0 && (e.clientIn.size > 0 || e.cards.size > 0);
    if (!isClash) continue;
    clashes.push({
      name: e.label,
      clientIn: [...e.clientIn].sort(),
      opponentIn: [...e.opponentIn].sort(),
      clientCardIds: [...e.cards].sort(),
    });
    const ids = [...e.nodeIds].sort();
    for (const id of ids) {
      const n = nodes.get(id);
      if (n) n.nameClash = true;
    }
    // The dashed «تشابه اسم» line joins the clashing nodes pairwise in a chain.
    for (let i = 1; i < ids.length; i++) addEdge(ids[i - 1], ids[i], "same_name");
  }
  clashes.sort((a, b) => a.name.localeCompare(b.name, "ar"));

  return { nodes: [...nodes.values()], edges, clashes, unlinked: { contracts: unlinkedContracts, consultations: unlinkedConsultations } };
}
