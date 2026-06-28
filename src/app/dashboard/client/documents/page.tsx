'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  FileText, FilePdf, FileDoc, UploadSimple, MagnifyingGlass, FolderOpen,
  DownloadSimple, Trash, Eye, PlusCircle, SortAscending, WarningCircle, SpinnerGap,
} from '@phosphor-icons/react';
import { useTheme } from '@/components/ThemeProvider';
import {
  getDocuments,
  uploadDocumentFile,
  getDocumentFileUrl,
  deleteDocument,
  type Document as ApiDocument,
} from '@/lib/services';
import { isSupabaseMode } from '@/lib/services/api';
import { SkeletonList } from '../_components/DashboardSkeleton';

type DocType = 'contract' | 'evidence' | 'official' | 'other';

interface Doc {
  id: string;
  name: string;
  caseRef: string;
  type: DocType;
  size: string;
  uploadedAt: string;
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
    uploadedAt: d.created_at ? new Date(d.created_at).toLocaleDateString('ar-SA') : '',
    format: docFormatFromName(d.file_name),
    storagePath: d.storage_path,
  };
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

      <span className={`hidden sm:inline-flex text-[10px] px-2.5 py-1 rounded-full font-bold border flex-shrink-0 ${
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
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDocuments();
      setDocs(data.map(apiDocToDoc));
    } catch (err) {
      console.error('[documents] failed to load:', err);
      setError('تعذر تحميل المستندات. حاول مرة أخرى لاحقاً.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    if (!isSupabaseMode) {
      setUploadError('الوضع التجريبي — رفع المستندات يتطلب ربط قاعدة البيانات (NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase).');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(fileList)) {
        await uploadDocumentFile(file);
      }
      await loadDocs();
    } catch (err) {
      console.error('[documents] upload failed:', err);
      const msg = err instanceof Error ? err.message : 'فشل رفع الملف.';
      setUploadError(`فشل رفع الملف: ${msg}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [loadDocs]);

  const handleView = useCallback(async (d: Doc) => {
    try {
      const url = await getDocumentFileUrl(d.storagePath ?? '');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[documents] view failed:', err);
    }
  }, []);

  const handleDownload = useCallback(async (d: Doc) => {
    try {
      const url = await getDocumentFileUrl(d.storagePath ?? '');
      if (!url) return;
      const a = window.document.createElement('a');
      a.href = url;
      a.download = d.name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      window.document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('[documents] download failed:', err);
    }
  }, []);

  const handleDelete = useCallback(async (d: Doc) => {
    if (!confirm(`حذف المستند «${d.name}»؟ لا يمكن التراجع.`)) return;
    try {
      await deleteDocument(d.id, d.storagePath);
      setDocs((prev) => prev.filter((x) => x.id !== d.id));
    } catch (err) {
      console.error('[documents] delete failed:', err);
      setUploadError('فشل حذف المستند. حاول مرة أخرى.');
    }
  }, []);

  const filtered = useMemo(() => {
    return docs.filter(
      (d) => d.name.includes(search) || d.caseRef.includes(search)
    );
  }, [docs, search]);

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

      {/* Demo-mode gate / upload error */}
      {(!isSupabaseMode || uploadError) && (
        <div className={`flex items-start gap-3 p-4 mb-6 rounded-2xl border text-sm ${
          isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"
        }`}>
          <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span>
            {!isSupabaseMode
              ? "الوضع التجريبي — رفع المستندات يتطلب ربط قاعدة البيانات (NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase)."
              : uploadError}
          </span>
        </div>
      )}

      {/* Load error */}
      {error && (
        <div className={`flex items-start gap-3 p-4 mb-6 rounded-2xl border text-sm ${
          isDark ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-800"
        }`}>
          <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload Drop Zone */}
      <motion.div
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
        className="border-2 border-dashed rounded-[2rem] p-10 text-center mb-8 transition-colors"
      >
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors ${
          isDragOver
            ? isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
            : isDark ? "bg-white/5 text-zinc-500" : "bg-zinc-100 text-zinc-400"
        }`}>
          {uploading ? <SpinnerGap size={28} weight="bold" className="animate-spin" /> : <UploadSimple size={28} weight={isDragOver ? "fill" : "regular"} />}
        </div>
        <p className={`text-[15px] font-bold mb-1.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
          {uploading ? "جاري الرفع…" : "اسحب وأفلت الملفات هنا"}
        </p>
        <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>PDF، Word، صور — حتى ١٠٠ ميجابايت لكل ملف</p>
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
        <button className={`flex items-center gap-2 px-5 py-3 border rounded-2xl text-sm font-bold transition-colors ${
          isDark 
            ? "border-white/10 text-zinc-400 hover:text-white hover:bg-white/5" 
            : "border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
        }`}>
          <SortAscending size={18} weight="bold" />
          <span className="hidden sm:inline">ترتيب</span>
        </button>
      </div>

      {/* Doc List */}
      {loading ? (
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

      {/* Storage indicator */}
      <div className={`mt-10 p-6 rounded-[2rem] border transition-colors ${
        isDark ? "bg-zinc-900/50 border-white/10" : "bg-white border-zinc-200"
      }`}>
        <div className="flex items-center justify-between mb-3">
          <span className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>مساحة التخزين المشفرة</span>
          <span className={`text-[13px] font-mono font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>١٠.٣ / ٥٠٠ ميجا</span>
        </div>
        <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? "bg-white/10" : "bg-zinc-100"}`}>
          <motion.div
            className="h-full rounded-full bg-gradient-to-l from-[#0B3D2E] to-emerald-500"
            initial={{ width: 0 }}
            animate={{ width: '2.1%' }}
            transition={{ delay: 0.5, duration: 1, type: "spring" }}
          />
        </div>
        <p className={`text-[11px] font-bold mt-2 ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>٤٨٩ ميجا متاحة — أنت في السليم!</p>
      </div>

    </div>
  );
}
