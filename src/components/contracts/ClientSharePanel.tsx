"use client";

import { motion } from "framer-motion";
import { Lock, ShareNetwork, WhatsappLogo, EnvelopeSimple, PaperclipHorizontal } from "@phosphor-icons/react";

interface Props {
  isDark: boolean;
  shareLink: string | null;
  sharePasscode: string | null;
  linkCopied: boolean;
  clientEmail: string;
  clientPhone: string;
  onEmailChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onGenerate: () => void;
  onCopy: () => void;
  onReset: () => void;
}

export default function ClientSharePanel({
  isDark, shareLink, sharePasscode, linkCopied,
  clientEmail, clientPhone,
  onEmailChange, onPhoneChange,
  onGenerate, onCopy, onReset,
}: Props) {
  const inputCls = `w-full rounded-xl border px-3 py-2 text-[12px] outline-none ${
    isDark
      ? "border-white/[0.07] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"
  }`;

  return (
    <div className={`p-5 shadow-sm border-2 rounded-2xl ${isDark ? "bg-zinc-900 border-[#C8A762]/20" : "bg-white border-amber-200/80"}`}>
      <div className="flex items-center gap-2 mb-4">
        <ShareNetwork size={16} className="text-[#C8A762]" weight="duotone" />
        <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>مشاركة مع العميل</p>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"}`}>اختياري</span>
      </div>

      {!shareLink ? (
        <>
          <p className={`text-[12px] mb-3 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            أرسل رابطاً آمناً للعميل لمراجعة واعتماد المستند — محمي بباسكود 6 أرقام
          </p>



          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>بريد العميل</label>
              <input type="email" value={clientEmail} onChange={e => onEmailChange(e.target.value)}
                placeholder="client@example.com" className={inputCls} />
            </div>
            <div>
              <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>رقم واتسآب</label>
              <input type="tel" value={clientPhone} onChange={e => onPhoneChange(e.target.value)}
                placeholder="+966 5X XXX XXXX" className={inputCls} />
            </div>
          </div>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onGenerate}
            className="flex items-center gap-2 rounded-xl bg-[#C8A762] px-4 py-2.5 text-[12px] font-bold text-white w-full justify-center">
            <Lock size={13} weight="fill" /> إنشاء رابط + باسكود
          </motion.button>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className={`rounded-xl p-3 border ${isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
            <p className="text-[10px] text-emerald-500 font-bold mb-1">تم إنشاء الرابط</p>
            <div className="flex items-center gap-2">
              <code className={`flex-1 text-[12px] font-mono truncate ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{shareLink}</code>
              <button onClick={onCopy}
                className={`rounded-lg px-2 py-1 text-[10px] font-bold border ${
                  linkCopied ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"
                }`}>
                {linkCopied ? "✓ نُسخ" : "نسخ"}
              </button>
            </div>
          </div>
          <div className={`flex items-center justify-between rounded-xl p-3 border ${isDark ? "border-[#C8A762]/25 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-center gap-2">
              <Lock size={13} className="text-[#C8A762]" weight="fill" />
              <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الباسكود:</p>
            </div>
            <code className="text-[18px] font-mono font-bold tracking-[0.3em] text-[#C8A762]">{sharePasscode}</code>
          </div>
          <div className="flex gap-2">
            {clientPhone && (
              <a href={`https://wa.me/${clientPhone.replace(/\s|\+/g, "")}?text=${encodeURIComponent(`مرفق لك رابط المستند للاعتماد: ${shareLink}\nالباسكود: ${sharePasscode}`)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white">
                <WhatsappLogo size={13} weight="fill" /> إرسال واتسآب
              </a>
            )}
            {clientEmail && (
              <a href={`mailto:${clientEmail}?subject=مستند للاعتماد — نظامي&body=مرفق رابط المستند: ${shareLink}%0Aالباسكود: ${sharePasscode}`}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-bold border-zinc-300 text-zinc-700">
                <EnvelopeSimple size={13} /> إرسال بريدي
              </a>
            )}
          </div>
          <button onClick={onReset} className={`text-[11px] underline ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            إعادة إنشاء رابط جديد
          </button>
        </motion.div>
      )}
    </div>
  );
}
