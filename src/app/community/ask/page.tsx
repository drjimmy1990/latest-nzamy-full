"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  PencilSimple, Scales, Briefcase, House, Users, Warning, BookOpen,
  MagnifyingGlass, CaretDown, CheckCircle, ArrowRight, Gavel,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { createCommunityPost } from "@/lib/services/communityService";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Category = "labor" | "commercial" | "civil" | "criminal" | "family" | "real-estate" | "";

const CATEGORIES = [
  { id: "labor" as const, label: "عمالي", labelEn: "Labor Law", icon: Briefcase },
  { id: "commercial" as const, label: "تجاري", labelEn: "Commercial", icon: Scales },
  { id: "civil" as const, label: "مدني", labelEn: "Civil", icon: House },
  { id: "criminal" as const, label: "جنائي", labelEn: "Criminal", icon: Warning },
  { id: "family" as const, label: "أحوال شخصية", labelEn: "Family", icon: Users },
  { id: "real-estate" as const, label: "عقاري", labelEn: "Real Estate", icon: BookOpen },
];

// No «أسئلة مشابهة» list: it was three hardcoded questions, all linking to
// /community/1, shown as «سُئلت من قبل» whenever the category was labour.

export default function AskQuestionPage() {
  const { isRTL, isDark } = useTheme();
  const user = useUser();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("");
  const [isAnon, setIsAnon] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [postedId, setPostedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // /community/lawyers links here with ?tab=lawyers. Read once on mount from
  // the URL (not useSearchParams, which needs a Suspense boundary to build).
  const [lawyersOnly, setLawyersOnly] = useState(false);
  const isGuest = !user.isLoggedIn;

  useEffect(() => {
    setMounted(true);
    try {
      setLawyersOnly(new URLSearchParams(window.location.search).get("tab") === "lawyers");
    } catch {
      /* no query string — a public question */
    }
  }, []);

  const canSubmit = title.trim().length > 10 && category !== "" && !submitting;

  /**
   * Success is shown only for a question the server saved. The old catch
   * («still show success to avoid blocking») told every guest — whom the
   * route answers with a 401 — and every failed request «تم نشر سؤالك»,
   * with a made-up id behind the «افتح صفحة السؤال» button.
   */
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const input = {
        title,
        body,
        category: category as Exclude<Category, "">,
        asker: user.name || "زائر نظامي",
        askerType: user.userType === "lawyer" ? "lawyer" as const : user.isLoggedIn ? "user" as const : "guest" as const,
        isAnonymous: isAnon || isGuest,
        // Read by POST /api/v1/community/posts; accepted from a verified lawyer only.
        visibility: lawyersOnly ? "lawyers_only" : "public",
      };
      const question = await createCommunityPost(input);
      setPostedId(question?.id != null ? String(question.id) : null);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error && err.message ? err.message : "تعذّر نشر السؤال — لم يُحفظ.");
    } finally {
      setSubmitting(false);
    }
  };

  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const card = `rounded-2xl border p-6 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const input = `w-full rounded-xl border px-4 py-3 text-sm outline-none transition focus:border-[#0B3D2E] ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-white placeholder-gray-600" : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"}`;

  if (!mounted) return null;

  if (submitted) {
    return (
      <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4 pt-32 pb-10">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`${card} max-w-md w-full text-center`}>
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={36} color="#22c55e" weight="fill" />
            </div>
            <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "تم نشر سؤالك" : "Your question was posted"}
            </h2>
            {/* No «ستصلك إشعار» here: nothing sends one when an answer is
                added (the answers route records no notification). */}
            <p className={`text-sm mb-6 ${muted}`}>
              {isRTL ? "تظهر الإجابات في صفحة السؤال." : "Answers appear on the question's page."}
            </p>
            <div className="flex flex-col gap-3">
              {isGuest && (
                <Link href="/register" className="w-full py-3 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm">
                  {isRTL ? "سجّل مجاناً لاستلام الإشعار" : "Register for free to get notified"}
                </Link>
              )}
              <Link href="/community" className={`w-full py-3 rounded-xl text-sm font-semibold border ${isDark ? "border-[#2d3748] text-gray-300" : "border-gray-200 text-gray-600"}`}>
                {isRTL ? "عد للمجتمع" : "Back to Community"}
              </Link>
              {postedId && (
                <button
                  onClick={() => router.push(`/community/${encodeURIComponent(postedId)}`)}
                  className="w-full py-3 rounded-xl text-sm font-bold bg-[#C8A762] text-[#0B3D2E]"
                >
                  {isRTL ? "افتح صفحة السؤال" : "Open question"}
                </button>
              )}
            </div>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      {/* pt-32 clears the fixed z-50 Navbar — same convention as /laws. */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 pt-32 pb-10">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Link href="/community" className={`text-sm ${muted} hover:text-[#0B3D2E] dark:hover:text-[#C8A762] transition`}>
              {isRTL ? "المجتمع" : "Community"}
            </Link>
            <ArrowRight size={12} color={isDark ? "#6b7280" : "#9ca3af"} className={isRTL ? "rotate-180" : ""} />
            <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>{isRTL ? "اطرح سؤالاً" : "Ask a Question"}</span>
          </div>
          <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>
            {isRTL ? "اطرح سؤالاً قانونياً" : "Ask a Legal Question"}
          </h1>
          {/* «يمكنك السؤال بدون تسجيل — سؤال واحد مجاني/يوم» was not true:
              the posts route needs a session. */}
          {isGuest && (
            <p className={`text-sm mt-1.5 ${muted}`}>
              {isRTL ? "نشر السؤال يتطلّب تسجيل الدخول." : "Posting a question requires signing in."}{" "}
              <Link href="/login" className="font-semibold text-[#0B3D2E] dark:text-[#C8A762] hover:underline">
                {isRTL ? "تسجيل الدخول" : "Sign in"}
              </Link>
            </p>
          )}
          {lawyersOnly && (
            <p className={`text-sm mt-2 flex items-center gap-1.5 ${isDark ? "text-[#C8A762]" : "text-amber-800"}`}>
              <Gavel size={14} weight="fill" />
              {isRTL ? "يُنشر هذا الموضوع في مجتمع المحامين (للمحامين الموثّقين)." : "This topic is posted to the lawyers' community (verified lawyers)."}
            </p>
          )}
        </div>

        <div className="space-y-5">

          {/* Category */}
          <div className={card}>
            <label className={`block text-sm font-bold mb-3 ${isDark ? "text-zinc-200" : "text-gray-700"}`}>
              {isRTL ? "١. اختر التخصص" : "1. Choose Category"} <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const active = category === cat.id;
                return (
                  <button key={cat.id} onClick={() => setCategory(cat.id)} className={`flex flex-col items-center gap-2 rounded-xl border py-3 px-2 text-xs font-medium transition-all ${active ? "bg-[#0B3D2E] text-white border-[#0B3D2E]" : `${isDark ? "border-[#2d3748] text-gray-400 hover:border-[#0B3D2E]/40" : "border-gray-200 text-gray-500 hover:border-[#0B3D2E]/30"}`}`}>
                    <Icon size={20} weight={active ? "fill" : "regular"} />
                    {isRTL ? cat.label : cat.labelEn}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className={card}>
            <label className={`block text-sm font-bold mb-3 ${isDark ? "text-zinc-200" : "text-gray-700"}`}>
              {isRTL ? "٢. عنوان السؤال" : "2. Question Title"} <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={isRTL ? "مثال: هل يحق لصاحب العمل فصلي بدون سبب؟" : "e.g. Can my employer fire me without a reason?"}
              className={input}
              maxLength={200}
            />
            <div className={`flex items-center justify-between mt-2 text-xs ${muted}`}>
              <span>{isRTL ? "الحد الأدنى ١٠ أحرف" : "Minimum 10 characters"}</span>
              <span>{title.length}/200</span>
            </div>

          </div>

          {/* Body (optional) */}
          <div className={card}>
            <label className={`block text-sm font-bold mb-3 ${isDark ? "text-zinc-200" : "text-gray-700"}`}>
              {isRTL ? "٣. التفاصيل (اختياري)" : "3. Details (optional)"}
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={isRTL ? "اشرح وضعك بمزيد من التفاصيل لتحصل على إجابة أدق..." : "Explain your situation in more detail for a more accurate answer..."}
              rows={4}
              className={`${input} resize-none`}
              maxLength={2000}
            />
            <div className={`flex justify-end mt-1 text-xs ${muted}`}>{body.length}/2000</div>
          </div>

          {/* Anonymous toggle */}
          <div className={`${card} flex items-center justify-between gap-4`}>
            <div>
              <p className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-gray-700"}`}>
                {isRTL ? "نشر كمجهول" : "Post Anonymously"}
              </p>
              <p className={`text-xs mt-0.5 ${muted}`}>
                {isRTL ? "سيظهر اسمك كـ \"مستخدم مجهول\" بدون رابط لبروفايلك" : "Your name will appear as \"Anonymous User\" without a profile link"}
              </p>
            </div>
            <button onClick={() => setIsAnon(v => !v)} className={`relative w-12 h-6 rounded-full transition-colors ${isAnon ? "bg-[#0B3D2E]" : isDark ? "bg-[#2d3748]" : "bg-gray-200"}`}>
              <motion.span animate={{ x: isAnon ? (isRTL ? -24 : 24) : 4 }} initial={false} transition={{ type: "spring", stiffness: 500, damping: 30 }} className="absolute top-1 start-1 w-4 h-4 rounded-full bg-white shadow-sm" />
            </button>
          </div>

          {/* Guest note */}
          {isGuest && (
            <div className={`rounded-xl border border-dashed p-4 text-center text-sm ${isDark ? "border-white/10" : "border-gray-200"}`}>
              <p className={muted}>
                {isRTL ? "🔔 سجّل مجاناً لاستلام إشعار عند الإجابة + المزيد من الأسئلة" : "🔔 Register for free to get notified + ask more questions"}
              </p>
              <Link href="/register" className="inline-block mt-2 text-xs text-[#0B3D2E] dark:text-[#C8A762] font-semibold hover:underline">
                {isRTL ? "سجّل مجاناً" : "Register for free"} →
              </Link>
            </div>
          )}

          {submitError && (
            <p role="alert" className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Warning size={16} weight="fill" className="shrink-0" /> {submitError}
            </p>
          )}

          {/* Submit */}
          <motion.button
            onClick={handleSubmit}
            disabled={!canSubmit}
            whileHover={canSubmit ? { scale: 1.02 } : {}}
            whileTap={canSubmit ? { scale: 0.98 } : {}}
            className={`w-full py-4 rounded-2xl text-base font-bold transition-all ${canSubmit ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328]" : isDark ? "bg-white/5 text-gray-600 cursor-not-allowed" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
          >
            {submitting ? (isRTL ? "جارٍ النشر…" : "Posting…") : (isRTL ? "نشر السؤال" : "Post Question")}
          </motion.button>
        </div>
      </div>

      <Footer />
    </div>
  );
}
