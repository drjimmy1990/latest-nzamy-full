'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  FileText, FilePdf, FileDoc, UploadSimple, MagnifyingGlass, FolderOpen,
  ArrowClockwise, DownloadSimple, Trash, Eye, PlusCircle, SortAscending,
  WarningCircle, SpinnerGap,
} from '@phosphor-icons/react';
import { useTheme } from '@/components/ThemeProvider';
import {
  getDocuments,
  uploadDocumentFile,
  getDocumentFileUrl,
  deleteDocument,
  type Document as ApiDocument,
} from '@/lib/services';
import { isUploadTimeoutError, isDocumentTimeoutError } from '@/lib/services/documentService';
import { MAX_UPLOAD_BYTES, partitionUploadFiles } from '@/lib/services/fileValidation';
import { isSupabaseMode } from '@/lib/services/api';
import {
  listOk,
  listFailed,
  listViewState,
  itemsOf,
  type ListRead,
} from '@/lib/services/listRead';
import { SkeletonList } from '../_components/DashboardSkeleton';

type DocType = 'contract' | 'evidence' | 'official' | 'other';

interface Doc {
  id: string;
  name: string;
  caseRef: string;
  type: DocType;
  size: string;
  // The raw byte count as well as the formatted string: the storage total at
  // the foot of the page has to add these up, and «١.٢ MB» does not add.
  sizeBytes: number;
  uploadedAt: string;
  /**
   * The raw upload instant, for the same reason `sizeBytes` sits beside
   * `size`: «١٥‏/٨‏/١٤٤٧ هـ» is a string, and sorting strings by an Arabic
   * calendar date does not put the newest first. NaN when the row carried no
   * created_at — such rows sort last rather than jumping to the top.
   */
  uploadedAtMs: number;
  format: 'pdf' | 'docx' | 'other';
  storagePath?: string;
}

const typeConfig: Record<DocType, { label: string; light: string; dark: string }> = {
  contract: { label: 'عقد', light: 'bg-blue-50 text-blue-700 border-blue-200', dark: 'bg-blue-900/30 text-blue-400 border-blue-700/50' },
  evidence: { label: 'دليل', light: 'bg-amber-50 text-amber-700 border-amber-200', dark: 'bg-amber-900/30 text-amber-400 border-amber-700/50' },
  official: { label: 'رسمي', light: 'bg-emerald-50 text-emerald-700 border-emerald-200', dark: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50' },
  other: { label: 'أخرى', light: 'bg-slate-100 text-slate-600 border-slate-200', dark: 'bg-white/5 text-zinc-400 border-white/10' },
};

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The same size in Arabic, for the storage panel — which has always spoken
 * Arabic, while formatBytes() feeds a mono-spaced column in every row and is
 * left as it is.
 */
function formatBytesAr(bytes: number): string {
  const ar = (n: number, digits: number) =>
    n.toLocaleString('ar-EG', { maximumFractionDigits: digits });
  if (bytes < 1024) return `${ar(bytes, 0)} بايت`;
  if (bytes < 1024 * 1024) return `${ar(bytes / 1024, 0)} كيلوبايت`;
  return `${ar(bytes / (1024 * 1024), 1)} ميجابايت`;
}

/**
 * The per-file ceiling, in Arabic megabytes, read off the constant that
 * actually refuses the file (MAX_UPLOAD_BYTES in fileValidation.ts) instead of
 * typed under the drop zone by hand. It was typed by hand once and said ١٠٠
 * while the limit was ٢٠, so a client could be promised five times what the
 * page would accept; deriving it is what stops that from happening again.
 */
const MAX_UPLOAD_MB_AR = (MAX_UPLOAD_BYTES / (1024 * 1024)).toLocaleString('ar-EG', {
  maximumFractionDigits: 0,
});

function docTypeFromName(name: string): DocType {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext)) return 'official';
  if (['doc', 'docx'].includes(ext)) return 'contract';
  if (['png', 'jpg', 'jpeg'].includes(ext)) return 'evidence';
  return 'other';
}

function docFormatFromName(name: string): Doc['format'] {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'docx';
  return 'other';
}

function apiDocToDoc(d: ApiDocument): Doc {
  return {
    id: String(d.id),
    name: d.file_name,
    caseRef: d.request_id || '',
    type: docTypeFromName(d.file_name),
    size: formatBytes(d.size_bytes),
    sizeBytes: d.size_bytes ?? 0,
    uploadedAt: d.created_at ? new Date(d.created_at).toLocaleDateString('ar-SA') : '',
    uploadedAtMs: d.created_at ? new Date(d.created_at).getTime() : Number.NaN,
    format: docFormatFromName(d.file_name),
    storagePath: d.storage_path,
  };
}

// ─── Arabic failure copy ──────────────────────────────────────────────────────

/**
 * Arabic copy for one file that did not upload.
 *
 * The banner used to read «فشل رفع الملف: » + err.message, which since
 * UploadTimeoutError started carrying Arabic prose produced «فشل رفع الملف:
 * تعذّر الرفع — استغرق وقتاً طويلاً…» — two ways of saying the upload failed,
 * one after the other. The timeout's own sentence is complete, so it is read
 * back off `.message` unprefixed and stays the single source of that wording
 * (UploadTimeoutError in documentService.ts). Everything else gets a fixed
 * Arabic sentence rather than a raw Supabase/HTTP message, which would put
 * English in front of a client.
 *
 * This mirrors attachErrorMessageAr() in src/hooks/useOrderAttachments.ts and
 * attachmentErrorAr() in dashboard/client/consultation/new/page.tsx. Both are
 * module-private where they live and this page uses neither the hook nor that
 * wizard, so the third copy is deliberate, not an oversight.
 *
 * The caller prefixes each line with the file's own name, so a batch says
 * which file it is talking about.
 */
function uploadFailureAr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Log the machine code beside the raw text: a timeout's message is Arabic
  // prose and on its own no longer identifies the error in a console.
  const code = err instanceof Error ? (err as { code?: unknown }).code : undefined;
  console.error('[documents] upload failed:', code ?? raw, raw);
  if (isUploadTimeoutError(err)) return err.message;
  if (raw === 'upload_unavailable_demo') {
    return 'رفع المستندات غير متاح في الوضع التجريبي.';
  }
  if (raw === 'Unauthorized') {
    return 'انتهت جلستك — سجّل الدخول مجدداً ثم أعد المحاولة.';
  }
  return 'تعذّر رفع الملف — تحقق من الاتصال وحاول مجدداً.';
}

/**
 * Arabic copy for a «عرض» or «تنزيل» press that produced no link. Both used to
 * fail in complete silence — `if (url) window.open(...)` with a console.error
 * catch — so a client could press either button and get nothing back, forever
 * on a hung request and instantly on a rejected one.
 *
 * A timeout is named as one rather than folded into a generic failure: after
 * fifteen seconds of nothing, "try again" alone does not tell the client
 * whether the file is gone or the line is bad.
 */
function fileLinkFailureAr(action: 'عرض' | 'تنزيل', name: string, err: unknown): string {
  return isDocumentTimeoutError(err)
    ? `تعذّر ${action} «${name}» — استغرق إنشاء الرابط وقتاً طويلاً. تحقق من اتصالك وحاول مجدداً.`
    : `تعذّر ${action} «${name}» — حاول مرة أخرى.`;
}

const FormatIcon = ({ format, isDark }: { format: Doc['format']; isDark: boolean }) => {
  if (format === 'pdf') return <FilePdf size={22} weight="fill" className={isDark ? "text-red-400" : "text-red-500"} />;
  if (format === 'docx') return <FileDoc size={22} weight="fill" className={isDark ? "text-blue-400" : "text-blue-600"} />;
  return <FileText size={22} weight="fill" className={isDark ? "text-zinc-400" : "text-zinc-500"} />;
};

function DocRow({
  doc,
  index,
  isDark,
  onView,
  onDownload,
  onDelete,
  busy,
}: {
  doc: Doc;
  index: number;
  isDark: boolean;
  onView: (d: Doc) => void;
  onDownload: (d: Doc) => void;
  onDelete: (d: Doc) => void;
  busy: boolean;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      layoutId={`doc-${doc.id}`}
      initial={{ opacity: 0, y: 14 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: index * 0.05, duration: 0.4, type: "spring", stiffness: 100, damping: 20 }}
      className={`group relative flex items-center gap-4 p-4 rounded-[1.25rem] border transition-all duration-300 ${
        isDark
          ? "bg-zinc-900/50 border-white/10 hover:bg-zinc-800/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          : "bg-white border-zinc-200 hover:border-[#0B3D2E]/20 hover:shadow-md hover:shadow-[#0B3D2E]/5"
      }`}
    >
      <div className={`w-12 h-12 rounded-[1rem] border flex items-center justify-center flex-shrink-0 transition-colors ${
        isDark ? "bg-white/5 border-white/5 group-hover:bg-white/10" : "bg-zinc-50 border-zinc-100 group-hover:bg-[#0B3D2E]/5"
      }`}>
        <FormatIcon format={doc.format} isDark={isDark} />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-[14px] font-bold truncate leading-snug mb-0.5 ${isDark ? "text-white" : "text-zinc-900"}`}>{doc.name}</p>
        <p className={`text-[11px] truncate ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{doc.caseRef || '—'}</p>
      </div>

      {/* Visible on a phone too: the size and date column beside it is already
          hidden below md, so on a narrow screen this tag is the only thing
          that says what kind of document the row is. */}
      <span className={`inline-flex text-[10px] px-2.5 py-1 rounded-full font-bold border flex-shrink-0 ${
        isDark ? typeConfig[doc.type].dark : typeConfig[doc.type].light
      }`}>
        {typeConfig[doc.type].label}
      </span>

      <div className="hidden md:flex flex-col items-end justify-center flex-shrink-0 w-24">
        <span className={`text-[11px] font-bold font-mono ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{doc.size}</span>
        <span className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{doc.uploadedAt}</span>
      </div>

      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pl-2">
        <button
          onClick={() => onView(doc)}
          title="عرض"
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            isDark ? "text-zinc-400 hover:text-white hover:bg-white/10" : "text-zinc-400 hover:text-[#0B3D2E] hover:bg-[#0B3D2E]/10"
          }`}
        >
          <Eye size={16} weight="bold" />
        </button>
        <button
          onClick={() => onDownload(doc)}
          title="تنزيل"
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            isDark ? "text-zinc-400 hover:text-white hover:bg-white/10" : "text-zinc-400 hover:text-[#0B3D2E] hover:bg-[#0B3D2E]/10"
          }`}
        >
          <DownloadSimple size={16} weight="bold" />
        </button>
        <button
          onClick={() => onDelete(doc)}
          disabled={busy}
          title="حذف"
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${
            isDark ? "text-zinc-400 hover:text-red-400 hover:bg-red-500/20" : "text-zinc-400 hover:text-red-600 hover:bg-red-50"
          }`}
        >
          <Trash size={16} weight="bold" />
        </button>
      </div>
    </motion.div>
  );
}

export default function ClientDocumentsPage() {
  const { isDark } = useTheme();
  /**
   * TWO PIECES OF STATE FOR ONE LIST, and the split is the point.
   *
   * `read` is the LATEST attempt's outcome — `ListRead` + `listViewState()`
   * (src/lib/services/listRead.ts), the shape this whole sweep moves every
   * list onto. `lastGood` is the rows of the most recent SUCCESSFUL read, kept
   * across a failure.
   *
   * Collapsing them into a single read would empty the list whenever a refresh
   * failed — including the refresh that runs immediately after an upload — so
   * a client who had just watched three files save would be shown a library
   * with nothing in it. That is the same false sentence as «لا توجد مستندات»,
   * written in an empty <ul> instead of in words. The rows stay; the banner
   * above them says the list could not be refreshed.
   */
  const [read, setRead] = useState<ListRead<Doc> | null>(null);
  const [lastGood, setLastGood] = useState<Doc[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  /**
   * WHAT the failed load should say. Only rendered when `read` is `ok: false`,
   * so it cannot drift out of step with the read itself — but it is a separate
   * string because handleFiles() has to replace the default sentence with one
   * that names the files that WERE saved.
   */
  const [loadErrorAr, setLoadErrorAr] = useState<string>('تعذّرت قراءة المستندات. حاول مرة أخرى لاحقاً.');
  // One banner for every action that can fail on this page — upload, view,
  // download, delete. Renamed from `uploadError` when view/download/delete
  // stopped failing silently, so the name still describes what it holds.
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Reload the list. Returns whether it succeeded, because handleFiles() has
   * to tell two different stories: a list that would not load on its own, and
   * a list that would not refresh *after* files were already uploaded. Only
   * the caller knows which one this is.
   */
  const loadDocs = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      // getDocuments() THROWS on failure rather than returning [] — that is
      // what makes the catch below a real failure branch.
      const data = await getDocuments();
      const mapped = data.map(apiDocToDoc);
      setRead(listOk(mapped));
      setLastGood(mapped);
      return true;
    } catch (err) {
      console.error('[documents] failed to load:', err);
      setLoadErrorAr('تعذّرت قراءة المستندات. حاول مرة أخرى لاحقاً.');
      setRead(listFailed<Doc>());
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  /**
   * Upload a whole selection, then refresh the list.
   *
   * THREE RULES, the same ones attachFiles() in src/hooks/useOrderAttachments.ts
   * settled on, because this input is `multiple` too and each file carries its
   * own independent 60-second ceiling:
   *   1. Every file gets its own try. One failure used to abandon the entire
   *      remainder of the selection and put up a banner that named no file at
   *      all, so a client could not tell which of five documents had landed.
   *   2. Report as we go. setActionError() runs the moment a file fails, so
   *      something is on screen at 60 seconds rather than at N × 60.
   *   3. A timeout — and only a timeout — ends the batch, and the files that
   *      were never attempted are named. A timeout means the link is not
   *      carrying data, so spending another four minutes proving it is itself
   *      the freeze. Every other failure belongs to one file and must not
   *      cancel the rest.
   *
   * The refresh sits AFTER the `finally`, on purpose: the spinner is released
   * the moment the last upload settles, so nothing about the list refresh can
   * hold it. loadDocs() also never throws, and getDocuments() is bounded now
   * (DOCUMENT_OP_TIMEOUT_MS), so neither the spinner nor the skeleton can
   * outlast a hung GET.
   */
  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    if (!isSupabaseMode) {
      setActionError('الوضع التجريبي — رفع المستندات يتطلب ربط قاعدة البيانات (NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase).');
      return;
    }
    // The ceiling and the allowed extensions are checked before a byte leaves
    // the machine, through the same batch gate attachFiles() uses in
    // src/hooks/useOrderAttachments.ts — so both surfaces refuse the same file
    // with the same Arabic sentence. The drop zone needs it more than the
    // button does: the input's `accept` filters the picker only, and a file
    // dragged onto the page never passes through it.
    //
    // Indexed rather than for-of: on a timeout we need the tail of the
    // selection by position, to name what was never attempted.
    const { accepted: files, rejectedMessage } = partitionUploadFiles(Array.from(fileList));
    if (files.length === 0) {
      setActionError(rejectedMessage);
      // Without this the client cannot pick the same file twice — an unchanged
      // value fires no change event, so a corrected file of the same name
      // would land on a dead input.
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const uploaded: string[] = [];
    // Each problem is its own line. Joining with «، » would run the timeout
    // sentence's full stop straight into the next clause («…حاول مجدداً.، لم
    // تتم محاولة رفع…»), which reads as a typo on screen.
    // A part-refused selection carries both stories at once, so the rejection
    // opens the banner and every upload failure is added under it.
    const problems: string[] = rejectedMessage ? [rejectedMessage] : [];

    setUploading(true);
    setActionError(rejectedMessage);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          await uploadDocumentFile(file);
          uploaded.push(file.name);
        } catch (err) {
          problems.push(`${file.name}: ${uploadFailureAr(err)}`);
          if (isUploadTimeoutError(err)) {
            const untried = files.slice(i + 1).map((f) => f.name);
            // If the timeout hit the last file there is no tail, and claiming
            // there is one would be a false sentence on screen.
            if (untried.length > 0) {
              problems.push(`لم تتم محاولة رفع: ${untried.join('، ')} — توقّف الرفع بعد انتهاء المهلة.`);
            }
            setActionError(problems.join('\n'));
            break;
          }
          setActionError(problems.join('\n'));
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }

    if (uploaded.length === 0) return;

    // The files are on the server whatever happens next, so a failed refresh
    // must not be reported as a failed upload. loadDocs() has already put its
    // own «تعذّرت قراءة المستندات» in `loadErrorAr`; replace it with the
    // sentence that is actually true here, and name what was saved so the
    // client knows the work was not lost. The next successful load clears it —
    // `read` becomes `ok: true` and the banner stops rendering.
    const refreshed = await loadDocs();
    if (!refreshed) {
      setLoadErrorAr(`تم رفع: ${uploaded.join('، ')} — لكن تعذّر تحديث قائمة المستندات. أعد المحاولة لعرض ما تم رفعه.`);
    }
  }, [loadDocs]);

  /**
   * Both «عرض» and «تنزيل» need the same signed URL and used to swallow every
   * way of not getting one: `if (url) …` with a console-only catch meant the
   * button did nothing and said nothing. A missing storage_path is separated
   * out from a failed request, so a row that was never stored properly is not
   * reported as a bad connection.
   */
  const resolveFileUrl = useCallback(async (d: Doc, action: 'عرض' | 'تنزيل'): Promise<string | null> => {
    setActionError(null);
    if (!d.storagePath) {
      setActionError(`تعذّر ${action} «${d.name}» — مسار الملف غير متوفر.`);
      return null;
    }
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
      console.error('[documents] signed url failed:', d.storagePath, err);
      setActionError(fileLinkFailureAr(action, d.name, err));
      return null;
    }
  }, []);

  const handleView = useCallback(async (d: Doc) => {
    const url = await resolveFileUrl(d, 'عرض');
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [resolveFileUrl]);

  const handleDownload = useCallback(async (d: Doc) => {
    const url = await resolveFileUrl(d, 'تنزيل');
    if (!url) return;
    const a = window.document.createElement('a');
    a.href = url;
    a.download = d.name;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    window.document.body.appendChild(a);
    a.click();
    a.remove();
  }, [resolveFileUrl]);

  const handleDelete = useCallback(async (d: Doc) => {
    if (!confirm(`حذف المستند «${d.name}»؟ لا يمكن التراجع.`)) return;
    setActionError(null);
    try {
      await deleteDocument(d.id, d.storagePath);
      // Drop the row from BOTH the current read and the last-good snapshot:
      // leaving it in `lastGood` would resurrect a deleted document the next
      // time a refresh failed.
      setRead((prev) => (prev && prev.ok ? listOk(prev.items.filter((x) => x.id !== d.id), prev.total) : prev));
      setLastGood((prev) => (prev ? prev.filter((x) => x.id !== d.id) : prev));
    } catch (err) {
      console.error('[documents] delete failed:', err);
      // A timeout is not a failure: the DELETE may still have been executed
      // after we stopped waiting (see deleteDocument in documentService.ts), so
      // the row is left on screen and the client is told to check rather than
      // told something that may be untrue.
      setActionError(
        isDocumentTimeoutError(err)
          ? `تعذّر تأكيد حذف «${d.name}» — انتهت المهلة قبل وصول ردّ الخادم، وقد يكون الحذف قد تم فعلاً. حدّث الصفحة للتحقق.`
          : `فشل حذف «${d.name}». حاول مرة أخرى.`,
      );
    }
  }, []);

  /**
   * «ترتيب» was a <button> with no onClick — a control that looked like a sort
   * and did nothing. Three orders, cycled by that one button, because each is
   * answerable from data the row already carries and none needs a new query.
   */
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'size'>('newest');
  const SORT_LABEL: Record<typeof sortBy, string> = {
    newest: 'الأحدث',
    name: 'الاسم',
    size: 'الحجم',
  };

  const view = listViewState(loading, read);
  /**
   * The rows on screen. On an unreadable read they are the last list we
   * managed to read — the banner above says so — and on every other branch
   * they are the read itself.
   *
   * THE STALE ROWS KEEP THEIR «عرض» / «تنزيل» / «حذف» BUTTONS, deliberately.
   * Every one of the three acts on a specific `d.id`/`d.storagePath`, so a
   * stale LIST cannot misdirect them: staleness means rows may be MISSING, not
   * that the rows shown point somewhere else. A document deleted from another
   * device is the only mismatch, and that press fails with its own stated
   * Arabic sentence rather than silently. Disabling them would take a working
   * control away over a list problem it does not share — and «حذف» in
   * particular is the button a client reaches for precisely when the page is
   * misbehaving.
   */
  const docs = useMemo(
    () => (view === 'unreadable' ? (lastGood ?? []) : itemsOf(read)),
    [view, lastGood, read],
  );

  const filtered = useMemo(() => {
    const matching = docs.filter(
      (d) => d.name.includes(search) || d.caseRef.includes(search)
    );
    // Copy before sorting: Array.prototype.sort mutates, and `docs` is state.
    return [...matching].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'ar');
      if (sortBy === 'size') return b.sizeBytes - a.sizeBytes;
      // newest first; a row with no timestamp goes last instead of first.
      const at = Number.isNaN(a.uploadedAtMs) ? -Infinity : a.uploadedAtMs;
      const bt = Number.isNaN(b.uploadedAtMs) ? -Infinity : b.uploadedAtMs;
      return bt - at;
    });
  }, [docs, search, sortBy]);

  /** Everything stored, not everything matching the search box. */
  const usedBytes = useMemo(
    () => docs.reduce((total, d) => total + d.sizeBytes, 0),
    [docs],
  );

  /**
   * The same rule the empty state follows: a list we could not read means "we
   * do not know", not "nothing". «٠ بايت» printed under the red banner would
   * be a false total about files that are on the server.
   *
   * STRICTER THAN IT WAS, deliberately. The old test was
   * `!loading && !(error && docs.length === 0)`, so a FAILED REFRESH that still
   * had stale rows printed a total — and the sharpest case of that is the one
   * this page creates itself: upload three files, watch the refresh fail, and
   * the panel states a byte total and a file count that are both missing the
   * three files the client just watched save. A stale number stated as the
   * current one is the defect; «—» is not. The rows themselves stay on screen
   * because a list is self-evidently a list, while «١٠٫٣ ميجابايت» is a claim.
   */
  const storageKnown = view === 'ready' || view === 'empty';

  const uploadReady = isSupabaseMode && !uploading;

  /**
   * The drop zone and the header button drive the one hidden input, so there
   * is a single upload path and a single place where `multiple` and `accept`
   * are declared. The input is `disabled` whenever `uploadReady` is false and
   * a disabled input ignores .click(), so demo mode and an upload in flight
   * both hold here without a second guard.
   */
  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className={`p-6 md:p-8 max-w-[1000px] mx-auto ${isDark ? "text-white" : "text-zinc-900"}`} dir="rtl" suppressHydrationWarning>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight" style={{ fontFamily: 'var(--font-brand)' }}>مستنداتي</h1>
          <p className={`text-sm mt-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>كل ملفاتك ومستنداتك القانونية في مكان واحد آمن</p>
        </div>
        <label className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all shadow-md self-start md:self-auto ${
          isSupabaseMode
            ? "bg-[#0B3D2E] text-white cursor-pointer hover:bg-[#0a3328] hover:-translate-y-0.5 active:scale-95"
            : "bg-zinc-400/30 text-zinc-400 cursor-not-allowed"
        }`}>
          {uploading ? <SpinnerGap size={18} weight="bold" className="animate-spin" /> : <PlusCircle size={18} weight="bold" />}
          رفع مستند جديد
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            disabled={!isSupabaseMode || uploading}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </div>

      {/* Demo-mode gate / failed action (upload, view, download, delete) */}
      {(!isSupabaseMode || actionError) && (
        <div className={`flex items-start gap-3 p-4 mb-6 rounded-2xl border text-sm ${
          isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"
        }`}>
          <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
          {/* whitespace-pre-line: a multi-file batch reports one file per line
              (see handleFiles), and without this they would run together.

              actionError WINS over the standing demo-mode notice. The arms used
              to be the other way round, which was harmless while this banner
              only ever carried upload failures — demo mode refuses those before
              they happen. Now that «عرض», «تنزيل» and «حذف» write here too, the
              old order would have shown the demo sentence while silently
              dropping the failure the client just caused, which is exactly the
              invisible failure this page is being fixed for. With no
              actionError the notice still explains why the upload button is
              disabled. */}
          <span className="whitespace-pre-line">
            {actionError ?? "الوضع التجريبي — رفع المستندات يتطلب ربط قاعدة البيانات (NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase)."}
          </span>
        </div>
      )}

      {/* Load error. Rendered off the read itself, so the banner and the list
          below it can never disagree about whether the library was read. */}
      {view === 'unreadable' && (
        <div className={`flex items-start gap-3 p-4 mb-6 rounded-2xl border text-sm ${
          isDark ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-800"
        }`}>
          <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">
            {loadErrorAr}
            {/* Named only when there is something below to mistake for the
                current library. */}
            {docs.length > 0 && ' ما يظهر أدناه هو آخر قائمة تم تحميلها بنجاح، وقد تكون قديمة.'}
          </span>
          <button
            type="button"
            onClick={() => { void loadDocs(); }}
            disabled={uploading}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition disabled:opacity-40 ${
              isDark ? "border-red-500/30 hover:bg-red-500/10" : "border-red-300 hover:bg-red-100"
            }`}
          >
            <ArrowClockwise size={13} weight="bold" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Upload Drop Zone — the whole box opens the picker, not only the small
          button in the header. It is the largest control on the page and it
          says «اسحب وأفلت», so a client presses it; pressing it used to do
          nothing at all, and nothing on screen sent them back up to the
          header. Keyboard reaches it for the same reason. */}
      <motion.div
        role="button"
        tabIndex={uploadReady ? 0 : -1}
        aria-disabled={!uploadReady}
        aria-label="اختر ملفات للرفع"
        onClick={openFilePicker}
        onKeyDown={(e) => {
          // Space as well as Enter: role="button" promises both, and a native
          // button gives both.
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openFilePicker();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        animate={{
          borderColor: isDragOver ? (isDark ? 'rgba(52, 211, 153, 0.5)' : 'rgba(11,61,46,0.5)') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(228,228,231,1)'),
          backgroundColor: isDragOver ? (isDark ? 'rgba(52, 211, 153, 0.05)' : 'rgba(11,61,46,0.04)') : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(250,250,250,1)')
        }}
        className={`border-2 border-dashed rounded-[2rem] p-10 text-center mb-8 transition-colors outline-none focus-visible:ring-4 focus-visible:ring-[#0B3D2E]/10 ${
          uploadReady ? "cursor-pointer" : "cursor-not-allowed"
        }`}
      >
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors ${
          isDragOver
            ? isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
            : isDark ? "bg-white/5 text-zinc-500" : "bg-zinc-100 text-zinc-400"
        }`}>
          {uploading ? <SpinnerGap size={28} weight="bold" className="animate-spin" /> : <UploadSimple size={28} weight={isDragOver ? "fill" : "regular"} />}
        </div>
        <p className={`text-[15px] font-bold mb-1.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
          {uploading ? "جاري الرفع…" : "اسحب وأفلت الملفات هنا أو اضغط للاختيار"}
        </p>
        <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>PDF، Word، صور — حتى {MAX_UPLOAD_MB_AR} ميجابايت لكل ملف</p>
      </motion.div>

      {/* Search + Sort */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass size={16} className={`absolute right-4 top-1/2 -translate-y-1/2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو القضية المرتبطة…"
            className={`w-full pr-10 pl-4 py-3 text-sm rounded-2xl border outline-none transition-all ${
              isDark 
                ? "bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-[#0B3D2E]" 
                : "bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-[#0B3D2E] focus:ring-4 focus:ring-[#0B3D2E]/5"
            }`}
          />
        </div>
        <button
          type="button"
          onClick={() => setSortBy((v) => (v === 'newest' ? 'name' : v === 'name' ? 'size' : 'newest'))}
          title="اضغط لتغيير الترتيب"
          className={`flex items-center gap-2 px-5 py-3 border rounded-2xl text-sm font-bold transition-colors ${
            isDark 
              ? "border-white/10 text-zinc-400 hover:text-white hover:bg-white/5" 
              : "border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
          }`}>
          <SortAscending size={18} weight="bold" />
          <span className="hidden sm:inline">ترتيب: {SORT_LABEL[sortBy]}</span>
          <span className="sm:hidden">{SORT_LABEL[sortBy]}</span>
        </button>
      </div>

      {/* Doc List */}
      {view === 'loading' ? (
        <SkeletonList count={3} />
      ) : (
      <AnimatePresence mode="popLayout">
        {filtered.length > 0 ? (
          <motion.div key="list" className="space-y-3">
            {filtered.map((doc, i) => (
              <DocRow
                key={doc.id}
                doc={doc}
                index={i}
                isDark={isDark}
                onView={handleView}
                onDownload={handleDownload}
                onDelete={handleDelete}
                busy={uploading}
              />
            ))}
          </motion.div>
        ) : view === 'unreadable' ? (
          // The list could not be read, so an empty `docs` means "we do not
          // know", not "you have none". Printing «لا توجد مستندات» under the
          // red banner would be a false sentence about files that are on the
          // server — including, after a failed post-upload refresh, files the
          // client just watched upload. The banner above says why the list is
          // missing, and carries the retry.
          //
          // The test is now the read's own state rather than
          // `error && docs.length === 0`, which had one gap: a failed refresh
          // that still held stale rows fell through to the ELSE arm, so a
          // search matching none of those stale rows printed «لا توجد مستندات»
          // — the sentence this branch exists to prevent — on a library nobody
          // had managed to read.
          null
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex flex-col items-center py-24 gap-4 text-center rounded-[2.5rem] border border-dashed ${
              isDark ? "border-white/10 bg-white/[0.02]" : "border-zinc-200 bg-zinc-50/50"
            }`}
          >
            <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-inner ${
              isDark ? "bg-white/5 text-zinc-600" : "bg-white border border-zinc-100 text-zinc-300"
            }`}>
              <FolderOpen size={36} weight="duotone" />
            </div>
            <div>
              <p className={`text-lg font-bold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>لا توجد مستندات</p>
              <p className={`text-sm max-w-sm ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>ارفع مستنداتك القانونية لتنظيمها، أو جرب تغيير مصطلح البحث.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      )}

      {/* Storage indicator — the real total, added up from the rows above.
          It used to print «١٠.٣ / ٥٠٠ ميجا», animate the bar to a literal
          2.1% and end on «٤٨٩ ميجا متاحة», all of it fixed text: a client with
          four hundred megabytes stored and a client with none read the same
          three numbers.

          The quota went with them rather than being corrected, because there
          is no quota to correct — nothing on the server holds a client to a
          total (the `documents` bucket sets a per-object limit and no more),
          so a ratio and a «متاحة» line would be promising a ceiling that does
          not exist. What is left is what is true: how much is stored, and how
          many files it is. The bar went too — a bar with no denominator is a
          shape, not a measurement. */}
      <div className={`mt-10 p-6 rounded-[2rem] border transition-colors ${
        isDark ? "bg-zinc-900/50 border-white/10" : "bg-white border-zinc-200"
      }`}>
        <div className="flex items-center justify-between">
          <span className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>مساحة التخزين المشفرة</span>
          <span className={`text-[13px] font-mono font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            {storageKnown ? formatBytesAr(usedBytes) : '—'}
          </span>
        </div>
        {storageKnown && (
          <p className={`text-[11px] font-bold mt-2 ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>
            {docs.length.toLocaleString('ar-EG')} مستند محفوظ
          </p>
        )}
      </div>

    </div>
  );
}
