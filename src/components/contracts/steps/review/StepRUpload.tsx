"use client";

import { useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CloudArrowUp, UploadSimple, Spinner, X, Warning } from "@phosphor-icons/react";
import { CONTRACT_TYPES } from "@/components/contracts/constants";
import type { OrderAttachment } from "@/lib/services/orderIntake";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { AttachmentPreviewButton } from "@/components/attachments/AttachmentPreviewModal";
import { CONTRACT_TEXT_MAX, CONTRACT_TEXT_MIN } from "@/lib/services/orderIntake.contracts";

interface StepRUploadProps {
  isDark: boolean;
  contractType: string;
  setContractType: (type: string) => void;
  attachments: OrderAttachment[];
  uploading: boolean;
  attachError: string;
  attachFiles: (files: FileList | File[]) => Promise<OrderAttachment[]>;
  removeAttachment: (documentId: string) => void;
  clearAttachError: () => void;
  contractText: string;
  setContractText: (text: string) => void;
}

export function StepRUpload({
  isDark, contractType, setContractType,
  attachments, uploading, attachError, attachFiles, removeAttachment, clearAttachError,
  contractText, setContractText,
}: StepRUploadProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const fileRef = useRef<HTMLInputElement>(null);
  const contractLabelId = useId();

  // Files picked but not yet resolved — shown immediately so the client
  // sees the filenames without waiting on the network round trip, matching
  // src/components/draft/steps/StepCase.tsx (the one working upload in this
  // codebase). The whole selection is entered as pending together and
  // cleared together once attachFiles() settles: successes then come from
  // `attachments`, and anything rejected simply disappears rather than
  // lingering as if it had worked — attachError (set inside the hook,
  // rendered below) explains why, and — unlike a per-file attachFile()
  // loop — is never cleared out by a later file in the same batch
  // succeeding (see useOrderAttachments.ts's attachFiles).
  const [pending, setPending] = useState<{ id: number; name: string }[]>([]);
  // Coming back to this step shows the tab that holds what was entered.
  const [tab, setTab] = useState<"file" | "paste">(contractText !== "" && attachments.length === 0 ? "paste" : "file");
  const pastedChars = contractText.trim().length;

  function openFilePicker() {
    if (!uploading) fileRef.current?.click();
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    clearAttachError();
    const files = Array.from(fileList);
    const entries = files.map(file => ({ id: Date.now() + Math.random(), name: file.name }));
    setPending(prev => [...prev, ...entries]);
    try {
      await attachFiles(files);
    } finally {
      const ids = new Set(entries.map(e => e.id));
      setPending(prev => prev.filter(p => !ids.has(p.id)));
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

        <p id={contractLabelId} className={`text-[13px] font-bold mb-3 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>العقد المراد مراجعته<RequiredMark announce /></p>
        <div className="mb-3 flex gap-2" role="tablist" aria-label="طريقة إدخال العقد">
          {([["file", "رفع ملف"], ["paste", "لصق نص العقد"]] as const).map(([id, tabLabel]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`rounded-xl border px-3.5 py-2 text-[12px] font-semibold transition-colors ${tab === id
                ? isDark ? "border-[#C8A762]/50 bg-[#C8A762]/10 text-[#C8A762]" : "border-[#0B3D2E]/40 bg-[#0B3D2E]/5 text-[#0B3D2E]"
                : isDark ? "border-white/[0.07] text-zinc-400 hover:border-white/20" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}>
              {tabLabel}
            </button>
          ))}
        </div>

        {tab === "paste" && (
          <div className="space-y-1.5">
            <textarea value={contractText} onChange={e => setContractText(e.target.value)} rows={10} dir="auto"
              aria-label="نص العقد" placeholder="الصق نص العقد كاملاً هنا"
              className={`w-full resize-y rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed outline-none ${isDark ? "border-white/[0.07] bg-zinc-950 text-zinc-200 placeholder:text-zinc-500" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`} />
            <p className={`text-[11px] ${pastedChars > CONTRACT_TEXT_MAX ? "text-red-500" : isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {pastedChars.toLocaleString("ar-SA")} / {CONTRACT_TEXT_MAX.toLocaleString("ar-SA")}
            </p>
            {pastedChars > 0 && pastedChars < CONTRACT_TEXT_MIN && attachments.length === 0 && (
              <p className="text-[11px] text-amber-500">النص الملصق قصير — الصق العقد كاملاً (١٠٠ حرف على الأقل)</p>
            )}
            {pastedChars > CONTRACT_TEXT_MAX && <p className="text-[11px] text-red-500">نص العقد أطول من ٥٠٬٠٠٠ حرف — ارفعه ملفاً</p>}
          </div>
        )}

        {tab === "file" && (
        <div
          role="button"
          tabIndex={0}
          aria-labelledby={contractLabelId}
          aria-disabled={uploading}
          onClick={openFilePicker}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFilePicker(); } }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (!uploading) handleFiles(e.dataTransfer.files); }}
          className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] ${uploading ? "opacity-70" : "cursor-pointer"} ${isDark ? "border-white/[0.07] hover:border-[#C8A762]/40 hover:bg-white/[0.02]" : "border-zinc-300 hover:border-[#0B3D2E]/40 hover:bg-zinc-50"
          }`}>
          <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx"
            onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
          <CloudArrowUp size={28} className={`mx-auto mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
          <p className={`text-[14px] font-bold mb-1 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>اسحب وأفلت الملف هنا أو انقر للرفع</p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>PDF أو Word (الحد الأقصى 20 م.ب)</p>
        </div>
        )}

        {attachError && (
          <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 p-3 space-y-1">
            <p className="flex items-center gap-1.5 text-[11px] text-red-500"><Warning size={12} />{attachError}</p>
          </div>
        )}

        {(attachments.length > 0 || pending.length > 0) && (
          <div className="mt-4 space-y-2">
            {attachments.map(a => (
              <div key={a.documentId} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] ${isDark ? "bg-emerald-900/15 border border-emerald-700/25" : "bg-emerald-50 border border-emerald-200"}`}>
                <UploadSimple size={13} className="text-emerald-500" />
                <span className={`flex-1 truncate ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{a.name}</span>
                <AttachmentPreviewButton documentId={String(a.documentId)} name={a.name} className="text-emerald-500" />
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
