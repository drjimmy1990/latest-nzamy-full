"use client";
// ─── GamificationCard ──────────────────────────────────────────────────────────
// Reading-activity stats — read-only here. preferences.readingActivity for a
// signed-in user (Phase 6, getPreferences); the browser for a guest. Every
// number this card renders is one it actually read: a reader with no
// activity yet sees real zeros, never a placeholder substitute.

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Books, BookOpen, Gavel, Notebook, ShareNetwork, Lightning,
  Sparkle, DownloadSimple, WhatsappLogo, Copy, X
} from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { isSupabaseMode } from "@/lib/services/api";
import { getPreferences } from "@/lib/services/preferencesService";
import { EMPTY_READING_ACTIVITY, type ReadingActivity } from "@/lib/services/readingActivityStats";

// ── guest (local) read ──────────────────────────────────────────────────────
function loadLocalActivity(): ReadingActivity {
  if (typeof window === "undefined") return EMPTY_READING_ACTIVITY;
  try {
    const raw = localStorage.getItem("nzamy_activity");
    if (!raw) return EMPTY_READING_ACTIVITY;
    return { ...EMPTY_READING_ACTIVITY, ...JSON.parse(raw) };
  } catch {
    return EMPTY_READING_ACTIVITY;
  }
}

/** readingActivity from preferences for a signed-in user; the browser for a guest. */
function useReadingActivity(): { data: ReadingActivity | null; ready: boolean } {
  const { isLoggedIn, loading: authLoading } = useUser();
  const [data, setData]   = useState<ReadingActivity | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (authLoading) return; // wait for the session to settle before deciding guest vs. signed-in
    let cancelled = false;
    if (isLoggedIn && isSupabaseMode) {
      getPreferences().then(prefs => {
        if (cancelled) return;
        setData(prefs?.readingActivity ?? EMPTY_READING_ACTIVITY);
        setReady(true);
      });
    } else {
      setData(loadLocalActivity());
      setReady(true);
    }
    return () => { cancelled = true; };
  }, [isLoggedIn, authLoading]);

  return { data, ready };
}

function drawShareCard(
  canvas: HTMLCanvasElement,
  data: {
    percentage: number;
    currentRead: number;
    target: number;
    lawsCount: number;
    articlesCount: number;
    principlesCount: number;
    feqhCount: number;
    view: "week" | "month";
    isRTL: boolean;
  }
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  // Premium Font Family — next/font scopes the real Cairo family behind the
  // --font-cairo variable, so resolve it at draw time; canvas cannot read CSS vars.
  const cairoResolved =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--font-cairo").trim()
      : "";
  const fontFam = `${cairoResolved ? `${cairoResolved}, ` : ""}Cairo, Tajawal, system-ui, -apple-system, sans-serif`;

  // 1. Draw Royal Green Gradient background
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0E3A2F");
  grad.addColorStop(1, "#071F19");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 2. Draw border gold line
  ctx.strokeStyle = "#C8A762";
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // Inner decorative border
  ctx.strokeStyle = "rgba(200, 167, 98, 0.15)";
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  // 3. Draw Header
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 26px ${fontFam}`;
  ctx.textAlign = data.isRTL ? "right" : "left";
  const titleX = data.isRTL ? w - 50 : 50;
  ctx.fillText(data.isRTL ? "نشاطك القانوني المعتمد" : "Your Verified Legal Activity", titleX, 55);

  ctx.fillStyle = "#C8A762";
  ctx.font = `14px ${fontFam}`;
  ctx.fillText(
    data.isRTL
      ? "لوحة التفاعل والتحصيل المعرفي - منصة نظامي"
      : "Gamified Knowledge Panel - Nzamy Platform",
    titleX,
    85
  );

  // Divider line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 110);
  ctx.lineTo(w - 40, 110);
  ctx.stroke();

  // 4. Progress circle on the left
  const cx = 180;
  const cy = 270;
  const r = 80;

  // Background circle
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();

  // Draw segments
  const total = data.currentRead > 0 ? data.currentRead : 1;
  const percentage = data.percentage;
  const lawsShare = (data.lawsCount / total) * percentage;
  const articlesShare = (data.articlesCount / total) * percentage;
  const principlesShare = (data.principlesCount / total) * percentage;
  const feqhShare = (data.feqhCount / total) * percentage;

  let currentAngle = -0.5 * Math.PI;

  const drawSegment = (share: number, color: string) => {
    if (share <= 0) return;
    const angle = (share / 100) * 2 * Math.PI;
    ctx.strokeStyle = color;
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r, currentAngle, currentAngle + angle);
    ctx.stroke();
    currentAngle += angle;
  };

  drawSegment(lawsShare, "#10b981");
  drawSegment(articlesShare, "#3b82f6");
  drawSegment(principlesShare, "#a855f7");
  drawSegment(feqhShare, "#C8A762");

  // Central Text inside progress circle
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 32px ${fontFam}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${percentage}%`, cx, cy - 10);

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `bold 12px ${fontFam}`;
  const periodLabel = data.isRTL
    ? (data.view === "week" ? "هدف الأسبوع" : "هدف الشهر")
    : (data.view === "week" ? "Weekly Target" : "Monthly Target");
  ctx.fillText(`${data.currentRead} / ${data.target}`, cx, cy + 20);
  ctx.fillText(periodLabel, cx, cy + 35);

  // 5. Drawing Stats list on the right
  const startX = 350;
  let startY = 160;
  const rowHeight = 65;

  const stats = [
    { label: data.isRTL ? "أنظمة وقوانين استعرضتها" : "Laws & Regulations", val: data.lawsCount, color: "#10b981" },
    { label: data.isRTL ? "مواد وتفصيلات قرأتها" : "Articles Opened", val: data.articlesCount, color: "#3b82f6" },
    { label: data.isRTL ? "مبادئ وقرارات قضائية" : "Principles & Precedents", val: data.principlesCount, color: "#a855f7" },
    { label: data.isRTL ? "كتب ومراجع فقهية" : "Feqh Books & Pages", val: data.feqhCount, color: "#C8A762" },
  ];

  stats.forEach(s => {
    ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(startX, startY, 400, rowHeight - 12, 10) : ctx.rect(startX, startY, 400, rowHeight - 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(startX + 15, startY + 12, 26, 26, 6) : ctx.rect(startX + 15, startY + 12, 26, 26);
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 15px ${fontFam}`;
    ctx.textAlign = data.isRTL ? "right" : "left";
    ctx.fillText(s.label, data.isRTL ? startX + 380 : startX + 55, startY + 28);

    ctx.fillStyle = s.color;
    ctx.font = `bold 20px ${fontFam}`;
    ctx.textAlign = data.isRTL ? "left" : "right";
    ctx.fillText(s.val.toString(), data.isRTL ? startX + 25 : startX + 380, startY + 28);

    startY += rowHeight;
  });

  // Note: this card used to also draw a "+12%/+18% vs last period" badge and
  // a "4-day streak" line here. Neither figure was ever computed from real
  // data — no previous-period baseline or daily-streak counter exists in
  // readingActivity — so both were invented on every render. Removed rather
  // than wired up: the platform tracks no history to compute either from yet.

  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  ctx.font = `11px ${fontFam}`;
  ctx.textAlign = "center";
  ctx.fillText("صنع بفخر في منصة نظامي القانونية | nezamy.sa", w / 2, h - 30);
}

export function GamificationCard({ isRTL, isDark }: { isRTL: boolean; isDark: boolean }) {
  const [view, setView] = useState<"week" | "month">("week");
  const { data, ready } = useReadingActivity();
  const [showShare, setShowShare] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // Nothing to render until the read (server or local) has resolved. When it
  // has and there is genuinely no activity yet, `data` holds real zeros —
  // rendered as-is below, never swapped for a placeholder.
  if (!ready || !data) return null;

  const lawsCount = view === "week" ? data.lawsThisWeek : data.lawsThisMonth;
  const articlesCount = data.articles;
  const principlesCount = data.principles;
  const feqhCount = data.feqhPages;

  const currentRead = lawsCount + articlesCount + principlesCount + feqhCount;
  const target = view === "week" ? 25 : 80;
  const percentage = Math.min(Math.round((currentRead / target) * 100), 100);

  const radius = 41;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;

  const totalCount = currentRead > 0 ? currentRead : 1;
  const lawsShare = (lawsCount / totalCount) * percentage;
  const articlesShare = (articlesCount / totalCount) * percentage;
  const principlesShare = (principlesCount / totalCount) * percentage;
  const feqhShare = (feqhCount / totalCount) * percentage;

  const rot1 = -90;
  const rot2 = rot1 + (lawsShare / 100) * 360;
  const rot3 = rot2 + (articlesShare / 100) * 360;
  const rot4 = rot3 + (principlesShare / 100) * 360;

  const stats = [
    {
      icon: Books,
      value: lawsCount,
      label: isRTL ? "نظام استعرضته" : "Laws Browsed",
      color: isDark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-700",
    },
    {
      icon: BookOpen,
      value: articlesCount,
      label: isRTL ? "ماده قانونية" : "Articles Opened",
      color: isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-50 text-blue-700",
    },
    {
      icon: Gavel,
      value: principlesCount,
      label: isRTL ? "مبدأ قضائي" : "Principles Read",
      color: isDark ? "bg-purple-900/30 text-purple-400" : "bg-purple-50 text-purple-700",
    },
    {
      icon: Notebook,
      value: feqhCount,
      label: isRTL ? "صفحة فقهية" : "Feqh Pages",
      color: isDark ? "bg-amber-900/30 text-amber-400" : "bg-amber-50 text-amber-700",
    },
  ];

  const getShareText = () => {
    const period = isRTL ? (view === "week" ? "هذا الأسبوع" : "هذا الشهر") : (view === "week" ? "this week" : "this month");
    return isRTL
      ? `⚡ أنجزت قراءة وتحصيل ${percentage}% من هدفي المعتمد ${period} في منصة نظامي القانونية!\n📊 إحصائيات النشاط:\n📚 استعراض الأنظمة: ${lawsCount}\n⚖️ قراءة المواد: ${articlesCount}\n🔨 المبادئ القضائية: ${principlesCount}\n📖 الصفحات الفقهية: ${feqhCount}\n🔗 تصفح المكتبة الآن: https://nezamy.sa/laws`
      : `⚡ I achieved ${percentage}% of my legal reading target ${period} on Nzamy Platform!\n📊 Stats:\n📚 Laws: ${lawsCount} | ⚖️ Articles: ${articlesCount} | 🔨 Principles: ${principlesCount} | 📖 Feqh Pages: ${feqhCount}\n🔗 Visit: https://nezamy.sa/laws`;
  };

  const copyToClipboard = async () => {
    const text = getShareText();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      alert(text);
    }
  };

  const shareToWhatsapp = () => {
    const text = getShareText();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const base  = isDark ? "bg-gradient-to-b from-[#161b22] to-[#0c0f12] border-white/[0.07]" : "bg-white border-slate-200 shadow-sm";
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border p-5 ${base} flex flex-col h-auto justify-between`}
        dir={isRTL ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className="flex flex-col gap-3 mb-4 w-full">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-xl shrink-0 ${isDark ? "bg-[#0B3D2E]/40 text-[#C8A762]" : "bg-emerald-50 text-[#0B3D2E]"}`}>
              <Lightning size={18} weight="fill" />
            </div>
            <div>
              <span className={`text-sm font-black block ${isDark ? "text-white" : "text-gray-900"}`}>
                {isRTL ? "نشاطك القانوني المعتمد" : "Your Legal Activity"}
              </span>
              <span className={`text-[10px] leading-tight block ${muted}`}>
                {isRTL ? "لوحة التفاعل والتحصيل المعرفي" : "Gamified knowledge panel"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-1.5 w-full">
            {/* Week/Month toggle */}
            <div className={`flex p-0.5 rounded-xl gap-0.5 items-center h-8 ${isDark ? "bg-white/5 border border-white/[0.04]" : "bg-gray-100"}`}>
              {(["week", "month"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 h-6 rounded-lg text-[10px] font-bold transition-all duration-200 flex items-center justify-center ${
                    view === v
                      ? isDark ? "bg-white/10 text-white shadow-sm" : "bg-white text-gray-900 shadow-sm"
                      : `${muted} hover:text-gray-700 dark:hover:text-gray-300`
                  }`}>
                  {isRTL ? (v === "week" ? "الأسبوع" : "الشهر") : (v === "week" ? "Week" : "Month")}
                </button>
              ))}
            </div>

            {/* Share Button */}
            <button onClick={() => setShowShare(true)}
              className={`flex items-center justify-center gap-1.5 px-3 h-8 rounded-xl text-[10px] font-bold border transition-all duration-200 ${
                isDark ? "bg-white/5 border-white/[0.06] text-gray-300 hover:bg-white/10 hover:text-white" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}>
              <ShareNetwork size={12} weight="fill" />
              {isRTL ? "مشاركة" : "Share"}
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-col items-center gap-4 flex-1 my-2">
          {/* Circular Progress Meter */}
          <div className="flex flex-col items-center justify-center w-full pb-4 border-b border-dashed border-gray-200 dark:border-white/[0.07] px-2 py-1">
            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  className={isDark ? "stroke-white/5" : "stroke-slate-100"}
                  strokeWidth={strokeWidth}
                  fill="transparent"
                />
                {lawsShare > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="stroke-[#0B3D2E] dark:stroke-emerald-500"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - (lawsShare / 100) * circumference}
                    strokeLinecap="round"
                    transform={`rotate(${rot1} 50 50)`}
                    style={{ transition: "stroke-dashoffset 0.8s ease-in-out" }}
                  />
                )}
                {articlesShare > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="stroke-blue-500 dark:stroke-blue-400"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - (articlesShare / 100) * circumference}
                    strokeLinecap="round"
                    transform={`rotate(${rot2} 50 50)`}
                    style={{ transition: "stroke-dashoffset 0.8s ease-in-out" }}
                  />
                )}
                {principlesShare > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="stroke-purple-500 dark:stroke-purple-400"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - (principlesShare / 100) * circumference}
                    strokeLinecap="round"
                    transform={`rotate(${rot3} 50 50)`}
                    style={{ transition: "stroke-dashoffset 0.8s ease-in-out" }}
                  />
                )}
                {feqhShare > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="stroke-[#C8A762]"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - (feqhShare / 100) * circumference}
                    strokeLinecap="round"
                    transform={`rotate(${rot4} 50 50)`}
                    style={{ transition: "stroke-dashoffset 0.8s ease-in-out" }}
                  />
                )}
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className={`text-xl font-black tracking-tight leading-none ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                  {percentage}%
                </span>
                <span className={`text-[8px] mt-1.5 font-semibold uppercase tracking-wider ${muted}`}>
                  {currentRead} / {target} {isRTL ? "مادة" : "Read"}
                </span>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2 w-full">
            {stats.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex items-center gap-2 p-2 rounded-xl border transition-all duration-200 hover:scale-[1.02] ${
                    isDark
                      ? "bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08]"
                      : "bg-slate-50/50 border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                  }`}
                >
                  <div className={`p-1.5 rounded-lg shrink-0 ${s.color.split(" ")[0]}`}>
                    <Icon size={14} className={s.color.split(" ")[1]} weight="duotone" />
                  </div>
                  <div className="text-start min-w-0">
                    <p className={`text-xs font-black leading-none mb-1 tracking-tight tabular-nums ${isDark ? "text-white" : "text-gray-900"}`}>
                      {s.value}
                    </p>
                    <p className={`text-[9px] leading-tight truncate ${muted}`}>{s.label}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Encouragement Footer */}
        <div className={`mt-3 pt-2 border-t border-dashed text-center text-[9px] flex items-center justify-center gap-1 ${isDark ? "border-white/10" : "border-slate-100"} ${muted}`}>
          <Sparkle size={10} weight="fill" className="text-amber-500 animate-pulse" />
          <span>
            {isRTL
              ? "استمر في القراءة والتحصيل لترقية إنتاجيتك واستعراض مراجع أكثر في المكتبة"
              : "Continue reading to increase your productivity and explore more library resources"}
          </span>
        </div>
      </motion.div>

      {/* Share Modal Backdrop & Frame */}
      <AnimatePresence>
        {showShare && (
          <ShareCardModal
            isDark={isDark}
            isRTL={isRTL}
            view={view}
            percentage={percentage}
            currentRead={currentRead}
            target={target}
            lawsCount={lawsCount}
            articlesCount={articlesCount}
            principlesCount={principlesCount}
            feqhCount={feqhCount}
            copiedText={copiedText}
            onCopy={copyToClipboard}
            onWhatsapp={shareToWhatsapp}
            onClose={() => setShowShare(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Modal Component for Canvas Card Drawing and Actions ──────────────────────
function ShareCardModal({
  isDark, isRTL, view, percentage, currentRead, target, lawsCount,
  articlesCount, principlesCount, feqhCount, copiedText, onCopy, onWhatsapp, onClose
}: {
  isDark: boolean;
  isRTL: boolean;
  view: "week" | "month";
  percentage: number;
  currentRead: number;
  target: number;
  lawsCount: number;
  articlesCount: number;
  principlesCount: number;
  feqhCount: number;
  copiedText: boolean;
  onCopy: () => void;
  onWhatsapp: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      drawShareCard(canvas, {
        percentage,
        currentRead,
        target,
        lawsCount,
        articlesCount,
        principlesCount,
        feqhCount,
        view,
        isRTL
      });
    }
  }, [percentage, currentRead, target, lawsCount, articlesCount, principlesCount, feqhCount, view, isRTL]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `nzamy-activity-${view}.png`;
    link.href = url;
    link.click();
  };

  const bg = isDark ? "bg-[#0c0f12] border-white/[0.08]" : "bg-white border-slate-200 shadow-2xl";
  const btnSec = isDark ? "bg-white/5 border-white/10 hover:bg-white/10 text-white" : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700";

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md" />
      
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-xl rounded-[2rem] border overflow-hidden p-6 flex flex-col items-center ${bg}`}
        dir={isRTL ? "rtl" : "ltr"}
      >
        {/* Close */}
        <div className="w-full flex items-center justify-between mb-4">
          <span className={`text-xs font-black ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            {isRTL ? "تصدير ومشاركة النشاط" : "Export & Share Activity"}
          </span>
          <button onClick={onClose} className={`p-2 rounded-xl transition ${isDark ? "hover:bg-white/5 text-zinc-500" : "hover:bg-slate-100 text-slate-400"}`}><X size={15} /></button>
        </div>

        {/* Canvas Display (Hidden visually but scaled inside frame) */}
        <div className="relative border border-white/5 dark:border-black/20 rounded-2xl overflow-hidden shadow-2xl w-full mb-5 aspect-[1.6]">
          <canvas
            ref={canvasRef}
            width={800}
            height={500}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Share buttons */}
        <div className="flex flex-col sm:flex-row gap-3 w-full justify-center mt-2">
          {/* Download Image */}
          <button
            onClick={handleDownload}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-black bg-[#0B3D2E] text-white hover:bg-[#0a3226] transition flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/20"
          >
            <DownloadSimple size={15} weight="bold" />
            <span>{isRTL ? "تحميل كصورة PNG" : "Download PNG"}</span>
          </button>

          {/* Share on WhatsApp */}
          <button
            onClick={onWhatsapp}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-black bg-[#25D366] text-white hover:bg-[#20bd5a] transition flex items-center justify-center gap-1.5 shadow-lg shadow-green-950/20"
          >
            <WhatsappLogo size={15} weight="fill" />
            <span>{isRTL ? "مشاركة عبر واتساب" : "WhatsApp"}</span>
          </button>

          {/* Copy Text Summary */}
          <button
            onClick={onCopy}
            className={`flex-1 py-3 px-4 rounded-xl text-xs font-black border transition flex items-center justify-center gap-1.5 ${btnSec}`}
          >
            <Copy size={15} />
            <span>{copiedText ? (isRTL ? "تم نسخ الملخص!" : "Copied Text!") : (isRTL ? "نسخ الملخص النصي" : "Copy Text")}</span>
          </button>
        </div>
      </motion.div>
    </>
  );
}

// `trackActivity` (a standalone "laws"/"articles"/"principles"/"feqhPages"
// counter, called from nowhere in the codebase) used to live here. It wrote
// unconditionally to localStorage with no signed-in/guest distinction, which
// would have violated the Phase 6 rule (a signed-in user's data lives on the
// server) the moment something started calling it. Removed rather than
// ported: nothing currently increments "articles"/"principles"/"feqhPages"
// activity at all — the law-open counters are recorded by
// src/app/laws/[slug]/page.tsx via recordLawOpened().