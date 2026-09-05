"use client";

import { motion } from "framer-motion";
import { useState, use } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { LockKey, FileText, DownloadSimple } from "@phosphor-icons/react";

type SharePageProps = {
  params: Promise<{ token: string }>;
};

/**
 * Owner item 174 — the real document-share landing page. Rewritten to match
 * what the server actually returns now: POST /api/v1/share/[token]/verify
 * answers `{ title, url }` (a 300-second signed URL for the shared storage
 * object), not `{ title, document_id }`. There is no document_id to fetch
 * with — a share-link visitor has no Supabase session — so this page's only
 * honest job after a correct passcode is to hand the visitor that URL.
 *
 * The previous version of this page showed a hardcoded «عقد عمل محدد المدة»
 * contract body and fake «اعتماد العقد» / «إرسال الملاحظات» actions for EVERY
 * shared document, regardless of what was actually shared, with no backend
 * behind either action. That is removed: this page shows the real title and
 * a link to the real signed document, nothing it cannot back up.
 */
export default function ClientSharePage({ params }: SharePageProps) {
  const { isDark } = useTheme();
  const { token } = use(params);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [docTitle, setDocTitle] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (verifying) return;
    setVerifying(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/share/${encodeURIComponent(token)}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        setDocTitle(typeof json?.data?.title === "string" ? json.data.title : null);
        setDocUrl(typeof json?.data?.url === "string" ? json.data.url : null);
        setIsAuthenticated(true);
        setError("");
      } else {
        setError(
          typeof json?.error === "string" && json.error
            ? json.error
            : "الرجاء إدخال باسكود صحيح مكون من 6 أرقام",
        );
      }
    } catch {
      setError("تعذر التحقق من الرابط. يرجى المحاولة مرة أخرى.");
    } finally {
      setVerifying(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? "bg-[#0A0A0A]" : "bg-zinc-50"}`}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className={`w-full max-w-sm p-8 text-center shadow-xl ${card}`}>
          <div className={`mx-auto w-16 h-16 flex items-center justify-center rounded-2xl mb-6 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
            <LockKey size={32} className="text-[#C8A762]" weight="duotone" />
          </div>
          <h1 className={`text-xl font-bold mb-2 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>مستند محمي</h1>
          <p className={`text-[13px] mb-6 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            يرجى إدخال رمز المرور (Passcode) المكون من 6 أرقام للوصول إلى المستند المرسل من نظامي.
          </p>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <input
                type="text"
                maxLength={6}
                value={passcode}
                onChange={e => setPasscode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className={`w-full text-center tracking-[0.5em] font-mono text-xl py-3 rounded-xl border outline-none transition-colors ${
                  error ? "border-red-500/50 bg-red-500/5 text-red-500" :
                  isDark ? "border-white/[0.1] bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-700" : "border-zinc-300 bg-zinc-50 text-zinc-800 placeholder:text-zinc-300"
                }`}
              />
              {error && <p className="text-red-500 text-[11px] font-bold mt-2">{error}</p>}
            </div>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit"
              disabled={verifying}
              className="w-full py-3 rounded-xl bg-[#C8A762] text-white font-bold text-[14px] shadow-lg shadow-[#C8A762]/20 disabled:opacity-60">
              {verifying ? "جارٍ التحقق..." : "فتح المستند"}
            </motion.button>
          </form>
          <p className={`mt-6 text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            مشفر ومحمي بواسطة نظامي للذكاء الاصطناعي القانوني
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? "bg-[#0A0A0A] text-zinc-300" : "bg-zinc-50 text-zinc-800"}`}>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className={`w-full max-w-md p-8 text-center shadow-xl ${card}`}>
        <div className={`mx-auto w-16 h-16 flex items-center justify-center rounded-2xl mb-6 ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}>
          <FileText size={32} className="text-emerald-500" weight="duotone" />
        </div>
        <h1 className={`text-lg font-bold mb-2 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
          {docTitle ?? "مستند مشترك"}
        </h1>
        <p className={`text-[13px] mb-6 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          المستند جاهز — الرابط أدناه صالح لمدة 5 دقائق من الآن.
        </p>
        {docUrl ? (
          <a href={docUrl} target="_blank" rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#C8A762] text-white font-bold text-[14px] shadow-lg shadow-[#C8A762]/20">
            <DownloadSimple size={16} weight="bold" /> فتح المستند
          </a>
        ) : (
          <p className="text-red-500 text-[12px] font-bold">تعذر تجهيز رابط المستند.</p>
        )}
      </motion.div>
    </div>
  );
}
