"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { XCircle, CircleNotch, Lock, Warning, Copy, CheckCircle, Clock } from "@phosphor-icons/react";
import { createShare, type CreateShareResult } from "@/lib/services/shareService";
import { toArabicDigits } from "@/lib/services/arabicCount";

/**
 * ShareDocumentModal.tsx — owner item 174, the lawyer documents page's half.
 *
 * Mounts the real POST /api/v1/share flow (shareService.ts). Nothing here
 * generates a token or a passcode — the server does (shareSecrets.ts), and
 * this modal shows the plaintext passcode exactly once: the row keeps only
 * its hash, so a passcode not copied now is unrecoverable, same rule
 * ClientSharePanel already established for the contracts side of this flow.
 */

interface Props {
  isDark: boolean;
  /** attachments.id — the document row being shared. */
  attachmentId: string;
  /** For the modal header only; not sent — the server falls back to the
   *  attachment's own file name when no title is given. */
  documentName: string;
  onClose: () => void;
}

type ExpiryHours = 24 | 72 | 168 | 720;

const EXPIRY_OPTIONS: ReadonlyArray<{ hours: ExpiryHours; label: string }> = [
  { hours: 24,  label: "٢٤ ساعة" },
  { hours: 72,  label: "٣ أيام" },
  { hours: 168, label: "٧ أيام" },
  { hours: 720, label: "٣٠ يوماً" },
];

/**
 * Fixed-width getters rather than `toLocaleDateString`, so the Arabic-Indic
 * digits are guaranteed regardless of the runtime's ICU data. A share's
 * expiry is a specific promise this screen makes to the lawyer, so it goes
 * through toArabicDigits directly rather than trusting a locale string.
 */
function formatExpiryAr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day   = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year  = d.getFullYear();
  const hh    = String(d.getHours()).padStart(2, "0");
  const mm    = String(d.getMinutes()).padStart(2, "0");
  return toArabicDigits(`${day}/${month}/${year} — ${hh}:${mm}`);
}

export default function ShareDocumentModal({ isDark, attachmentId, documentName, onClose }: Props) {
  const [expiresInHours, setExpiresInHours] = useState<ExpiryHours>(72);
  const [withPasscode,   setWithPasscode]   = useState(true);
  const [creating,       setCreating]       = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [result,         setResult]         = useState<CreateShareResult | null>(null);
  const [linkCopied,     setLinkCopied]     = useState(false);
  const [codeCopied,     setCodeCopied]     = useState(false);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await createShare({ attachmentId, expiresInHours, withPasscode });
      setResult(res);
    } catch (err) {
      // The server (POST /api/v1/share) answers every failure branch with an
      // Arabic `error` string, and apiMutate throws it verbatim as
      // `err.message` — so this is that message, not a translation of it.
      console.error("[ShareDocumentModal] create failed:", attachmentId, err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "تعذّر إنشاء رابط المشاركة. تحقق من اتصالك وحاول مجدداً.",
      );
    } finally {
      setCreating(false);
    }
  }

  const fullLink = result ? `${window.location.origin}${result.url}` : "";

  function copyLink() {
    if (!fullLink) return;
    navigator.clipboard.writeText(fullLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function copyPasscode() {
    if (!result?.passcode) return;
    navigator.clipboard.writeText(result.passcode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200";
  const pillBase = "px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all disabled:opacity-50";
  const pillOff  = isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500";
  const pillOn   = "bg-royal text-white border-royal";
  const copyBtn = (copied: boolean) =>
    `flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold border flex-shrink-0 ${
      copied ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"
    }`;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !creating) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto ${card}`}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5 gap-3">
          <div className="min-w-0">
            <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>مشاركة برابط</h3>
            <p className={`text-[12px] truncate ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{documentName}</p>
          </div>
          <button
            onClick={onClose}
            disabled={creating}
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full disabled:opacity-40 ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}
          >
            <XCircle size={16} />
          </button>
        </div>

        {!result ? (
          <div className="space-y-4">
            {error && (
              <div className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                <Warning size={14} weight="fill" className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className={`flex items-center gap-1.5 text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                <Clock size={13} /> مدة صلاحية الرابط
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {EXPIRY_OPTIONS.map(opt => (
                  <button
                    key={opt.hours}
                    type="button"
                    onClick={() => setExpiresInHours(opt.hours)}
                    disabled={creating}
                    className={`${pillBase} ${expiresInHours === opt.hours ? pillOn : pillOff}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-[12px] font-semibold cursor-pointer ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-700"}`}>
              <span className="flex items-center gap-1.5">
                <Lock size={13} weight={withPasscode ? "fill" : "regular"} className={withPasscode ? "text-royal" : ""} />
                حماية بباسكود
              </span>
              <input
                type="checkbox"
                checked={withPasscode}
                onChange={(e) => setWithPasscode(e.target.checked)}
                disabled={creating}
                className="h-4 w-4 accent-royal"
              />
            </label>

            <button
              onClick={handleCreate}
              disabled={creating}
              className={`flex items-center justify-center gap-1.5 w-full rounded-xl py-2.5 text-[13px] font-bold transition ${
                creating
                  ? isDark ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-royal text-white hover:opacity-90"
              }`}
            >
              {creating && <CircleNotch size={14} className="animate-spin" />}
              {creating ? "جارٍ الإنشاء…" : "إنشاء الرابط"}
            </button>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className={`rounded-xl p-3 border ${isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
              <p className="text-[10px] text-emerald-500 font-bold mb-1">تم إنشاء الرابط</p>
              <div className="flex items-center gap-2">
                <code className={`flex-1 text-[12px] font-mono truncate ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{fullLink}</code>
                <button onClick={copyLink} className={copyBtn(linkCopied)}>
                  {linkCopied ? <CheckCircle size={12} weight="fill" /> : <Copy size={12} />}
                  {linkCopied ? "نُسخ" : "نسخ"}
                </button>
              </div>
            </div>

            {result.passcode ? (
              <div className={`rounded-xl p-3 border space-y-2 ${isDark ? "border-royal/25 bg-royal/5" : "border-blue-200 bg-blue-50"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock size={13} weight="fill" className="text-royal" />
                    <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الباسكود:</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-[18px] font-mono font-bold tracking-[0.3em] text-royal">{result.passcode}</code>
                    <button onClick={copyPasscode} className={copyBtn(codeCopied)}>
                      {codeCopied ? <CheckCircle size={12} weight="fill" /> : <Copy size={12} />}
                      {codeCopied ? "نُسخ" : "نسخ"}
                    </button>
                  </div>
                </div>
                <div className={`flex items-start gap-2 pt-2 border-t ${isDark ? "border-royal/15" : "border-blue-200/70"}`}>
                  <Warning size={13} weight="fill" className="text-royal flex-shrink-0 mt-0.5" />
                  <p className={`text-[11px] leading-relaxed font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    احفظ الباسكود الآن — لن يُعرض مرة أخرى
                  </p>
                </div>
              </div>
            ) : (
              <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <Warning size={13} weight="fill" className="flex-shrink-0 mt-0.5" />
                <span>هذا الرابط بلا باسكود — أي شخص يحصل عليه يمكنه فتحه مباشرة.</span>
              </div>
            )}

            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              ينتهي الرابط في: <span className="font-bold">{formatExpiryAr(result.expiresAt)}</span>
            </p>

            <button
              onClick={onClose}
              className={`w-full rounded-xl py-2 text-[12px] font-bold border ${isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              إغلاق
            </button>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
