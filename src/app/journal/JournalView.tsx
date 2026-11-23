"use client";

/**
 * JournalView — the /journal page body (owner Q190–Q195, batch l13). Plain
 * design: the owner's design file has not arrived (Q196), so the final look
 * waits for it. Renders ONLY what the server sent: a visitor's entries carry
 * a title and a date and nothing else (shapeEntryForViewer).
 */
import Link from "next/link";
import { Newspaper, FilePdf } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  JOURNAL_BADGES,
  dateAr,
  issuePaths,
  periodLabelAr,
  type JournalViewer,
  type PublicJournalEntry,
} from "@/lib/journal/journal";

interface Props {
  state: "ok" | "disabled" | "error";
  viewer: JournalViewer;
  entries: PublicJournalEntry[];
  issues: Array<{ id: string; period_month: string; title: string }>;
  signedIn: boolean;
}

export default function JournalView({ state, viewer, entries, issues, signedIn }: Props) {
  const { isDark } = useTheme();
  const card = `rounded-2xl border p-5 ${isDark ? "bg-[#0d1117] border-white/10" : "bg-white border-slate-200 shadow-sm"}`;
  const muted = isDark ? "text-slate-400" : "text-slate-600";
  const strong = isDark ? "text-white" : "text-slate-900";

  return (
    <main dir="rtl" className={`min-h-screen pt-28 pb-20 px-4 ${isDark ? "bg-[#05070a]" : "bg-slate-50"}`}>
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <Newspaper size={28} weight="duotone" className={isDark ? "text-emerald-300" : "text-emerald-700"} />
            <h1 className={`text-3xl font-black ${strong}`}>المجلة التشريعية</h1>
          </div>
          <p className={`text-sm leading-relaxed ${muted}`}>
            أحدث الأخبار التشريعية في المملكة، يراجعها فريق المنصة قبل نشرها، وعدد شهري يصدر أول كل شهر ميلادي.
          </p>
        </header>

        {state === "disabled" && (
          <div className={card} role="status">
            <p className={`font-bold ${strong}`}>المجلة التشريعية قيد التفعيل.</p>
            <p className={`text-sm mt-1 ${muted}`}>ستُفتح قريباً.</p>
          </div>
        )}

        {state === "error" && (
          <div className={card} role="alert">
            <p className={`font-bold ${strong}`}>تعذّر عرض المجلة الآن.</p>
            <p className={`text-sm mt-1 ${muted}`}>حاول بعد قليل.</p>
          </div>
        )}

        {state === "ok" && (
          <>
            {viewer === "visitor" && (
              <div className={`${card} text-sm ${muted}`}>
                يرى المشتركون في مكتبة نظامي مع كل خبر شارته («معدّل» أو «سريان وشيك») وتاريخ نفاذه وأثره.{" "}
                {signedIn ? (
                  <Link href="/laws/subscribe" className="underline font-bold">
                    اشترك في المكتبة
                  </Link>
                ) : (
                  <Link href="/login?from=/journal" className="underline font-bold">
                    سجّل الدخول
                  </Link>
                )}
              </div>
            )}

            <section aria-label="الأخبار التشريعية" className="space-y-3">
              <h2 className={`text-xl font-black ${strong}`}>الأخبار</h2>
              {entries.length === 0 && <p className={`text-sm ${muted}`}>لا توجد أخبار منشورة بعد.</p>}
              {entries.map((it) => (
                <article key={it.id} className={card}>
                  <h3 className={`font-bold leading-relaxed ${strong}`}>{it.title}</h3>
                  <p className={`text-sm mt-1 ${muted}`}>تاريخ الخبر: {dateAr(it.publishedOn)}</p>
                  {viewer === "subscriber" && (
                    <div className="mt-2 space-y-1 text-sm">
                      {it.badge && JOURNAL_BADGES[it.badge] && (
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-xs font-bold ${
                            it.badge === "imminent_effect"
                              ? isDark ? "border-amber-400/40 text-amber-200" : "border-amber-500 text-amber-800"
                              : isDark ? "border-sky-400/40 text-sky-200" : "border-sky-600 text-sky-800"
                          }`}
                        >
                          {JOURNAL_BADGES[it.badge]}
                        </span>
                      )}
                      {it.issuingBody && <p className={muted}>الجهة المصدرة: {it.issuingBody}</p>}
                      {it.effectiveOn && <p className={muted}>تاريخ النفاذ: {dateAr(it.effectiveOn)}</p>}
                      {it.impactLines && it.impactLines.length > 0 && (
                        <div>
                          <p className={`font-bold ${strong}`}>الأثر:</p>
                          <ul className={`list-disc pr-5 ${muted}`}>
                            {it.impactLines.map((l, i) => (
                              <li key={i}>{l}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {it.sourceUrl && (
                        <p>
                          <a href={it.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline break-all">
                            المصدر
                          </a>
                        </p>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </section>

            <section aria-label="الأعداد الشهرية" className="space-y-3">
              <h2 className={`text-xl font-black ${strong}`}>الأعداد الشهرية</h2>
              {issues.length === 0 && <p className={`text-sm ${muted}`}>لم يصدر عدد بعد.</p>}
              {issues.map((iss) => {
                const paths = issuePaths(iss.id);
                return (
                  <div key={iss.id} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
                    <div>
                      <p className={`font-bold ${strong}`}>{iss.title}</p>
                      <p className={`text-sm ${muted}`}>{periodLabelAr(iss.period_month)}</p>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <a href={paths.page} className="underline font-bold">
                        قراءة العدد
                      </a>
                      <a href={paths.pdf} className="underline inline-flex items-center gap-1">
                        <FilePdf size={16} /> PDF
                      </a>
                    </div>
                  </div>
                );
              })}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
