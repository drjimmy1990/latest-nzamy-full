/**
 * casesSync.ts — الجزء الصرف من POST /api/v1/ext/cases/sync (عقد: docs/plans/2026-11-21-ext-cases-sync-contract.md).
 * تحقق من المخطط + تنظيف + إزالة تكرار بالبصمة + تقنيع الهويات. بلا قاعدة بيانات ولا شبكة،
 * فيعمل تحت `node --test`. الكتابة نفسها في دالة SQL ‏`ext_cases_sync` (معاملة واحدة).
 */

export const PLATFORMS = ["najiz", "taradhi", "enforcement", "khebra", "infath", "ifa"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const MAX_BODY_BYTES = 1_000_000;
export const MAX_ITEMS = 200;
const ROLES = ["plaintiff", "defendant", "other"] as const;
const RECORD_KINDS = ["enforcement_seizure", "ruling", "memo", "other"] as const;
const SHA256 = /^[0-9a-f]{64}$/;

export interface SyncParty { role: string; name: string; id_masked: string | null }
export interface SyncSession { date: string; kind: string | null; outcome: string | null; notes: string | null }
export interface SyncAttachment { kind: string; title: string; sha256: string; size: number; mime: string; url: string | null }
export interface SyncRecord { kind: string; text: string; sha256: string }
export interface CasesSyncRequest {
  idempotency_key: string;
  source: { platform: Platform; captured_at: string; extension_version: string | null };
  case: { number: string; year_hijri: string | null; court: string | null; type: string | null; status: string | null };
  parties: SyncParty[];
  sessions: SyncSession[];
  attachments: SyncAttachment[];
  records: SyncRecord[];
}
export interface SyncFailure { ok: false; status: number; code: string; errors: { path: string; reason: string }[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
const optStr = (v: unknown, max: number): string | null | undefined =>
  v === undefined || v === null || v === "" ? null : typeof v === "string" && v.length <= max ? v.trim() : undefined;
const isoDate = (v: unknown): boolean => typeof v === "string" && v.length <= 40 && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v));

/** آخر ٤ أرقام فقط — دفاع في العمق ولو أرسلت الإضافة هوية كاملة. */
export function maskId(v: string): string {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : "••••";
}

export function parseCasesSyncRequest(body: unknown): { ok: true; value: CasesSyncRequest } | SyncFailure {
  const errors: { path: string; reason: string }[] = [];
  const bad = (path: string, reason: string) => void errors.push({ path, reason });
  let tooLarge = false;
  if (!isObj(body)) return { ok: false, status: 422, code: "invalid_body", errors: [{ path: "", reason: "الجسم ليس كائنًا" }] };

  const key = str(body.idempotency_key, 128);
  if (!key) bad("idempotency_key", "مطلوب (≤128)");

  const src = isObj(body.source) ? body.source : {};
  const platform = PLATFORMS.find((p) => p === src.platform);
  if (!platform) bad("source.platform", `إحدى: ${PLATFORMS.join("|")}`);
  if (!isoDate(src.captured_at)) bad("source.captured_at", "تاريخ ISO-8601");
  const extVer = optStr(src.extension_version, 32);
  if (extVer === undefined) bad("source.extension_version", "نص ≤32");

  const c = isObj(body.case) ? body.case : {};
  const number = str(c.number, 64);
  if (!number) bad("case.number", "مطلوب");
  const caseOpt = (k: string, max: number) => {
    const v = optStr(c[k], max);
    if (v === undefined) bad(`case.${k}`, `نص ≤${max}`);
    return v ?? null;
  };
  const kase = { number: number ?? "", year_hijri: caseOpt("year_hijri", 16), court: caseOpt("court", 200), type: caseOpt("type", 200), status: caseOpt("status", 100) };

  const arr = (name: string): unknown[] => {
    const v = body[name];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) { bad(name, "مصفوفة"); return []; }
    if (v.length > MAX_ITEMS) { bad(name, `أكثر من ${MAX_ITEMS} عنصر`); tooLarge = true; return []; }
    return v;
  };

  const parties: SyncParty[] = [];
  arr("parties").forEach((p, i) => {
    const o = isObj(p) ? p : {};
    const role = ROLES.find((r) => r === o.role);
    const name = str(o.name, 300);
    const idm = optStr(o.id_masked, 40);
    if (!role) bad(`parties[${i}].role`, ROLES.join("|"));
    if (!name) bad(`parties[${i}].name`, "مطلوب");
    if (idm === undefined) bad(`parties[${i}].id_masked`, "نص");
    if (role && name && idm !== undefined) parties.push({ role, name, id_masked: idm ? maskId(idm) : null });
  });

  const sessions: SyncSession[] = [];
  arr("sessions").forEach((s, i) => {
    const o = isObj(s) ? s : {};
    const kind = optStr(o.kind, 100), outcome = optStr(o.outcome, 300), notes = optStr(o.notes, 2000);
    if (!isoDate(o.date)) bad(`sessions[${i}].date`, "تاريخ ISO-8601");
    if (kind === undefined || outcome === undefined || notes === undefined) bad(`sessions[${i}]`, "حقل نصي طويل جدًا");
    else if (isoDate(o.date)) sessions.push({ date: o.date as string, kind, outcome, notes });
  });

  const attachments = new Map<string, SyncAttachment>();
  arr("attachments").forEach((a, i) => {
    const o = isObj(a) ? a : {};
    const kind = str(o.kind, 60), title = str(o.title, 300), mime = str(o.mime, 100);
    const sha = typeof o.sha256 === "string" ? o.sha256.toLowerCase() : "";
    const url = optStr(o.url, 1000);
    const size = o.size;
    const sizeOk = typeof size === "number" && Number.isSafeInteger(size) && size >= 0;
    if (!kind) bad(`attachments[${i}].kind`, "مطلوب");
    if (!title) bad(`attachments[${i}].title`, "مطلوب");
    if (!mime) bad(`attachments[${i}].mime`, "مطلوب");
    if (!SHA256.test(sha)) bad(`attachments[${i}].sha256`, "٦٤ خانة hex");
    if (!sizeOk) bad(`attachments[${i}].size`, "عدد صحيح ≥٠");
    if (url === undefined) bad(`attachments[${i}].url`, "نص ≤1000");
    if (kind && title && mime && SHA256.test(sha) && sizeOk && url !== undefined && !attachments.has(sha))
      attachments.set(sha, { kind, title, sha256: sha, size: size as number, mime, url });
  });

  const records = new Map<string, SyncRecord>();
  arr("records").forEach((r, i) => {
    const o = isObj(r) ? r : {};
    const kind = RECORD_KINDS.find((k) => k === o.kind);
    const text = str(o.text, 20000);
    const sha = typeof o.sha256 === "string" ? o.sha256.toLowerCase() : "";
    if (!kind) bad(`records[${i}].kind`, RECORD_KINDS.join("|"));
    if (!text) bad(`records[${i}].text`, "مطلوب (≤20000)");
    if (!SHA256.test(sha)) bad(`records[${i}].sha256`, "٦٤ خانة hex");
    if (kind && text && SHA256.test(sha) && !records.has(sha)) records.set(sha, { kind, text, sha256: sha });
  });

  if (errors.length) return { ok: false, status: tooLarge ? 413 : 422, code: tooLarge ? "too_large" : "invalid_schema", errors };
  return {
    ok: true,
    value: {
      idempotency_key: key!,
      source: { platform: platform!, captured_at: src.captured_at as string, extension_version: extVer ?? null },
      case: kase,
      parties,
      sessions,
      attachments: [...attachments.values()],
      records: [...records.values()],
    },
  };
}
