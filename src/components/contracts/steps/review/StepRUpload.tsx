"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { CloudArrowUp, UploadSimple, Spinner, X, Warning } from "@phosphor-icons/react";
import { CONTRACT_TYPES } from "@/components/contracts/constants";
import type { OrderAttachment } from "@/lib/services/orderIntake";

interface StepRUploadProps {
  isDark: boolean;
  contractType: string;
  setContractType: (type: string) => void;
  attachments: OrderAttachment[];
  uploading: boolean;
  attachError: string;
  attachFile: (file: File) => Promise<OrderAttachment>;
  removeAttachment: (documentId: string) => void;
  clearAttachError: () => void;
}

// Matches the "PDF أو Word (الحد الأقصى 20 م.ب)" copy below — enforced here
// rather than just claimed, since neither documentService.ts nor the
// /api/v1/documents route imposes either limit (Task C3 copy sweep).
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function validateSelectedFile(file: File): string | null {
  if (!/\.(pdf|docx?)$/i.test(file.name)) {
    return "صيغة الملف غير مدعومة — يُقبل PDF أو Word فقط";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "حجم الملف يتجاوز الحد الأقصى (20 م.ب)";
  }
  return null;
}

export function StepRUpload({
  isDark, contractType, setContractType,
  attachments, uploading, attachError, attachFile, removeAttachment, clearAttachError,
}: StepRUploadProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const fileRef = useRef<HTMLInputElement>(null);

  // Files picked but not yet resolved by attachFile() — shown immediately so
  // the client sees the filename without waiting on the network round trip,
  // matching src/components/draft/steps/StepCase.tsx (the one working upload
  // in this codebase). Each entry is removed the instant its attachFile()
  // settles: on success the real row then comes from `attachments`; on
  // failure (attachError, set inside the hook, explains why) the optimistic
  // name simply disappears rather than lingering as if it had worked.
  const [pending, setPending] = useState<{ id: number; name: string }[]>([]);
  const [fileError, setFileError] = useState("");

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setFileError("");
    clearAttachError();
    for (const file of Array.from(fileList)) {
      const problem = validateSelectedFile(file);
      if (problem) { setFileError(problem); continue; }
      const id = Date.now() + Math.random();
      setPending(prev => [...prev, { id, name: file.name }]);
      try {
        await attachFile(file);
      } catch {
        // attachError is set inside the hook and rendered below
      } finally {
        setPending(prev => prev.filter(p => p.id !== id));
      }
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className={`${card} p-5 shadow-sm`}>
        <p className={`text-[13px] font-bold mb-3 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>اختر مجال العقد</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          {CONTRACT_TYPES.map(ct => (
            <button key={ct.id} onClick={() => setContractType(ct.id)}
              className={`rounded-xl border p-3 text-start transition-colors ${contractType === ct.id
                  ? isDark ? "border-[#0B3D2E] bg-[#0B3D2E]/20" : "border-[#0B3D2E] bg-[#0B3D2E]/5"
                  : isDark ? "border-white/[0.08] hover:bg-white/[0.04]" : "border-zinc-200 hover:bg-zinc-50"
                }`}>
              <p className={`text-[12px] font-bold mb-1 ${contractType === ct.id ? "text-[#0B3D2E] dark:text-[#C8A762]" : isDark ? "text-zinc-300" : "text-zinc-700"}`}>{ct.title}</p>
              <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{ct.desc}</p>
            </button>
          ))}
        </div>

        <p className={`text-[13px] font-bold mb-3 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>ارفع ملف العقد (متطلب)</p>
        <div
          onClick={() => { if (!uploading) fileRef.current?.click(); }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (!uploading) handleFiles(e.dataTransfer.files); }}
          className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${uploading ? "opacity-70" : "cursor-pointer"} ${isDark ? "border-white/[0.07] hover:border-[#C8A762]/40 hover:bg-white/[0.02]" : "border-zinc-300 hover:border-[#0B3D2E]/40 hover:bg-zinc-50"
          }`}>
          <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx"
            onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
          <CloudArrowUp size={28} className={`mx-auto mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
          <p className={`text-[14px] font-bold mb-1 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>اسحب وأفلت الملف هنا أو انقر للرفع</p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>PDF أو Word (الحد الأقصى 20 م.ب)</p>
        </div>

        {(fileError || attachError) && (
          <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 p-3 space-y-1">
            {fileError && <p className="flex items-center gap-1.5 text-[11px] text-red-500"><Warning size={12} />{fileError}</p>}
            {attachError && <p className="flex items-center gap-1.5 text-[11px] text-red-500"><Warning size={12} />{attachError}</p>}
          </div>
        )}

        {(attachments.length > 0 || pending.length > 0) && (
          <div className="mt-4 space-y-2">
            {attachments.map(a => (
              <div key={a.documentId} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] ${isDark ? "bg-emerald-900/15 border border-emerald-700/25" : "bg-emerald-50 border border-emerald-200"}`}>
                <UploadSimple size={13} className="text-emerald-500" />
                <span className={`flex-1 truncate ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{a.name}</span>
                <button onClick={() => removeAttachment(a.documentId)}><X size={13} className="text-emerald-500" /></button>
              </div>
            ))}
            {pending.map(p => (
              <div key={p.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] ${isDark ? "bg-white/[0.03] border border-white/[0.08]" : "bg-zinc-50 border border-zinc-200"}`}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                  <Spinner size={13} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                </motion.div>
                <span className={`flex-1 truncate ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{p.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
