"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, ShareNetwork, WhatsappLogo, EnvelopeSimple, Warning } from "@phosphor-icons/react";

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
  /** True while onGenerate()'s real network call is in flight. Optional — a
   *  caller that does not pass it just never shows a loading state. */
  generating?: boolean;
  /** Arabic error from the last failed onGenerate() call, or null. */
  error?: string | null;
}

export default function ClientSharePanel({
  isDark, shareLink, sharePasscode, linkCopied,
  clientEmail, clientPhone,
  onEmailChange, onPhoneChange,
  onGenerate, onCopy, onReset,
  generating = false, error = null,
}: Props) {
  const [codeCopied, setCodeCopied] = useState(false);

  function copyPasscode() {
    if (!sharePasscode) return;
    navigator.clipboard.writeText(sharePasscode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  /**
   * WHY THE PASSCODE IS NOT IN THIS MESSAGE
   *
   * The passcode is a SECOND factor, and a second factor is only a second
   * factor while it travels on a channel separate from the thing it protects.
   * Both share buttons used to send «رابط المستند» and «الباسكود» in one body,
   * which reduced two factors to one for anybody who reads that message.
   *
   * The delivery mechanism made it worse than an ordinary message leak. A
   * `wa.me` / `mailto:` href is a URL: it is opened by the OS share sheet,
   * it lands in the browser's address bar, and it is written to browser
   * history — so the passcode was persisted in plaintext in at least three
   * places outside the conversation, on the LAWYER's device, before the
   * client ever saw it.
   *
   * So the message carries the link and nothing else. The passcode is shown
   * (and copyable) in the panel below, for the lawyer to read out on a call
   * or send from a different app.
   */
  const shareMessage = shareLink
    ? `مرفق لك رابط المستند للاعتماد:\n${shareLink}\n\nلفتح الرابط ستحتاج باسكود من ٦ أرقام يصلك بشكل منفصل.`
    : "";

  const waHref =
    `https://wa.me/${clientPhone.replace(/\s|\+/g, "")}` +
    `?text=${encodeURIComponent(shareMessage)}`;

  // The old mailto put raw Arabic in `subject` and a hand-written `%0A` in an
  // otherwise unencoded `body`. Both parts are encoded once, here, and the
  // newline is a real `\n` inside `shareMessage` so it is not double-escaped.
  const mailHref =
    `mailto:${clientEmail.trim()}` +
    `?subject=${encodeURIComponent("مستند للاعتماد — نظامي")}` +
    `&body=${encodeURIComponent(shareMessage)}`;

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
            أرسل رابطاً آمناً للعميل لمراجعة واعتماد المستند — محمي بباسكود ٦ أرقام
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
          {error && (
            <div className={`rounded-xl p-3 border mb-3 ${isDark ? "border-red-700/30 bg-red-900/10" : "border-red-200 bg-red-50"}`}>
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-red-300" : "text-red-700"}`}>{error}</p>
            </div>
          )}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onGenerate} disabled={generating}
            className="flex items-center gap-2 rounded-xl bg-[#C8A762] px-4 py-2.5 text-[12px] font-bold text-white w-full justify-center disabled:opacity-60">
            <Lock size={13} weight="fill" /> {generating ? "جارٍ الإنشاء..." : "إنشاء رابط + باسكود"}
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

          {/* الباسكود — يُسلَّم بقناة منفصلة عن الرابط */}
          <div className={`rounded-xl p-3 border space-y-2 ${isDark ? "border-[#C8A762]/25 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock size={13} className="text-[#C8A762]" weight="fill" />
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الباسكود:</p>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-[18px] font-mono font-bold tracking-[0.3em] text-[#C8A762]">{sharePasscode}</code>
                <button onClick={copyPasscode}
                  className={`rounded-lg px-2 py-1 text-[10px] font-bold border ${
                    codeCopied ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"
                  }`}>
                  {codeCopied ? "✓ نُسخ" : "نسخ"}
                </button>
              </div>
            </div>
            <div className={`flex items-start gap-2 pt-2 border-t ${isDark ? "border-[#C8A762]/15" : "border-amber-200/70"}`}>
              <Warning size={13} weight="fill" className="text-[#C8A762] flex-shrink-0 mt-0.5" />
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                لا تُرسل الباسكود مع الرابط في نفس الرسالة — فالحماية كلها في فصلهما.
                أرسل الرابط من الأزرار أدناه، وسلّم الباسكود بقناة أخرى (اتصال هاتفي أو رسالة نصية).
                احفظه الآن — لن يُعرض مرة أخرى بعد مغادرة هذه الصفحة.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {clientPhone && (
              <a href={waHref}
                target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white">
                <WhatsappLogo size={13} weight="fill" /> إرسال الرابط بواتسآب
              </a>
            )}
            {clientEmail && (
              <a href={mailHref}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-bold border-zinc-300 text-zinc-700">
                <EnvelopeSimple size={13} /> إرسال الرابط بالبريد
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
