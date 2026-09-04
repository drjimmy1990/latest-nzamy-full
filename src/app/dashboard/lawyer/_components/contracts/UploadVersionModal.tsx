"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { XCircle, CircleNotch, UploadSimple } from "@phosphor-icons/react";
import {
  uploadContractVersionFile,
  type ContractVersion,
} from "@/lib/services/contractsService";
import { VERSION_LABELS, VERSION_LABEL_AR, type VersionLabel } from "@/lib/services/contractVocabulary";

/**
 * UploadVersionModal.tsx
 * ─────────────────────────────────────────────────────────
 * The bytes go straight from the browser to the `documents` bucket, then the
 * row is registered through the API (uploadContractVersionFile does both —
 * see contractsService.ts). Nothing here touches storage directly.
 */

interface Props {
  contractId: string;
  isDark: boolean;
  onClose: () => void;
  onUploaded: (v: ContractVersion) => void;
}

export default function UploadVersionModal({ contractId, isDark, onClose, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState<VersionLabel>("draft");
  const [notes, setNotes] = useState("");
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;
  const labelCls = `block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`;

  async function handleUpload() {
    if (!file) { setError("اختر ملفاً قبل الرفع."); return; }
    setUploading(true);
    setError(null);
    try {
      const version = await uploadContractVersionFile(contractId, file, { label, notes: notes.trim(), makeCurrent });
      onUploaded(version);
    } catch (err) {
      console.error("[UploadVersionModal] upload failed:", err);
      setError(
        err instanceof Error && err.message
          ? `تعذّر رفع النسخة: ${err.message}`
          : "تعذّر رفع النسخة. تحقّق من الاتصال ثم أعد المحاولة.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !uploading) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>رفع نسخة</h3>
          <button
            onClick={onClose}
            disabled={uploading}
            className={`flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-40 ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}
          >
            <XCircle size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {error && (
            <div className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
              {error}
            </div>
          )}

          <div>
            <label className={labelCls}>الملف <span className="text-red-500">*</span></label>
            <label
              className={`flex items-center gap-2 rounded-xl border border-dashed px-3 py-4 text-[12px] font-semibold cursor-pointer justify-center transition ${
                isDark ? "border-white/[0.15] text-zinc-400 hover:border-[#C8A762]/40" : "border-zinc-300 text-zinc-500 hover:border-[#0B3D2E]/40"
              }`}
            >
              <UploadSimple size={16} />
              {file ? file.name : "اختر ملف PDF أو Word"}
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={uploading}
              />
            </label>
          </div>

          <div>
            <label className={labelCls}>وصف النسخة</label>
            <select value={label} onChange={(e) => setLabel(e.target.value as VersionLabel)} disabled={uploading} className={inputCls}>
              {VERSION_LABELS.map((l) => <option key={l} value={l}>{VERSION_LABEL_AR[l]}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>ملاحظات</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={uploading} className={`${inputCls} resize-none`} />
          </div>

          <label className={`flex items-center gap-2 text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            <input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} disabled={uploading} className="accent-[#0B3D2E]" />
            جعلها النسخة الحالية
          </label>

          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className={`flex items-center justify-center gap-1.5 w-full rounded-xl py-2.5 text-[13px] font-bold transition mt-2 ${
              uploading || !file
                ? isDark ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
            }`}
          >
            {uploading && <CircleNotch size={14} className="animate-spin" />}
            {uploading ? "جارٍ الرفع..." : "رفع النسخة"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
