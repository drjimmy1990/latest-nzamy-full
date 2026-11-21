/**
 * hearingsTable.ts — N13 (batch l12; owner RAW [11]): «جدول الجلسات والمواعيد»
 * leaves the platform (Word / PDF / print, on the lawyer's or the firm's own
 * letterhead) as ONE table of six columns:
 *     التاريخ · الوقت · المحكمة · رقم القضية · الموكّل · الدائرة
 * The client's name is printed: the owner asked for it on the paper, which
 * stays with the lawyer (the .ics calendar file has its own rule).
 *
 * Where each column comes from — only what is stored, «—» where nothing is:
 *   التاريخ / الوقت  the hearing's own day and hour (Arabic digits, Riyadh);
 *   المحكمة          the linked case's court classification (courtClassOf of
 *                    metadata.court / metadata.courtClass); without one, the
 *                    hearing's own location (never a client meeting's place);
 *   رقم القضية       the case's number on the platform (orderReference) — the
 *                    same «رقم القضية» the case screens show. The platform
 *                    stores no court (Najiz) case number today;
 *   الموكّل          the client name stored on the case (requester.name);
 *   الدائرة          the court the lawyer picked when it is a named circuit or
 *                    court of the Ministry's directory (not one of the 14
 *                    classifications).
 *
 * Pure, relative imports only: `node --test` loads it.
 */
import type { DocBlock } from "../docx/ooxml.ts";
import { courtClassOf } from "../../app/dashboard/lawyer/_components/courtTypes.ts";
import { orderReference } from "../services/orderReference.ts";

export const HEARINGS_TABLE_TITLE = "جدول الجلسات والمواعيد";
export const HEARINGS_TABLE_HEADER = ["التاريخ", "الوقت", "المحكمة", "رقم القضية", "الموكّل", "الدائرة"] as const;
const DASH = "—";

/** What a hearing row carries about its linked case (null fields = not stored). */
export interface HearingCaseInfo {
  reference: string | null;
  court: string | null;
  circuit: string | null;
  client: string | null;
}

/** A service_requests row (id, requester, metadata) → the case columns. */
export function caseInfoFromCase(row: { id?: unknown; requester?: unknown; metadata?: unknown } | null | undefined): HearingCaseInfo | null {
  if (!row || typeof row.id !== "string") return null;
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
  const req = (row.requester && typeof row.requester === "object" ? row.requester : {}) as Record<string, unknown>;
  const courtName = typeof meta.court === "string" ? meta.court.trim() : "";
  const cls = courtClassOf(courtName, meta.courtClass);
  const client = typeof req.name === "string" ? req.name.trim() : "";
  return {
    reference: orderReference(row.id) || null,
    court: cls ?? null,
    circuit: courtName && courtName !== cls ? courtName : null,
    client: client || null,
  };
}

export interface HearingsTableRow {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM[:SS] or null */
  time?: string | null;
  location?: string | null;
  /** UI type: hearing | deadline | gov_review | client_meet | internal */
  type?: string | null;
  caseInfo?: HearingCaseInfo | null;
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ar = (s: string) => s.replace(/\d/g, (d) => AR_DIGITS[Number(d)]);

function dateCell(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? ar(`${m[3]}/${m[2]}/${m[1]}`) : DASH;
}

function timeCell(time: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  if (!m) return DASH;
  const h = Number(m[1]);
  const suffix = h < 12 ? "ص" : "م";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return ar(`${h12}:${m[2]}`) + ` ${suffix}`;
}

/** One hearing → the six cells. */
export function hearingTableCells(row: HearingsTableRow): string[] {
  const info = row.caseInfo ?? null;
  const place = row.type === "client_meet" ? "" : (row.location ?? "").trim();
  return [
    dateCell(row.date),
    timeCell(row.time),
    info?.court ?? (place || DASH),
    info?.reference ?? DASH,
    info?.client ?? DASH,
    info?.circuit ?? DASH,
  ];
}

/** The document: title, optional sub-line (whose diary), and the table, in date and hour order. */
export function hearingsTableBlocks(rows: readonly HearingsTableRow[], subtitle?: string | null): DocBlock[] {
  const sorted = [...rows].sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  const blocks: DocBlock[] = [{ kind: "title", text: HEARINGS_TABLE_TITLE }];
  if (subtitle && subtitle.trim()) blocks.push({ kind: "para", text: subtitle.trim() });
  if (sorted.length === 0) return blocks;
  blocks.push({ kind: "table", header: [...HEARINGS_TABLE_HEADER], rows: sorted.map(hearingTableCells) });
  return blocks;
}
