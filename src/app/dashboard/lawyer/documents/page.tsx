"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FolderOpen, MagnifyingGlass, UploadSimple,
  Download, Eye, CalendarBlank,
  GridFour, List,
  Warning, Info, ArrowClockwise, Trash, ShieldWarning, ShareNetwork,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  type DocType, type LegalBranch, type TemplateCategory,
  LEGAL_BRANCHES, TMPL_CAT_CONFIG, TEMPLATES,
} from "./_taxonomy";
import { TYPE_ICON, TYPE_COLOR, TMPL_CAT_CONFIG_ICONS } from "./_ui-config";
import {
  getDocuments, uploadDocumentFile, getDocumentFileUrl, deleteDocument, setLegalHold,
  isUploadTimeoutError, isDocumentTimeoutError,
} from "@/lib/services/documentService";
import type { Document } from "@/lib/services/documentService";
import { partitionUploadFiles } from "@/lib/services/fileValidation";
import { isSupabaseMode } from "@/lib/services/api";
import { DocumentsTrashPanel } from "@/components/documents/DocumentsTrashPanel";
import ShareDocumentModal from "@/components/documents/ShareDocumentModal";
import {
  confirmDeleteToBinAr, holdFailureAr, holdReasonTooLongAr,
  MAX_HOLD_REASON_LEN,
} from "@/components/documents/_trashCopy";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The document shape this page renders, defined here rather than imported from
 * `_taxonomy` on purpose: `Doc` there carries `category`, `subtype`, `branch`,
 * `party`, `tags`, `caseTitle` and `archived`, and the `attachments` table has
 * columns for NONE of them (id, request_id, owner_user_id, file_name,
 * storage_path, mime_type, size_bytes, created_at — migration
 * 20260518_client_workflow_backend_ready.sql, with no later migration adding
 * any). The mapper below used to satisfy that interface by writing
 * `category: "briefs"` on every single row, which made «المذكرات» claim every
 * file the lawyer owns while «العقود», «الأدلة», «الأحكام» and «المراسلات»
 * permanently read 0, and made every advanced filter empty a non-empty store.
 * Only fields with a column behind them survive here.
 */
interface Doc {
  id:    string;
  name:  string;
  type:  DocType;
  size:  string;
  date:  string;
  /** Required to sign a URL. The old mapper dropped it, which is why the
   *  view/download buttons could not have worked even with a handler. */
  storagePath: string;
  /** Phase 6 bin/hold columns — attachments.legal_hold / hold_reason. */
  legalHold: boolean;
  holdReason: string | null;
}

function apiDocToDoc(d: Document): Doc {
  const typeMap: Record<string, DocType> = { pdf: "pdf", docx: "docx", doc: "docx", png: "image", jpg: "image", jpeg: "image" };
  const ext = d.file_name.split(".").pop()?.toLowerCase() ?? "";
  const bytes = d.size_bytes ?? 0;
  const sizeStr = bytes
    ? bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : "";
  return {
    id: String(d.id),
    name: d.file_name,
    type: typeMap[ext] ?? "other",
    size: sizeStr,
    date: d.created_at ? new Date(d.created_at).toLocaleDateString("ar-SA") : "",
    storagePath: d.storage_path,
    legalHold: d.legal_hold === true,
    holdReason: d.hold_reason ?? null,
  };
}

/**
 * Same split the client documents page makes, and for the same reason: after
 * fifteen seconds of nothing, "try again" alone does not tell the lawyer
 * whether the file is gone or the line is bad.
 */
function fileLinkFailureAr(action: "عرض" | "تنزيل", name: string, err: unknown): string {
  return isDocumentTimeoutError(err)
    ? `تعذّر ${action} «${name}» — استغرق إنشاء الرابط وقتاً طويلاً. تحقق من اتصالك وحاول مجدداً.`
    : `تعذّر ${action} «${name}» — حاول مرة أخرى.`;
}

type LoadState = "loading" | "ready" | "failed";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { isDark } = useTheme();

  const [docs,          setDocs]          = useState<Doc[]>([]);
  const [loadState,     setLoadState]     = useState<LoadState>("loading");
  const [mainTab,       setMainTab]       = useState<"docs" | "templates" | "trash">("docs");
  const [search,        setSearch]        = useState("");
  const [tmplCat,       setTmplCat]       = useState<TemplateCategory | "all">("all");
  const [tmplBranch,    setTmplBranch]    = useState<LegalBranch | "all">("all");
  const [viewMode,      setViewMode]      = useState<"list" | "grid">("list");

  const [uploading,     setUploading]     = useState(false);
  const [uploadError,   setUploadError]   = useState<string | null>(null);
  const [actionError,   setActionError]   = useState<string | null>(null);
  const [busyDocId,     setBusyDocId]     = useState<string | null>(null);
  // «مشاركة برابط» — owner item 174. The doc being shared, or null when the
  // modal is closed. Only ever set to a row from `filteredDocs` (the live
  // list), so a trashed row can never reach it — the bin renders through
  // DocumentsTrashPanel below, which has no share action at all.
  const [shareTarget,   setShareTarget]   = useState<Doc | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Three states, never two. `catch { setDocs([]) }` used to render a failed
   * read as «٠ مستند» and «لا توجد مستندات مطابقة» — byte for byte what a
   * lawyer who has genuinely uploaded nothing sees. `docsLoading` existed but
   * appeared nowhere in the JSX, so even the first paint (before the fetch
   * resolved) already asserted an empty store.
   *
   * THE GAP THIS COMMENT USED TO DECLARE IS NOW CLOSED. It said the fix could
   * not reach a failed QUERY, because GET /api/v1/documents answered a Supabase
   * error with HTTP 200 and `{ data: [] }` and carried no `degraded` marker —
   * so a broken query was still indistinguishable from an empty store here, and
   * closing it needed a change in the route rather than in this file.
   *
   * That route change has landed: src/app/api/v1/documents/route.ts:39-41 now
   * logs the Supabase error and returns 500 `{ error: "تعذّر تحميل مستنداتك." }`.
   * getDocuments() goes through apiGet, which throws on any non-2xx, so a failed
   * query now reaches the catch below exactly like a 401 or a dropped
   * connection, and lands on the COULD-NOT-READ panel with the rest.
   *
   * All three failure kinds — non-2xx, the 15-second timeout, and a query that
   * errored server-side — are now one state on this screen, and none of them
   * can be drawn as «لم ترفع أي مستند بعد».
   */
  const loadDocs = useCallback(async () => {
    // Does not flip to "loading" itself — the initial state already is, and
    // the post-upload refresh below must not blank a list the lawyer is
    // reading. The retry button sets it.
    try {
      const apiDocs = await getDocuments();
      setDocs(apiDocs.map(apiDocToDoc));
      setLoadState("ready");
      return true;
    } catch (err) {
      console.error("[lawyer-documents] load failed:", err);
      setDocs([]);
      setLoadState("failed");
      return false;
    }
  }, []);

  const retryLoad = useCallback(() => {
    setLoadState("loading");
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  /**
   * «رفع مستند» used to open the picker and drop the selection on the floor —
   * the input had no onChange at all. Same shape as the client documents page:
   * every file gets its own try so one failure does not abandon the rest, and
   * only a timeout ends the batch, since it means the link is not carrying
   * data and the remaining files would each spend another minute proving it.
   */
  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    if (!isSupabaseMode) {
      setUploadError("الوضع التجريبي — رفع المستندات يتطلب ربط قاعدة البيانات.");
      return;
    }

    // Size and extension are checked before anything is sent, through the same
    // gate every other upload surface uses.
    const { accepted, rejectedMessage } = partitionUploadFiles(Array.from(fileList));
    // Clearing the input is what lets the same file be picked again after a
    // correction — an unchanged value fires no change event.
    const resetInput = () => { if (fileInputRef.current) fileInputRef.current.value = ""; };
    if (accepted.length === 0) {
      setUploadError(rejectedMessage);
      resetInput();
      return;
    }

    const problems: string[] = rejectedMessage ? [rejectedMessage] : [];
    const uploaded: string[] = [];
    setUploading(true);
    setUploadError(rejectedMessage);
    try {
      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i];
        try {
          await uploadDocumentFile(file);
          uploaded.push(file.name);
        } catch (err) {
          console.error("[lawyer-documents] upload failed:", err);
          problems.push(
            isUploadTimeoutError(err)
              ? `${file.name}: ${err.message}`
              : `${file.name}: تعذّر رفع الملف — تحقق من الاتصال وحاول مجدداً.`,
          );
          if (isUploadTimeoutError(err)) {
            const untried = accepted.slice(i + 1).map(f => f.name);
            if (untried.length > 0) {
              problems.push(`لم تتم محاولة رفع: ${untried.join("، ")} — توقّف الرفع بعد انتهاء المهلة.`);
            }
            setUploadError(problems.join("\n"));
            break;
          }
          setUploadError(problems.join("\n"));
        }
      }
    } finally {
      setUploading(false);
      resetInput();
    }

    if (uploaded.length === 0) return;

    // The files are on the server whatever the refresh does, so a failed
    // reload must not be reported as a failed upload.
    const refreshed = await loadDocs();
    if (!refreshed) {
      problems.push(`تم رفع: ${uploaded.join("، ")} — لكن تعذّر تحديث القائمة. حدّث الصفحة لعرض ما تم رفعه.`);
      setUploadError(problems.join("\n"));
    }
  }, [loadDocs]);

  /**
   * «عرض» and «تنزيل» were three `<button>` elements with no onClick at all,
   * on a page whose upload path is real — so a lawyer could put a file into
   * this store and never get it back out. `getDocumentFileUrl` already existed
   * with its own timeout class and is already consumed by
   * dashboard/client/documents; the only thing missing here was the
   * `storage_path` the mapper threw away. The third button (DotsThree) had no
   * menu behind it and is gone rather than stubbed.
   */
  const resolveFileUrl = useCallback(async (d: Doc, action: "عرض" | "تنزيل"): Promise<string | null> => {
    setActionError(null);
    setBusyDocId(d.id);
    try {
      const url = await getDocumentFileUrl(d.storagePath);
      if (!url) {
        setActionError(fileLinkFailureAr(action, d.name, null));
        return null;
      }
      return url;
    } catch (err) {
      // Log key stays English and constant so it is greppable; the Arabic verb
      // is for the banner, not the console.
      console.error("[lawyer-documents] signed url failed:", d.storagePath, err);
      setActionError(fileLinkFailureAr(action, d.name, err));
      return null;
    } finally {
      setBusyDocId(null);
    }
  }, []);

  const handleView = useCallback(async (d: Doc) => {
    const url = await resolveFileUrl(d, "عرض");
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [resolveFileUrl]);

  const handleDownload = useCallback(async (d: Doc) => {
    const url = await resolveFileUrl(d, "تنزيل");
    if (!url) return;
    const a = window.document.createElement("a");
    a.href = url;
    a.download = d.name;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
  }, [resolveFileUrl]);

  /**
   * «حذف» was missing from this page entirely — a lawyer had no way to move a
   * document into سلة المحذوفات from here at all. Mirrors
   * dashboard/client/documents/page.tsx's handleDelete: deleteDocument() is a
   * SOFT delete (documentService.ts), so the confirm names the bin, not
   * "irreversible". A row under legal hold is refused server-side (409) —
   * the button is disabled for those rows below so a lawyer is not sent into
   * a failing request to learn that.
   */
  const handleDelete = useCallback(async (doc: Doc) => {
    if (!confirm(confirmDeleteToBinAr(doc.name))) return;
    setActionError(null);
    setBusyDocId(doc.id);
    try {
      await deleteDocument(doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      console.error("[lawyer-documents] delete failed:", doc.id, err);
      setActionError(
        isDocumentTimeoutError(err)
          ? `تعذّر تأكيد نقل «${doc.name}» إلى السلة — انتهت المهلة قبل وصول ردّ الخادم، وقد يكون النقل قد تم فعلاً. حدّث الصفحة للتحقق.`
          : `فشل حذف «${doc.name}». حاول مرة أخرى.`,
      );
    } finally {
      setBusyDocId(null);
    }
  }, []);

  /**
   * «حجز قانوني» — owner item Phase 6. Setting a hold asks for an optional
   * reason with a native prompt(), the same class of dialog `confirm()`
   * already is on this page; clearing one asks for a plain confirm. The API
   * (PATCH .../hold) refuses `legalHold: true` on a row already in the bin
   * (409) — restore it first — but that combination cannot be reached from
   * this tab, since a held row can never be soft-deleted in the first place
   * (DB CHECK attachments_hold_blocks_delete_check makes the two mutually
   * exclusive), so no extra guard is needed here for that case.
   */
  const handleToggleHold = useCallback(async (doc: Doc) => {
    const turningOn = !doc.legalHold;
    let reason: string | undefined;
    if (turningOn) {
      const input = window.prompt("سبب الحجز القانوني (اختياري):", "");
      if (input === null) return; // cancelled
      const trimmed = input.trim();
      if (trimmed.length > MAX_HOLD_REASON_LEN) {
        setActionError(holdReasonTooLongAr());
        return;
      }
      reason = trimmed || undefined;
    } else if (!confirm(`إلغاء الحجز القانوني عن «${doc.name}»؟`)) {
      return;
    }
    setActionError(null);
    setBusyDocId(doc.id);
    try {
      await setLegalHold(doc.id, turningOn, reason);
      setDocs((prev) => prev.map((d) => (
        d.id === doc.id ? { ...d, legalHold: turningOn, holdReason: turningOn ? (reason ?? null) : null } : d
      )));
    } catch (err) {
      console.error("[lawyer-documents] hold toggle failed:", doc.id, err);
      setActionError(holdFailureAr(doc.name, turningOn, isDocumentTimeoutError(err)));
    } finally {
      setBusyDocId(null);
    }
  }, []);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  /**
   * Search is the only document filter left. Every other one — seven category
   * chips, a three-level appeals taxonomy, sub-types, legal branch, party and
   * an «الأرشيف» toggle — tested a field the `attachments` table has no column
   * for, so each of them emptied a non-empty list on any selection. They are
   * removed rather than disabled: a filter that cannot filter is not a feature
   * waiting on a backend, it is a control that lies about what it did.
   */
  const filteredDocs = useMemo(
    () => docs.filter(d => !search || d.name.includes(search)),
    [search, docs],
  );

  const filteredTmpl = useMemo(() =>
    TEMPLATES.filter(t =>
      (tmplCat === "all"    || t.category === tmplCat) &&
      (tmplBranch === "all" || t.branch === tmplBranch) &&
      (!search || t.title.includes(search) || t.desc.includes(search))
    )
  , [search, tmplCat, tmplBranch]);

  const docActions = (doc: Doc) => (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleView(doc)}
        disabled={busyDocId === doc.id}
        title="عرض"
        className={`p-2 rounded-xl disabled:opacity-40 ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
        <Eye size={14} />
      </button>
      <button
        onClick={() => handleDownload(doc)}
        disabled={busyDocId === doc.id}
        title="تنزيل"
        className={`p-2 rounded-xl disabled:opacity-40 ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
        <Download size={14} />
      </button>
      {/* Demo mode has no `document_shares` row behind it and no
          /share/<token> page reads it either — the action is hidden rather
          than shown disabled, same convention the upload control on this
          page already uses. */}
      {isSupabaseMode && (
        <button
          onClick={() => setShareTarget(doc)}
          disabled={busyDocId === doc.id}
          title="مشاركة برابط"
          className={`p-2 rounded-xl disabled:opacity-40 ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
          <ShareNetwork size={14} />
        </button>
      )}
      <button
        onClick={() => handleToggleHold(doc)}
        disabled={busyDocId === doc.id}
        title={doc.legalHold ? `إلغاء الحجز القانوني${doc.holdReason ? ` — ${doc.holdReason}` : ""}` : "حجز قانوني"}
        className={`p-2 rounded-xl disabled:opacity-40 ${
          doc.legalHold
            ? isDark ? "text-amber-400 bg-amber-500/10" : "text-amber-600 bg-amber-50"
            : isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"
        }`}>
        <ShieldWarning size={14} weight={doc.legalHold ? "fill" : "regular"} />
      </button>
      <button
        onClick={() => handleDelete(doc)}
        disabled={busyDocId === doc.id || doc.legalHold}
        title={doc.legalHold ? "لا يمكن الحذف أثناء الحجز القانوني" : "حذف"}
        className={`p-2 rounded-xl disabled:opacity-40 ${isDark ? "hover:bg-red-500/10 text-zinc-400 hover:text-red-400" : "hover:bg-red-50 text-slate-500 hover:text-red-600"}`}>
        <Trash size={14} />
      </button>
    </div>
  );

  return (
    <div className="max-w-[1200px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
              style={{ fontFamily: "var(--font-brand)" }}>مخزن المستندات</h1>
          {/* No count until a read has actually succeeded — «٠ مستند» printed
              over a failed query is the same lie as a fabricated number. */}
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {loadState === "loading" ? "جارٍ تحميل المستندات…"
             : loadState === "failed" ? "تعذّر قراءة قائمة المستندات"
             : `${docs.length} مستند`}
          </p>
        </div>
        <div className="flex gap-2">
          <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
            isSupabaseMode && !uploading
              ? isDark ? "border-white/10 text-zinc-300 hover:bg-white/5 cursor-pointer" : "border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
              : isDark ? "border-white/5 text-zinc-600 cursor-not-allowed" : "border-slate-100 text-slate-300 cursor-not-allowed"
          }`}>
            <UploadSimple size={15} />{uploading ? "جاري الرفع…" : "رفع مستند"}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              disabled={!isSupabaseMode || uploading}
              onChange={e => handleFiles(e.target.files)}
            />
          </label>
          {/* The «جديد» button that sat here had no onClick and no destination.
              Uploading is the only way a document enters this store, and that
              is the button next to it. */}
        </div>
      </motion.div>

      {/* Upload failures — one line per file, so a batch says which file it is
          talking about (whitespace-pre-line keeps them apart). */}
      {uploadError && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border text-sm ${isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <Warning size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span className="whitespace-pre-line">{uploadError}</span>
        </div>
      )}

      {/* View / download / delete / hold failures */}
      {actionError && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border text-sm ${isDark ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-800"}`}>
          <Warning size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Main Tab Switch */}
      <div className={`flex rounded-2xl p-1 ${isDark ? "bg-zinc-800/80 border border-white/[0.06]" : "bg-slate-100/80 border border-slate-200"}`}>
        {([
          { key: "docs",      label: "مستنداتي",        count: loadState === "ready" ? String(docs.length) : "—" },
          { key: "templates", label: "النماذج",          count: String(TEMPLATES.length) },
          // Not prefetched on mount — the count is unknown until the tab is
          // opened, same convention "—" already carries for `docs` before its
          // own read settles.
          { key: "trash",     label: "سلة المحذوفات",   count: "—" },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setMainTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
              mainTab === tab.key
                ? isDark ? "bg-zinc-700 text-white shadow-sm" : "bg-white text-slate-800 shadow-sm"
                : isDark ? "text-zinc-500" : "text-slate-500"
            }`}>
            {tab.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${mainTab === tab.key ? "bg-royal/10 text-royal" : isDark ? "bg-white/[0.06] text-zinc-600" : "bg-slate-200 text-slate-400"}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ──────────────────── DOCUMENTS TAB ──────────────────── */}
      {mainTab === "docs" && (
        <>
          {/* Search + view mode */}
          <div className="flex gap-2">
            <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
              <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الملف..."
                className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
            </div>
            <div className={`flex rounded-xl overflow-hidden border flex-shrink-0 ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
              {(["list", "grid"] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`px-3 py-2 transition-all ${viewMode === m ? isDark ? "bg-white/[0.08] text-white" : "bg-royal text-white" : isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  {m === "list" ? <List size={14} /> : <GridFour size={14} />}
                </button>
              ))}
            </div>
          </div>

          {/* Three distinct states: loading / could-not-read / genuinely empty */}
          {loadState === "loading" ? (
            <div className={`${card} p-12 text-center`}>
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جارٍ التحميل…</p>
            </div>
          ) : loadState === "failed" ? (
            <div className={`flex flex-col items-center gap-3 px-4 py-10 rounded-2xl border text-center ${
              isDark ? "border-red-500/20 bg-red-500/[0.06] text-red-300" : "border-red-200 bg-red-50 text-red-700"
            }`}>
              <Warning size={28} weight="duotone" />
              <div>
                <p className="text-[13px] font-bold mb-1">تعذّر قراءة قائمة المستندات</p>
                <p className="text-[12px] leading-relaxed opacity-90">
                  لم يصل ردّ من الخادم، وهذه ليست قائمة فارغة — قد تكون لديك ملفات مرفوعة لا تظهر الآن.
                </p>
              </div>
              <button onClick={retryLoad}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold border ${
                  isDark ? "border-red-400/30 text-red-200 hover:bg-red-500/10" : "border-red-300 text-red-700 hover:bg-red-100"
                }`}>
                <ArrowClockwise size={13} weight="bold" />إعادة المحاولة
              </button>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className={`${card} p-12 text-center`}>
              <FolderOpen size={32} weight="duotone" className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {docs.length === 0 ? "لم ترفع أي مستند بعد" : "لا يوجد ملف يطابق البحث"}
              </p>
            </div>
          ) : viewMode === "list" ? (
            <div className="space-y-2">
              {filteredDocs.map((doc, i) => {
                const Icon = TYPE_ICON[doc.type];
                return (
                  <motion.div key={doc.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                    className={`group ${card} p-4 flex items-center gap-4 hover:border-royal/20 transition-all`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${TYPE_COLOR[doc.type]}`}>
                      <Icon size={20} weight="duotone" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`flex items-center gap-1.5 text-[14px] font-semibold truncate mb-0.5 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                        {doc.name}
                        {doc.legalHold && (
                          <span title={doc.holdReason ?? undefined} className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-50 text-amber-700"}`}>
                            <ShieldWarning size={9} weight="fill" /> حجز قانوني
                          </span>
                        )}
                      </p>
                      <div className={`flex items-center gap-2 text-[11px] flex-wrap ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        <span className="flex items-center gap-1"><CalendarBlank size={10} />{doc.date}</span>
                        <span>{doc.size}</span>
                      </div>
                    </div>
                    {docActions(doc)}
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredDocs.map((doc, i) => {
                const Icon = TYPE_ICON[doc.type];
                return (
                  <motion.div key={doc.id}
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}
                    className={`group ${card} p-4 hover:border-royal/20 transition-all`}>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${TYPE_COLOR[doc.type]}`}>
                      <Icon size={22} weight="duotone" />
                    </div>
                    <p className={`text-[13px] font-semibold line-clamp-2 mb-1 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{doc.name}</p>
                    {doc.legalHold && (
                      <span title={doc.holdReason ?? undefined} className={`mb-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-50 text-amber-700"}`}>
                        <ShieldWarning size={9} weight="fill" /> حجز قانوني
                      </span>
                    )}
                    <p className={`text-[11px] mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{doc.size} · {doc.date}</p>
                    {/* The grid used to carry no actions at all, so switching
                        view silently removed the only way to open a file. */}
                    {docActions(doc)}
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ──────────────────── TEMPLATES TAB ──────────────────── */}
      {mainTab === "templates" && (
        <>
          {/*
            What this tab is now, and why.

            «توليد بالذكاء الاصطناعي» opened a modal whose generate() was
            `await new Promise(r => setTimeout(r, 1600))` behind a rotating
            spinner — no fetch, no route, no model — and then printed four fixed
            lines signed «— تم توليده بواسطة نظامي AI —», under a strip reading
            «تاريخ الإنشاء: اليوم · آخر تحديث: اليوم · ★ معتمد», all four of them
            string literals with no field behind them. «معتمد» in particular
            asserts that a وكالة شاملة قضائية has been vetted; nothing in this
            repo approves a template and there is no approver, no reviewer and no
            date. The modal is deleted, not stubbed.

            What is left is the truth: eight template DESCRIPTIONS exist, and no
            template CONTENT does. The catalogue stays so the list is not lost;
            every control that promised to produce or download one is gone.
          */}
          <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl border text-[12px] leading-relaxed ${
            isDark ? "border-white/[0.08] bg-white/[0.02] text-zinc-400" : "border-slate-200 bg-slate-50 text-slate-600"
          }`}>
            <Info size={15} className="flex-shrink-0 mt-0.5" />
            <p>
              <strong>غير متاحة حالياً.</strong> هذه قائمة بالنماذج المخطط توفيرها — لا يوجد في نظامي بعد أي محتوى نموذج
              قابل للتعبئة أو التوليد أو التنزيل، ولا توليد بالذكاء الاصطناعي للنماذج.
              الوصف والفرع القانوني أدناه هما كل ما هو متوفر الآن.
            </p>
          </div>

          {/* search */}
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
            <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في النماذج..."
              className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
          </div>

          {/* Type filters */}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setTmplCat("all")}
              className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${tmplCat === "all" ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-500"}`}>
              الكل ({TEMPLATES.length})
            </button>
            {(Object.entries(TMPL_CAT_CONFIG) as [TemplateCategory, typeof TMPL_CAT_CONFIG[TemplateCategory]][]).map(([key, conf]) => {
              const Icon  = TMPL_CAT_CONFIG_ICONS[key] ?? conf.icon;
              const count = TEMPLATES.filter(t => t.category === key).length;
              if (!count) return null;
              return (
                <button key={key} onClick={() => setTmplCat(key === tmplCat ? "all" : key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${tmplCat === key ? conf.bg + " " + conf.color + " border-current/30" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-500"}`}>
                  <Icon size={11} weight="duotone" />{conf.emoji} {conf.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Branch filter */}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setTmplBranch("all")}
              className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold ${tmplBranch === "all" ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"}`}>
              كل الفروع
            </button>
            {LEGAL_BRANCHES.map(b => (
              <button key={b.key} onClick={() => setTmplBranch(b.key === tmplBranch ? "all" : b.key)}
                className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold ${tmplBranch === b.key ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"}`}>
                {b.label}
              </button>
            ))}
          </div>

          {/* Templates catalogue */}
          {filteredTmpl.length === 0 ? (
            <div className={`${card} p-12 text-center`}>
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا يوجد نموذج مطابق</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredTmpl.map((tmpl, i) => {
                const conf    = TMPL_CAT_CONFIG[tmpl.category];
                const CatIcon = TMPL_CAT_CONFIG_ICONS[tmpl.category] ?? conf.icon;
                const branchLbl = LEGAL_BRANCHES.find(b => b.key === tmpl.branch)?.label;
                return (
                  <motion.div key={tmpl.id}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className={`relative overflow-hidden rounded-2xl border ${
                      isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white shadow-[0_2px_16px_-6px_rgba(0,0,0,0.08)]"
                    }`}>
                    <div className={`h-1 w-full ${conf.bg.replace("/10", "")} opacity-80`} />
                    <div className="p-5">
                      <div className="flex items-start gap-3 mb-3">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${conf.bg}`}>
                          <CatIcon size={20} weight="duotone" className={conf.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          {/*
                            Removed with the generator: the «PRO» badge
                            (a paywall on something nobody can obtain), the
                            «AI» sparkle (there is no model behind any of
                            these), and the «847 استخدام / ٢–٣ صفحات / 12 حقل»
                            strip — a usage counter, a page count and a field
                            count for a document that does not exist. None of
                            the three has a source anywhere in the repo.
                          */}
                          <p className={`text-[14px] font-bold leading-snug mb-0.5 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{tmpl.title}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${conf.bg} ${conf.color}`}>{conf.emoji} {conf.label}</span>
                            {branchLbl && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>{branchLbl}</span>}
                          </div>
                        </div>
                      </div>
                      <p className={`text-[12px] leading-relaxed mb-4 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{tmpl.desc}</p>
                      <p className={`text-[11px] font-bold pt-3 border-t ${isDark ? "text-zinc-600 border-white/[0.05]" : "text-slate-400 border-slate-100"}`}>
                        غير متاح حالياً — لا يمكن توليد هذا النموذج أو تنزيله بعد.
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          <div className={`p-4 rounded-2xl border flex gap-3 items-start ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
            <Info size={14} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`} />
            <div>
              <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>الفرق بين النموذج والمستند</p>
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                <strong>النموذج</strong>: هيكل مُخطَّط لوثيقة — لا يمكن تعبئته أو إنتاجه من نظامي بعد.<br />
                <strong>المستند</strong>: ملف رفعته أنت ومحفوظ فعلاً — تجده في «مستنداتي» ويمكنك عرضه وتنزيله.
              </p>
            </div>
          </div>
        </>
      )}

      {/* ──────────────────── سلة المحذوفات TAB ──────────────────── */}
      {mainTab === "trash" && (
        <div className={`${card} p-5`}>
          <DocumentsTrashPanel isDark={isDark} onRestored={() => { void loadDocs(); }} showHeader={false} />
        </div>
      )}

      {shareTarget && (
        <ShareDocumentModal
          key={shareTarget.id}
          isDark={isDark}
          attachmentId={shareTarget.id}
          documentName={shareTarget.name}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}
