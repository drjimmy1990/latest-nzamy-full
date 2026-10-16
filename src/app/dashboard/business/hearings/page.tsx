"use client";

/**
 * «المواعيد» — /dashboard/business/hearings (owner decision ٥: one of the five
 * company sections to build first).
 *
 * WHAT WAS HERE: `EVENTS`, five invented diary entries («مراجعة عقد التوريد
 * الرئيسي», «تجديد رخصة الدفاع المدني», «جلسة عمالية بمحكمة التنفيذ», «موعد
 * تقديم الإقرار الضريبي», «توقيع اتفاقية استثمار») with departments, places
 * and relative dates («اليوم», «غداً») that belonged to no company — and a
 * «إضافة موعد» button with nothing behind it.
 *
 * WHAT IT IS NOW: GET /api/v1/client/appointments —
 *   • the upcoming court hearings and client meetings the lawyer recorded on
 *     the company's cases (owner decisions ١٥/١٩: date, time and place only;
 *     the team's notes and minutes never leave the server);
 *   • the caller's own scheduled consultations.
 * Nothing is added from here: the lawyer records hearings; a consultation is
 * booked through «اطلب خدمة جديدة».
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CalendarCheck, Gavel, ChatDots, Warning, ArrowLeft } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { isSupabaseMode } from "@/lib/services/api";
import type { ClientHearing } from "@/lib/clientCaseSummary";
import { CONSULTATION_MODE_AR, type ConsultationMode } from "@/lib/services/consultationVocabulary";

interface AppointmentHearing extends ClientHearing {
  caseTitle: string;
}
interface AppointmentConsultation {
  id: string;
  requestId: string | null;
  scheduledAt: string;
  mode: string | null;
  specialty: string | null;
}
type Load =
  | { state: "loading" }
  | { state: "ok"; hearings: AppointmentHearing[]; consultations: AppointmentConsultation[]; casesCapped: boolean }
  | { state: "failed"; message: string }
  | { state: "demo" };

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function dayAr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const n = (v: string) => Number(v).toLocaleString("ar-SA", { useGrouping: false });
  return `${n(m[3])} ${AR_MONTHS[Number(m[2]) - 1] ?? ""} ${n(m[1])}`;
}

function instantAr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(d);
}

function timeAr(time: string | null): string | null {
  if (!time) return null;
  const [h, min] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return time;
  return `${(h % 12 === 0 ? 12 : h % 12).toLocaleString("ar-SA")}:${min.toLocaleString("ar-SA", { minimumIntegerDigits: 2 })} ${h < 12 ? "ص" : "م"}`;
}

export default function BusinessAppointmentsPage() {
  const { isDark } = useTheme();
  const [load, setLoad] = useState<Load>(() => (isSupabaseMode ? { state: "loading" } : { state: "demo" }));

  const fetchAll = useCallback(async (): Promise<Load> => {
    try {
      const res = await fetch("/api/v1/client/appointments", { credentials: "same-origin", cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        const msg = typeof body?.error === "string" && /[؀-ۿ]/.test(body.error) ? body.error : "تعذّر تحميل المواعيد.";
        return { state: "failed", message: msg };
      }
      return {
        state: "ok",
        hearings: Array.isArray(body.hearings) ? body.hearings : [],
        consultations: Array.isArray(body.consultations) ? body.consultations : [],
        casesCapped: body.casesCapped === true,
      };
    } catch {
      return { state: "failed", message: "تعذّر تحميل المواعيد. تحقق من اتصالك." };
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseMode) return;
    let cancelled = false;
    void fetchAll().then((next) => { if (!cancelled) setLoad(next); });
    return () => { cancelled = true; };
  }, [fetchAll]);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-zinc-100" : "text-slate-800";
  const row = `flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl px-4 py-3 ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`;

  return (
    <div className="max-w-4xl mx-auto space-y-5" dir="rtl">
      <div>
        <h1 className={`text-xl font-black flex items-center gap-2 ${strong}`}>
          <CalendarCheck size={22} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
          المواعيد
        </h1>
        <p className={`text-sm mt-1 ${muted}`}>
          الجلسات القادمة في قضايا المنشأة كما سجّلها المحامي، واستشاراتك المجدولة.
        </p>
      </div>

      {load.state === "demo" && (
        <div className={`${card} p-6 text-sm ${muted}`}>المواعيد تُقرأ من الحساب الحقيقي فقط، وليست متاحة في وضع العرض.</div>
      )}
      {load.state === "loading" && (
        <div className="py-16 text-center">
          <div className="inline-block w-8 h-8 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
        </div>
      )}
      {load.state === "failed" && (
        <div className={`${card} p-6 flex items-start gap-3`}>
          <Warning size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className={`text-sm font-bold ${strong}`}>{load.message}</p>
            <button
              onClick={() => { setLoad({ state: "loading" }); void fetchAll().then(setLoad); }}
              className="mt-2 text-xs font-bold text-[#0B3D2E] dark:text-emerald-400 hover:underline"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      )}

      {load.state === "ok" && (
        <>
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5`}>
            <h2 className={`text-sm font-bold mb-3 flex items-center gap-2 ${strong}`}>
              <Gavel size={16} /> الجلسات القادمة
            </h2>
            {load.hearings.length === 0 ? (
              <p className={`text-sm py-3 ${muted}`}>لا توجد جلسات قادمة مسجّلة على قضايا المنشأة.</p>
            ) : (
              <div className="space-y-2">
                {load.hearings.map((h) => (
                  <div key={h.id} className={row}>
                    <div>
                      <p className={`text-[13px] font-bold ${strong}`}>{h.kindLabel} — {dayAr(h.date)}</p>
                      <p className={`text-xs mt-0.5 ${muted}`}>
                        {[timeAr(h.time), h.place].filter(Boolean).join(" · ") || "لم يُسجَّل الوقت والمكان بعد"}
                      </p>
                      {h.caseTitle && <p className={`text-[11px] mt-0.5 ${muted}`}>القضية: {h.caseTitle}</p>}
                    </div>
                    {h.caseId && (
                      <Link
                        href={`/dashboard/business/cases/${encodeURIComponent(h.caseId)}`}
                        className="inline-flex items-center gap-1 self-start sm:self-center text-xs font-bold text-[#0B3D2E] dark:text-emerald-400 hover:underline"
                      >
                        ملف القضية <ArrowLeft size={12} />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
            {load.casesCapped && (
              <p className={`text-[11px] mt-3 ${muted}`}>تُعرض جلسات أحدث ٣٠٠ قضية للمنشأة فقط.</p>
            )}
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className={`${card} p-5`}>
            <h2 className={`text-sm font-bold mb-3 flex items-center gap-2 ${strong}`}>
              <ChatDots size={16} /> استشاراتك المجدولة
            </h2>
            {load.consultations.length === 0 ? (
              <p className={`text-sm py-3 ${muted}`}>لا توجد استشارة مجدولة باسمك.</p>
            ) : (
              <div className="space-y-2">
                {load.consultations.map((c) => (
                  <div key={c.id} className={row}>
                    <div>
                      <p className={`text-[13px] font-bold ${strong}`}>{instantAr(c.scheduledAt)}</p>
                      <p className={`text-xs mt-0.5 ${muted}`}>
                        {[c.mode ? CONSULTATION_MODE_AR[c.mode as ConsultationMode] ?? null : null, c.specialty].filter(Boolean).join(" · ") || "استشارة"}
                      </p>
                    </div>
                    {c.requestId && (
                      <Link
                        href={`/dashboard/client/consultation/${encodeURIComponent(c.requestId)}`}
                        className="inline-flex items-center gap-1 self-start sm:self-center text-xs font-bold text-[#0B3D2E] dark:text-emerald-400 hover:underline"
                      >
                        تفاصيل الاستشارة <ArrowLeft size={12} />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        </>
      )}
    </div>
  );
}
