/**
 * linkCheck.ts — the daily broken-reference check of the library's links
 * (owner file 10 ب34 «فحص يومي للروابط المكسورة في الإحالات، وتحديثها آلياً مع
 * سكربت الجراف»; batch l12, migration 20261202_30).
 *
 * POST /api/v1/cron/library-link-check (daily) calls
 * graph_rag_link_check_run(): it re-points the owner's links by their stable
 * ids (the owner-edges resolver), then stores one row with what is broken —
 * graph nodes that carry reader links while their library row (or document)
 * is gone. The reader already shows such a link as its document or drops it;
 * the list is for the team to fix the data. The admins are told when the count
 * rises; GET /api/v1/admin/library-link-check feeds the staff explorer's list.
 *
 * Pure (no imports): node --test loads it, the admin panel imports it.
 */

export const LINK_CHECK_SAMPLE = 50;
export const LINK_CHECK_HISTORY = 14;

export const LINK_CHECK_REASON_LABELS: Readonly<Record<string, string>> = {
  article_gone: "مادة لم تعد في المكتبة",
  principle_gone: "مبدأ لم يعد في المكتبة",
  document_gone: "مستند لم يعد في المكتبة",
};

/** Arabic labels of the owner links' statuses (library_graph.owner_edges.resolve_status). */
export const OWNER_EDGE_STATUS_LABELS: Readonly<Record<string, string>> = {
  resolved: "على مادتها",
  resolved_doc: "على المستند (تعذّر تحديد المادة)",
  node_missing: "بانتظار مزامنة الجراف",
  type_not_merged: "نوع لا يُدمج",
  deleted: "محذوف بطلب المالك",
  self_link: "يربط المستند بنفسه",
  pending: "لم يُعالَج بعد",
  source_doc_unknown: "المصدر غير معروف",
  source_doc_ambiguous: "المصدر يطابق أكثر من مستند",
  source_principle_missing: "رقم المبدأ غير مذكور",
  source_principle_ambiguous: "رقم المبدأ مكرر",
  source_principle_not_found: "المبدأ غير موجود",
  target_doc_unknown: "المستند الهدف غير معروف",
  held_flagged: "موقوف للمراجعة (قبل 20261202_30)",
};

/** The admins are told when something is broken and the count did not fall (first check, or more than last time). */
export function shouldAlertLinkCheck(broken: number, previous: number | null | undefined): boolean {
  if (!Number.isInteger(broken) || broken <= 0) return false;
  return previous === null || previous === undefined || !Number.isInteger(previous) || broken > previous;
}

export function linkCheckAlertText(broken: number): { title: string; body: string; href: string } {
  return {
    title: "روابط مكسورة في إحالات المكتبة",
    body: `وجد الفحص اليومي ${broken.toLocaleString("ar-SA")} عنصراً في الجراف لم يعد له أصل في المكتبة. يظهر للقارئ رابطاً إلى مستنده أو يُحذف، والقائمة في مستكشف الجراف ← الحالة.`,
    href: "/dashboard/admin/graph-explorer",
  };
}

export interface LinkCheckSampleRow {
  node_key: string;
  node_type: string;
  title: string;
  law_slug: string | null;
  reason: string;
  links: number;
}
export interface LinkCheckRow {
  id: number;
  checked_at: string;
  broken: number;
  by_reason: Record<string, number>;
  owner_edges: Record<string, number>;
  sample: LinkCheckSampleRow[];
}

const int = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
function counts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (/^[a-z_]{1,40}$/.test(k)) out[k] = int(n);
  }
  return out;
}

/** graph_rag_link_check_history() → rows the panel can draw (anything malformed is dropped or zeroed). */
export function parseLinkCheckHistory(raw: unknown): LinkCheckRow[] {
  if (!Array.isArray(raw)) return [];
  const out: LinkCheckRow[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (!str(o.checked_at)) continue;
    out.push({
      id: int(o.id),
      checked_at: str(o.checked_at),
      broken: int(o.broken),
      by_reason: counts(o.by_reason),
      owner_edges: counts(o.owner_edges),
      sample: (Array.isArray(o.sample) ? o.sample : [])
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
        .map((s) => ({
          node_key: str(s.node_key),
          node_type: str(s.node_type),
          title: str(s.title).slice(0, 160),
          law_slug: str(s.law_slug) || null,
          reason: str(s.reason),
          links: int(s.links),
        }))
        .filter((s) => s.node_key),
    });
  }
  return out;
}
