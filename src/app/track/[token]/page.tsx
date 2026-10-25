// /track/[token] — the client's case tracking page (N3.6, owner §٤٥ axis 6).
//
// Server-rendered, never cached, never indexed, and it sends no Referer (the
// token is the URL). The one read is readTrackingView: token shape check →
// sha256 → public.case_tracking_snapshot (service role, 20261025_32) → the
// whitelist serializer. The page can therefore show ONLY the case title and
// number, the court, the current stage and the upcoming court hearings (date,
// time, court). Unknown, revoked and malformed links are one and the same
// "not found". Decisions are not shown: nothing in our schema marks a decision
// as approved for the client.
//
// The old /cases/[id] stays a 404 (N1.3); this is the real tracking page.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readTrackingView } from "@/lib/tracking/trackingSnapshot.server";
import { formatTimeOfDayAr } from "@/app/dashboard/lawyer/hearings/_timeOfDay";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "متابعة القضية | نظامي",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

const DAY_AR = new Intl.DateTimeFormat("ar-EG", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** "YYYY-MM-DD" is already a Riyadh wall-clock day; read it as UTC so it never moves. */
function dayAr(date: string): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? date : DAY_AR.format(ms);
}

export default async function CaseTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const read = await readTrackingView(token);
  if (read.state === "none") notFound();

  const shell = "min-h-[70vh] bg-slate-50 dark:bg-zinc-950 px-4 py-10";
  const card = "mx-auto w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-zinc-900";

  if (read.state === "error") {
    return (
      <main className={shell} dir="rtl">
        <div className={card} role="alert">
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">تعذّر عرض القضية الآن</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">حدث خطأ مؤقت. أعد تحميل الصفحة بعد قليل، أو تواصل مع محاميك.</p>
        </div>
      </main>
    );
  }

  const v = read.view;
  return (
    <main className={shell} dir="rtl">
      <div className={card}>
        <p className="text-xs font-bold text-[#8a6d2c] dark:text-[#C8A762]">متابعة القضية</p>
        <h1 className="mt-1 text-xl font-bold leading-snug text-slate-900 dark:text-white" style={{ fontFamily: "var(--font-brand)" }}>
          {v.title ?? "قضية"}
        </h1>

        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-100 px-3 py-2.5 dark:bg-white/[0.04]">
            <dt className="text-[11px] text-slate-500 dark:text-zinc-400">رقم القضية</dt>
            <dd className="mt-0.5 text-sm font-bold text-slate-800 dark:text-zinc-100" dir="ltr">{v.caseNumber ?? "—"}</dd>
          </div>
          <div className="rounded-2xl bg-slate-100 px-3 py-2.5 dark:bg-white/[0.04]">
            <dt className="text-[11px] text-slate-500 dark:text-zinc-400">المحكمة</dt>
            <dd className="mt-0.5 text-sm font-bold text-slate-800 dark:text-zinc-100">{v.court ?? "—"}</dd>
          </div>
          <div className="rounded-2xl bg-slate-100 px-3 py-2.5 dark:bg-white/[0.04]">
            <dt className="text-[11px] text-slate-500 dark:text-zinc-400">المرحلة الحالية</dt>
            <dd className="mt-0.5 text-sm font-bold text-slate-800 dark:text-zinc-100">{v.stageLabel ?? "—"}</dd>
          </div>
        </dl>

        <section className="mt-6" aria-labelledby="track-hearings">
          <h2 id="track-hearings" className="text-sm font-bold text-slate-800 dark:text-white">الجلسات القادمة</h2>
          {v.hearings.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">لا توجد جلسات قادمة مسجّلة حالياً.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {v.hearings.map((h, i) => (
                <li key={`${h.date}-${h.time ?? ""}-${i}`} className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-white/[0.08]">
                  <p className="text-sm font-bold text-slate-800 dark:text-zinc-100">{dayAr(h.date)}</p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-zinc-300">
                    {h.time ? `الساعة ${formatTimeOfDayAr(h.time)} (بتوقيت الرياض)` : "لم يُحدَّد وقت الجلسة"}
                    {h.court ? ` · ${h.court}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-6 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
          تعرض هذه الصفحة المواعيد والجلسات القادمة فقط. لا تُعرض فيها مذكرات المحامي ولا ملاحظاته ولا مستندات القضية.
          الرابط شخصي: لا تشاركه، ويستطيع محاميك إيقافه في أي وقت.
        </p>

        <Link
          href="/register/client"
          rel="noreferrer"
          className="mt-5 block rounded-2xl bg-[#0B3D2E] px-4 py-3 text-center text-sm font-bold text-white hover:bg-[#092e22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] dark:bg-[#C8A762] dark:text-[#0B3D2E] dark:hover:bg-[#d4b676]"
        >
          إنشاء حساب على منصة نظامي لحفظ القضية ومتابعتها
        </Link>
      </div>
    </main>
  );
}
