/**
 * _graph-import.ts — «استيراد من القضية» (N3.5): real rows of the open case
 * turned into canvas cards that POINT at their source.
 *
 * Every candidate comes from a row the case page itself reads through RLS —
 * GET /api/v1/lawyer/hearings?caseId, /api/v1/lawyer/case-stages/[caseId],
 * and the attachments / parties of GET /api/v1/service-requests/[id]. Nothing
 * is summarised, scored or invented: a card's text is the row's own fields.
 * The card keeps {ref_type, ref_id, label} in case_graphs.nodes so the board
 * knows which row it shows and never imports the same row twice.
 *
 * Input types are declared structurally here (not imported from the services)
 * so this file stays free of "use client" modules and runs under node --test.
 */
import type { GraphNode, NodeRef, NodeType } from "./_graph-model";

// Same values as NODE_W / NODE_H in ./_graph-model (not imported: that module
// loads the icon library, and this one must run under node --test).
const NODE_W = 220;
const NODE_H = 120;

export interface ImportCandidate {
  ref: NodeRef;
  type: NodeType;
  title: string;
  desc: string;
}

export interface HearingLike {
  id: string;
  title: string;
  date: string;
  time?: string | null;
  location?: string;
  status: string;
}
export interface StageLike {
  id: string;
  degree: string;
  courtName?: string;
  courtCaseNo?: string;
  openedOn: string | null;
  closedOn: string | null;
  outcome: string | null;
}
export interface DocumentLike {
  id: string | number;
  name: string;
  created_at?: string;
}
export interface PartyLike {
  key: string;
  name: string;
  role: "client" | "opponent";
}

const join = (parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim()).join(" · ");

export function hearingCandidates(rows: HearingLike[]): ImportCandidate[] {
  return rows.map((h) => {
    const title = h.title?.trim() || "جلسة";
    return {
      ref: { ref_type: "hearing", ref_id: String(h.id), label: title },
      type: "event",
      title,
      desc: join([h.date, h.time ?? null, h.location ?? null]),
    };
  });
}

export function stageCandidates(rows: StageLike[]): ImportCandidate[] {
  return rows.map((s) => {
    const title = `درجة التقاضي: ${s.degree}`;
    return {
      ref: { ref_type: "stage", ref_id: String(s.id), label: title },
      type: "event",
      title,
      desc: join([
        s.courtName ?? null,
        s.courtCaseNo ? `رقم القضية ${s.courtCaseNo}` : null,
        s.openedOn ? `من ${s.openedOn}` : null,
        s.closedOn ? `إلى ${s.closedOn}` : null,
        s.outcome ?? null,
      ]),
    };
  });
}

export function documentCandidates(rows: DocumentLike[]): ImportCandidate[] {
  return rows.map((d) => {
    const title = d.name?.trim() || "مستند";
    return {
      ref: { ref_type: "document", ref_id: String(d.id), label: title },
      type: "doc",
      title,
      desc: d.created_at ? `أُرفق ${String(d.created_at).slice(0, 10)}` : "",
    };
  });
}

export function partyCandidates(rows: PartyLike[]): ImportCandidate[] {
  return rows.map((p) => ({
    ref: { ref_type: "party", ref_id: p.key, label: p.name },
    type: "person",
    title: p.name,
    desc: p.role === "client" ? "الموكّل" : "الطرف الآخر",
  }));
}

export function refKey(ref: NodeRef): string {
  return `${ref.ref_type}:${ref.ref_id}`;
}

export function existingRefKeys(nodes: GraphNode[]): Set<string> {
  const keys = new Set<string>();
  for (const n of nodes) if (n.ref) keys.add(refKey(n.ref));
  return keys;
}

/** New cards on a 4-column grid under everything already on the board. */
export function candidatesToNodes(
  candidates: ImportCandidate[],
  existing: GraphNode[],
  newId: () => string,
): GraphNode[] {
  const have = existingRefKeys(existing);
  const fresh = candidates.filter((c) => !have.has(refKey(c.ref)));
  let bottom = 40;
  let left = 40;
  if (existing.length > 0) {
    bottom = Math.max(...existing.map((n) => n.pos.y + (n.h ?? NODE_H))) + 80;
    left = Math.min(...existing.map((n) => n.pos.x));
  }
  const COLS = 4;
  return fresh.map((c, i) => ({
    id: newId(),
    type: c.type,
    title: c.title,
    desc: c.desc,
    pos: { x: Math.max(0, left) + (i % COLS) * (NODE_W + 40), y: bottom + Math.floor(i / COLS) * (NODE_H + 40) },
    author: { name: "انت", role: "المحامي", color: "bg-blue-600" },
    meta: "مستورد من ملف القضية",
    ref: c.ref,
  }));
}
