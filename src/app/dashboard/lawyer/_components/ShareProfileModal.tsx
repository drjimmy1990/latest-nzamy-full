"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  XCircle, Copy, Check, ShareNetwork, DownloadSimple, Info,
  WhatsappLogo, XLogo, LinkedinLogo,
} from "@phosphor-icons/react";
import { copyToClipboard } from "@/lib/services/publicProfileLink";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";
import {
  buildProfileShareTargets,
  PROFILE_SHARE_TEXT,
  profileQrFileName,
  type ProfileShareState,
  type ProfileShareTargetId,
} from "./profileShareTargets";

interface Props {
  onClose: () => void;
  isDark: boolean;
  lawyerName: string;
  /**
   * Whether the profile is published, from `profileShareState`. The profile
   * page passes it (owner Q151: share only a PUBLISHED profile — anything else
   * 404s at /lawyers/[slug]).
   */
  state?: ProfileShareState;
  /**
   * Legacy caller shape: a URL the caller has already cleared through its own
   * gate (the dashboard home's button, behind `canShareProfile`). Ignored when
   * `state` is given.
   */
  url?: string;
}

const TARGET_ICON: Record<ProfileShareTargetId, { Icon: React.ElementType; color: string }> = {
  whatsapp: { Icon: WhatsappLogo, color: "#25d366" },
  x:        { Icon: XLogo,        color: "" }, // follows the text colour, so it stays visible in both themes
  linkedin: { Icon: LinkedinLogo, color: "#0a66c2" },
};

/** The QR, keyed by the URL it encodes, so a stale image never shows under a new link. */
type QrState = { url: string; dataUrl: string | null };

/**
 * «مشاركة الملف المهني» (T28-29b; owner Q151, 2026-10-03).
 *
 * PUBLISHED: the link in a read-only field with a copy button, a QR code of
 * the same link (drawn in the browser by the `qrcode` package — the URL never
 * leaves the page to be encoded — with a PNG download), and WhatsApp / X /
 * LinkedIn share links.
 *
 * NOT PUBLISHED: no link and no QR — the page would answer 404 — but the
 * reason, in the lawyer's terms: verification is the platform's to grant (no
 * button for it), visibility is his own toggle (a link to the editor).
 *
 * UNKNOWN: the professional record could not be read, so nothing is asserted.
 *
 * The read-only field doubles as the manual-copy fallback: when both clipboard
 * tiers fail the field is selected and the hint says to copy it by hand.
 */
export default function ShareProfileModal({ onClose, isDark, lawyerName, state, url }: Props) {
  const resolved: ProfileShareState = state ?? (url ? { kind: "published", url } : { kind: "unknown" });
  const shareUrl = resolved.kind === "published" ? resolved.url : null;

  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [qr, setQr] = useState<QrState | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  // Let «نُسخ» lapse, and cancel the timer if the modal closes first.
  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  // Escape closes, like the backdrop click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The QR is drawn client-side; the library is loaded only when a published
  // link is actually on screen.
  useEffect(() => {
    if (!shareUrl) return;
    let cancelled = false;
    import("qrcode")
      .then((mod) => {
        // `qrcode` is CommonJS: depending on the bundler's interop its
        // functions arrive as named exports or under `default`.
        const toDataURL = typeof mod.toDataURL === "function" ? mod.toDataURL : mod.default.toDataURL;
        return toDataURL(shareUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 480,
          color: { dark: "#0B3D2E", light: "#FFFFFF" },
        });
      })
      .then((dataUrl) => { if (!cancelled) setQr({ url: shareUrl, dataUrl }); })
      .catch(() => { if (!cancelled) setQr({ url: shareUrl, dataUrl: null }); });
    return () => { cancelled = true; };
  }, [shareUrl]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    if (await copyToClipboard(shareUrl)) {
      setCopyState("copied");
    } else {
      setCopyState("failed");
      fieldRef.current?.focus();
      fieldRef.current?.select();
    }
  };

  const name = lawyerName.trim();
  const qrForThisUrl = qr && qr.url === shareUrl ? qr : null;
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const heading = `text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm print:hidden"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-profile-title"
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-royal/5"}`}>
              <ShareNetwork size={20} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-royal"} />
            </div>
            <div className="min-w-0">
              <h3 id="share-profile-title" className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
                مشاركة الملف المهني
              </h3>
              {name && <p className={`text-[12px] truncate ${muted}`}>{name}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}
          >
            <XCircle size={16} />
          </button>
        </div>

        {resolved.kind === "published" && shareUrl && (
          <>
            {/* The link */}
            <label htmlFor="share-profile-url" className={`block mb-1.5 ${heading}`}>
              رابط ملفك العام
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="share-profile-url"
                ref={fieldRef}
                type="text"
                dir="ltr"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className={`flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-[12px] font-mono text-left outline-none ${
                  isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300" : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              />
              <button
                type="button"
                onClick={handleCopy}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 text-[12px] font-bold transition-colors flex-shrink-0 ${
                  copyState === "copied"
                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/40"
                    : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
                }`}
              >
                {copyState === "copied" ? <Check size={14} weight="bold" /> : <Copy size={14} />}
                {copyState === "copied" ? "نُسخ" : "نسخ الرابط"}
              </button>
            </div>
            {copyState === "failed" && (
              <p className={`mt-1.5 text-[11px] font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                تعذّر النسخ تلقائياً — الرابط محدَّد في الحقل أعلاه، انسخه يدوياً.
              </p>
            )}
            <p className={`mt-1.5 text-[11px] leading-relaxed ${muted}`}>
              يفتح الرابط ملفك العام لمن تشاركه معه.
              {BETA_MONOPOLY_MODE && " أما دليل المحامين نفسه فغير مفتوح للتصفّح خلال مرحلة التجربة، فلا يصل أحد إلى ملفك إلا بهذا الرابط."}
            </p>

            {/* The QR code of the same link */}
            <p className={`mt-5 mb-2 ${heading}`}>رمز الاستجابة السريعة (QR)</p>
            <div className={`flex items-center gap-4 rounded-2xl border p-3 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50/60"}`}>
              <div className="w-28 h-28 flex-shrink-0 rounded-xl bg-white p-1.5 flex items-center justify-center">
                {qrForThisUrl?.dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a data: URL drawn in the browser; next/image has nothing to optimise
                  <img src={qrForThisUrl.dataUrl} alt="رمز QR لرابط ملفك العام" className="w-full h-full" />
                ) : (
                  <span className="text-[10px] text-center text-slate-500">
                    {qrForThisUrl ? "تعذّر إنشاء الرمز" : "جارٍ إنشاء الرمز…"}
                  </span>
                )}
              </div>
              <div className="min-w-0 space-y-2">
                <p className={`text-[11px] leading-relaxed ${muted}`}>
                  يفتح رابط ملفك العام نفسه عند مسحه بكاميرا الجوال — للبطاقة أو المكتب أو التوقيع.
                </p>
                {qrForThisUrl?.dataUrl && (
                  <a
                    href={qrForThisUrl.dataUrl}
                    download={profileQrFileName(shareUrl)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                      isDark ? "border-white/[0.1] text-zinc-200 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-white"
                    }`}
                  >
                    <DownloadSimple size={13} weight="bold" /> تنزيل الرمز (PNG)
                  </a>
                )}
              </div>
            </div>

            {/* The message that goes with it */}
            <p className={`mt-5 mb-1.5 ${heading}`}>نص المشاركة</p>
            <p className={`rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed ${isDark ? "border-white/[0.06] bg-white/[0.02] text-zinc-300" : "border-slate-100 bg-slate-50/60 text-slate-600"}`}>
              {PROFILE_SHARE_TEXT}
            </p>

            {/* Share targets */}
            <p className={`mt-5 mb-2 ${heading}`}>مشاركة عبر</p>
            <div className="grid grid-cols-3 gap-2">
              {buildProfileShareTargets(shareUrl).map((target) => {
                const { Icon, color } = TARGET_ICON[target.id];
                return (
                  <a
                    key={target.id}
                    href={target.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-[12px] font-semibold transition-colors ${
                      isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon size={22} weight="fill" color={color || undefined} />
                    {target.label}
                  </a>
                );
              })}
            </div>
          </>
        )}

        {resolved.kind === "unpublished" && (
          <div className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-200 bg-slate-50/60"}`}>
            <div className="flex gap-2.5">
              <Info size={16} weight="duotone" className="flex-shrink-0 mt-0.5 text-[#C8A762]" />
              <div className="min-w-0 space-y-2">
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                  ملفك غير منشور بعد، فلا يوجد رابط لمشاركته.
                </p>
                <p className={`text-[12px] leading-relaxed ${muted}`}>يُنشر الملف العام عند اكتمال الشرطين:</p>
                <ul className={`text-[12px] leading-relaxed space-y-1.5 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                  <li className="flex gap-1.5">
                    <span aria-hidden="true">{resolved.verified ? "✓" : "•"}</span>
                    <span>
                      توثيق حسابك من إدارة المنصة —{" "}
                      {resolved.verified ? "مكتمل." : "لم يكتمل بعد، ويتم من الإدارة ولا يمكن تعديله من لوحتك."}
                    </span>
                  </li>
                  <li className="flex gap-1.5">
                    <span aria-hidden="true">{resolved.visible ? "✓" : "•"}</span>
                    <span>
                      تفعيل خيار «أرغب بالظهور في دليل المحامين» في ملفك —{" "}
                      {resolved.visible ? "مُفعَّل." : "غير مُفعَّل."}
                    </span>
                  </li>
                </ul>
                {!resolved.visible && (
                  <Link
                    href="/dashboard/lawyer/profile/edit"
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-3.5 py-2 text-[12px] font-bold text-[#C8A762] hover:bg-[#092e22] transition-colors"
                  >
                    إعدادات الظهور في ملفك
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {resolved.kind === "no_profile" && (
          <div className={`rounded-2xl border p-4 space-y-2 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-200 bg-slate-50/60"}`}>
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
              لم يُنشأ ملفك المهني بعد، فلا يوجد رابط لمشاركته.
            </p>
            <Link
              href="/dashboard/lawyer/profile/edit"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-3.5 py-2 text-[12px] font-bold text-[#C8A762] hover:bg-[#092e22] transition-colors"
            >
              أنشئ ملفك المهني
            </Link>
          </div>
        )}

        {resolved.kind === "unknown" && (
          <p className={`rounded-2xl border p-4 text-[12px] leading-relaxed ${isDark ? "border-white/[0.06] bg-white/[0.02] text-zinc-300" : "border-slate-200 bg-slate-50/60 text-slate-600"}`}>
            تعذّر التحقق من حالة نشر ملفك المهني، فلا يُعرض رابط للمشاركة.
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
