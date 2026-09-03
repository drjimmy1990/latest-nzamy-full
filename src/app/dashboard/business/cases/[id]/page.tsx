"use client";

/**
 * business/cases/[id] — the corporate case file.
 *
 * REWRITTEN 2026-09-03. The previous 486-line version was a static mock:
 * hardcoded id «DOCKET-1200», a fabricated dispute title and client name
 * («نزاع مقاولة مع شركة البناء الحديث» / «شركة أفق للتطوير»), an invented AI
 * summary claiming 85% confidence on a court outcome, a fake team roster,
 * fabricated tasks and a finance/retainer balance nothing in this codebase
 * tracks, a «مكتمل جزئياً» button with no handler, a DotsThree menu button
 * with no handler, and a `ShareGraphModal` whose "send" button called
 * `setSent(true)` with no network request at all while displaying «تم
 * التشفير وإرسال الوصول» / «تم إصدار Passcode» — a false claim of encryption
 * and delivery for an action that did nothing.
 *
 * This version mirrors the real requester-side case file
 * (src/app/dashboard/client/cases/[id]/page.tsx): it fetches the actual row
 * through `getServiceRequestDetail(id)` with the same four-state contract
 * (loading / ready / notfound / unreadable — unreadable gets its own retry
 * screen, never disguised as "not found"), renders the real title, the real
 * order reference, the real status and type, and a timeline built from
 * `detail.events` through the shared `caseEventLabel` (never a local copy of
 * that map — see caseEventLabels.ts for why one copy is the whole point).
 * Documents are `detail.attachments`, opened through `getDocumentFileUrl`
 * exactly as the lawyer case file does, including the timeout-specific
 * error copy.
 *
 * The graph tab is kept — `CaseGraphView` is a real, per-case saved graph —
 * but the banner claiming «يتم تحديث اللوحة البصرية حياً مع فريقك» (live
 * sync with your team) is removed: nothing in CaseGraphView pushes updates
 * to other viewers, it is one browser's local edit history for this case's
 * graph. The external-share modal is removed outright rather than reworded,
 * because there is no backend for issuing access, a passcode, or encrypted
 * sharing — faking the copy while keeping the button would just move the
 * false claim, not remove it.
 *
 * The tasks and finance tabs are removed, not stubbed: there is no
 * requester-side task board or billing/retainer data model in this
 * codebase (service_requests carries a single `payment` field, not a ledger
 * or task list), so a tab for either would have nothing real to show.
 *
 * Per this project's data-model note: a business/corporate account today has
 * no firm-wide table (nothing inserts firm_members, and service_requests RLS
 * only admits requester_user_id or assigned_to) — so this file, like the
 * client one it mirrors, shows the requesting account's OWN case only. The
 * "team" roster and per-member task assignment the old mock displayed
 * assumed a firm data model that does not exist yet; removing them is
 * honest, not a regression.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight, MagnifyingGlass, ShareNetwork, FolderOpen,
  Scales, CheckCircle, Warning, FileText, FilePdf, CloudArrowUp,
  ArrowClockwise,
} from "@phosphor-icons/react";

import {
  getServiceRequestDetail,
  type ServiceRequestDetail,
  type ServiceRequestAttachment,
} from "@/lib/services/casesService";
import { orderReference } from "@/lib/services/orderReference";
import { caseEventLabel } from "@/lib/services/caseEventLabels";
import {
  getDocumentFileUrl,
  isDocumentTimeoutError,
} from "@/lib/services/documentService";
import CaseGraphView from "../../kanban/CaseGraphView";

type TabPane = "overview" | "graph" | "docs";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return String(iso);
  }
}

// Same status vocabulary as the client case file's STAGES pipeline —
// service_requests.status values mapped to one Arabic chip.
function statusLabel(status: string | undefined): string {
  switch (status) {
    case "draft": return "مسودة";
    case "pending_payment": return "بانتظار الدفع";
    case "pending_assignment": return "بانتظار التعيين";
    case "assigned": return "مُسندة";
    case "in_review": return "قيد المراجعة";
    case "completed": return "مكتملة";
    case "cancelled": return "ملغاة";
    default: return status || "—";
  }
}

const TABS: { id: TabPane; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "نظرة عامة", icon: MagnifyingGlass },
  { id: "graph", label: "اللوحة البصرية (Graph)", icon: ShareNetwork },
  { id: "docs", label: "المستندات", icon: FileText },
];

export default function BusinessCaseDetailPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const params = useParams();
  const caseId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined) ?? "";

  const [request, setRequest] = useState<ServiceRequestDetail | null>(null);
  // Four honest states, same contract as the lawyer/client case files:
  // getServiceRequestDetail's `null` return means HTTP 404 and only that —
  // every other failure throws, so "does not exist" and "could not be read"
  // never collapse into the same screen.
  const [detailState, setDetailState] = useState<"loading" | "unreadable" | "notfound" | "ready">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [activeTab, setActiveTab] = useState<TabPane>("overview");
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetailState("loading");
    getServiceRequestDetail(caseId)
      .then((r) => {
        if (cancelled) return;
        setRequest(r);
        setDetailState(r ? "ready" : "notfound");
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[business case detail] fetch failed:", e);
        setRequest(null);
        setDetailState("unreadable");
      });
    return () => { cancelled = true; };
  }, [caseId, reloadKey]);

  /**
   * Open a document in a new tab, and say so when it fails — same pattern as
   * the lawyer case file's handleDownload: getDocumentFileUrl() returns null
   * on a storage error and throws DocumentTimeoutError on a timeout, and
   * both used to be silent. It opens, it does not download — the action is
   * `window.open`, so the label matches the actual verb.
   */
  const handleOpenDocument = async (doc: ServiceRequestAttachment) => {
    setDownloadError(null);
    const label = doc.name || "المستند";
    try {
      const url = await getDocumentFileUrl(doc.storage_path);
      if (!url) {
        setDownloadError(`تعذّر فتح «${label}» — حاول مرة أخرى.`);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("[business case detail] document open failed:", e);
      setDownloadError(
        isDocumentTimeoutError(e)
          ? `تعذّر فتح «${label}» — استغرق إنشاء الرابط وقتاً طويلاً. تحقق من اتصالك وحاول مجدداً.`
          : `تعذّر فتح «${label}» — حاول مرة أخرى.`,
      );
    }
  };

  const cardStyle = isDark ? "bg-zinc-900 border border-white/[0.06]" : "bg-white border border-zinc-200/70";

  // ── Render: loading ──
  if (detailState === "loading") {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center" dir="rtl">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
      </div>
    );
  }

  // ── Render: unreadable — its own screen, never disguised as "not found" ──
  if (detailState === "unreadable") {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center" dir="rtl">
        <div className={`inline-flex flex-col items-center gap-3 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
          <Warning size={40} weight="duotone" className="text-red-500" />
          <p className="text-lg font-bold">تعذّرت قراءة بيانات القضية</p>
          <p className={`text-sm max-w-md ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            هذه ليست قائمة فارغة — لم تنجح القراءة فقط.
          </p>
          <button
            onClick={() => setReloadKey(k => k + 1)}
            className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[#0B3D2E] hover:underline"
          >
            <ArrowClockwise size={14} /> إعادة المحاولة
          </button>
          <Link href="/dashboard/business/cases" className="text-sm text-[#0B3D2E] hover:underline">← العودة للقضايا</Link>
        </div>
      </div>
    );
  }

  // ── Render: not-found (HTTP 404, and only that) ──
  if (detailState === "notfound" || !request) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center" dir="rtl">
        <div className={`inline-flex flex-col items-center gap-3 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
          <Warning size={40} className={isDark ? "text-zinc-700" : "text-slate-300"} />
          <p className="text-lg font-bold">القضية غير موجودة</p>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>قد يكون الرابط غير صحيح أو أن القضية محذوفة.</p>
          <Link href="/dashboard/business/cases" className="mt-2 text-sm text-[#0B3D2E] hover:underline">← العودة للقضايا</Link>
        </div>
      </div>
    );
  }

  const data = request;
  // `|| data.id`: orderReference() returns "" for an id it cannot shorten,
  // and «رقم القضية: » with nothing after it is worse than the raw UUID.
  const caseNo = orderReference(data.id) || data.id;
  const timeline = (data.events ?? [])
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const documents = data.attachments ?? [];

  return (
    <div className={`min-h-screen pb-16 ${isDark ? "bg-zinc-950 text-zinc-100" : "bg-zinc-50/50 text-zinc-900"}`} dir="rtl">

      {/* ── Sub Header ── */}
      <div className={`sticky top-0 z-40 border-b backdrop-blur-md pt-5 px-6 ${isDark ? "bg-zinc-950/80 border-white/[0.05]" : "bg-white/80 border-zinc-200"}`}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-[12px] font-semibold">
                <Link href="/dashboard/business/cases" className={isDark ? "text-zinc-500 hover:text-white transition-colors" : "text-zinc-400 hover:text-zinc-900"}>
                  <ArrowRight size={12} className="inline-block me-1 -mt-0.5" />
                  القضايا
                </Link>
                <span className="text-zinc-600">/</span>
                {/* Same Latin-run-inside-Arabic handling as the client case
                    file: `dir="ltr"` keeps «ORD-8F14E4» from reversing. */}
                <span className="text-[#C8A762]" dir="ltr" title={data.id}>{caseNo}</span>
              </div>
              <h1 className={`text-2xl font-bold flex items-center gap-3 ${isDark ? "text-white" : "text-zinc-900"}`}>
                {data.title || "قضية"}
              </h1>
              <p className={`mt-1.5 text-sm flex items-center gap-4 flex-wrap ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${isDark ? "border-white/[0.08] bg-white/[0.04]" : "border-zinc-200 bg-zinc-50"}`}>
                  {statusLabel(data.status)}
                </span>
                {data.type && <span>{data.type}</span>}
                <span>أُنشئت: {formatDate(data.createdAt)}</span>
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b border-transparent">
            {TABS.map(t => (
              <button
                key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 pb-3 pt-1 text-[13px] font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === t.id ? "border-[#C8A762] text-[#C8A762]" : isDark ? "border-transparent text-zinc-500 hover:text-zinc-300" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
              >
                <t.icon size={16} weight={activeTab === t.id ? "fill" : "regular"} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto py-8 px-6">
        <AnimatePresence mode="wait">

          {/* ── OVERVIEW TAB ── */}
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">

              {data.description && (
                <div className={`${cardStyle} rounded-3xl p-6`}>
                  <h3 className={`text-[14px] font-bold mb-3 ${isDark ? "text-white" : "text-zinc-800"}`}>تفاصيل القضية</h3>
                  <p className={`text-[13px] leading-loose whitespace-pre-line ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    {data.description}
                  </p>
                </div>
              )}

              {/* Timeline */}
              <div className={`${cardStyle} rounded-3xl p-6`}>
                <div className="flex items-center gap-2 mb-4">
                  <Scales size={16} className="text-[#0B3D2E]" />
                  <h3 className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>مسار القضية</h3>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${isDark ? "bg-white/[0.05] text-zinc-500" : "bg-slate-100 text-slate-500"}`}>
                    {timeline.length}
                  </span>
                </div>

                {timeline.length === 0 ? (
                  <div className="text-center py-8">
                    <Scales size={28} className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                    <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد أحداث مسجّلة بعد</p>
                  </div>
                ) : (
                  <div className="relative">
                    <div className={`absolute start-[18px] top-3 bottom-3 w-px ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`} />
                    <div className="space-y-1">
                      {timeline.map((ev, i) => (
                        <motion.div key={ev.id ?? i}
                          initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                          className="flex items-start gap-3 py-2 px-2 rounded-xl">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 relative z-10 border ${isDark ? "bg-emerald-500/15 border-emerald-500/30" : "bg-emerald-50 border-emerald-200"}`}>
                            <CheckCircle size={16} weight="fill" className="text-emerald-500" />
                          </div>
                          <div className="flex-1 pt-1.5">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{caseEventLabel(ev.event)}</p>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.04] text-zinc-600" : "bg-slate-100 text-slate-500"}`}>{formatDate(ev.created_at)}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── GRAPH TAB ── */}
          {activeTab === "graph" && (
            <motion.div key="graph" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="h-[70vh] flex flex-col gap-4">
              <div className={`flex-1 rounded-3xl overflow-hidden border relative ${isDark ? "border-white/[0.08]" : "border-zinc-200"}`}>
                <CaseGraphView isDark={isDark} isGlobal={false} caseId={caseId} />
              </div>
            </motion.div>
          )}

          {/* ── DOCUMENTS TAB ── */}
          {activeTab === "docs" && (
            <motion.div key="docs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {downloadError && (
                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-[12px] font-semibold text-red-500">
                  {downloadError}
                </div>
              )}

              {documents.length === 0 ? (
                <div className={`${cardStyle} rounded-3xl p-12 text-center`}>
                  <div className={`mx-auto h-16 w-16 mb-4 rounded-full flex items-center justify-center ${isDark ? "bg-white/[0.04]" : "bg-zinc-100"}`}>
                    <CloudArrowUp size={32} className="text-zinc-400 opacity-50" />
                  </div>
                  <h3 className={`text-lg font-bold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-800"}`}>لا توجد مستندات</h3>
                  <p className={`text-sm max-w-sm mx-auto ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>لم يُرفع أي مستند على هذه القضية بعد.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {documents.map((doc) => {
                    const isPdf = (doc.mime_type ?? "").includes("pdf");
                    return (
                      <button
                        key={doc.id}
                        onClick={() => handleOpenDocument(doc)}
                        className={`group text-start rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${isDark ? "bg-zinc-900/80 border-white/[0.06] hover:border-white/15" : "bg-white border-zinc-200 hover:border-zinc-300 hover:shadow-zinc-100"}`}
                      >
                        <div className={`h-16 w-full rounded-xl flex items-center justify-center mb-3 ${isPdf ? isDark ? "bg-red-500/10" : "bg-red-50" : isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
                          {isPdf
                            ? <FilePdf size={32} className="text-red-500" weight="fill" />
                            : <FileText size={32} className="text-[#C8A762]" weight="fill" />}
                        </div>
                        <p className={`text-[11px] font-bold leading-tight truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{doc.name}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className={`text-[9px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{formatDate(doc.created_at)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
