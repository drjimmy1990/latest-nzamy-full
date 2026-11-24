"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowClockwise, LinkSimple, MagnifyingGlass, Warning } from "@phosphor-icons/react";
import {
  COVERAGE_EDGE_LABELS,
  coveragePercent,
  linksPerArticle,
  sortLawCoverage,
  type CoverageSort,
  type LinkCoverage,
} from "@/lib/library/linkCoverage";
import { OWNER_EDGE_STATUS_LABELS } from "@/lib/library/linkCheck";

/**
 * /dashboard/admin/library-links-coverage — «تغطية الإحالات» (batch l14, owner
 * file 07 §2 and §12.8, approved 23 Nov §15): where the library's links are
 * really poor. Per law: the share of its articles with at least one legal link,
 * links per article, similar-meaning links apart (not a legal link), the
 * owner's links that sit on the whole law (their article could not be pinned)
 * and articles gone from the library that still carry links; then the
 * anomalies to review. Read-only, any staff role
 * (GET /api/v1/admin/library-links-coverage).
 */

const n = (v: number) => v.toLocaleString("ar-SA");
const pctText = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("ar-SA", { maximumFractionDigits: 1 })}٪`);

const SORTS: Array<{ key: CoverageSort; label: string }> = [
  { key: "poorest", label: "الأضعف تغطية أولاً" },
  { key: "largest", label: "الأكبر أولاً" },
  { key: "unresolved", label: "الأكثر روابط غير محلولة" },
];

export default function AdminLibraryLinksCoveragePage() {
  const [data, setData] = useState<LinkCoverage | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<CoverageSort>("poorest");
  const [q, setQ] = useState("");

  const load = useCallback((fresh: boolean) => {
    setLoading(true);
    setError(null);
    fetch(`/api/v1/admin/library-links-coverage${fresh ? "?fresh=1" : ""}`, { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { ok?: boolean; coverage?: LinkCoverage; checkedAt?: string; schemaMissing?: boolean; migration?: string; error?: string };
        if (body.schemaMissing) setMissing(body.migration ?? "20261204_40_library_link_coverage.sql");
        else if (!r.ok || !body.ok || !body.coverage) setError(body.error ?? "تعذّر تحميل تغطية الإحالات");
        else {
          setData(body.coverage);
          setCheckedAt(body.checkedAt ?? null);
        }
      })
      .catch(() => setError("تعذّر تحميل تغطية الإحالات"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim();
    const list = needle ? data.laws.filter((l) => l.title.includes(needle) || l.slug.includes(needle)) : data.laws;
    return sortLawCoverage(list, sort);
  }, [data, q, sort]);

  const t = data?.totals;
  const unresolvedOwner = data
    ? Object.entries(data.ownerEdges).filter(([k]) => k !== "resolved" && k !== "deleted").sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="min-h-full p-6 md:p-8" dir="rtl">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#C8A762]/20 bg-[#C8A762]/10">
          <LinkSimple size={22} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl font-black text-white">تغطية الإحالات</h1>
          <p className="text-[12px] text-zinc-500">
            نسبة المواد التي لها إحالة واحدة على الأقل في كل نظام، والروابط التي لم تُحلّ إلى مادة، وما يحتاج مراجعة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[12px] font-bold text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-50"
        >
          <ArrowClockwise size={14} className={loading ? "animate-spin" : ""} /> تحديث
        </button>
      </div>

      {missing && (
        <p className="mb-4 flex items-start gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[12px] leading-relaxed text-amber-200">
          <Warning size={14} className="mt-0.5 shrink-0" /> تحتاج هذه الصفحة ملف قاعدة البيانات{" "}
          <code dir="ltr" className="rounded bg-black/30 px-1 font-mono text-[11px]">supabase/migrations/{missing}</code>
        </p>
      )}
      {error && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-300">{error}</p>}
      {loading && !data && !missing && <p className="text-[12px] text-zinc-500">جارٍ الحساب… قد يستغرق بضع ثوانٍ.</p>}

      {data && t && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "مواد لها إحالة", value: pctText(coveragePercent(t.linked, t.articles)), hint: `${n(t.linked)} من ${n(t.articles)} مادة` },
              { label: "متوسط الإحالات لكل مادة", value: (linksPerArticle(t.links, t.articles) ?? 0).toLocaleString("ar-SA"), hint: `${n(t.links)} إحالة في ${n(t.laws)} نظاماً` },
              { label: "روابط على النظام كله", value: n(t.docLevel), hint: "تعذّر تحديد مادتها فتفتح المستند" },
              { label: "مواد حُذفت وما زالت مرتبطة", value: n(t.goneAnchors), hint: "تُعرض رابطاً إلى مستندها" },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <p className="text-[11px] font-bold text-zinc-500">{c.label}</p>
                <p className="mt-1 text-2xl font-black text-white">{c.value}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{c.hint}</p>
              </div>
            ))}
          </div>

          <section className="mb-8">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="flex-1 text-[14px] font-black text-white">حسب النظام</h2>
              <label className="relative">
                <MagnifyingGlass size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث باسم النظام"
                  className="w-56 rounded-xl border border-white/10 bg-white/[0.03] py-1.5 pr-8 pl-3 text-[12px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[#C8A762]/50"
                />
              </label>
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSort(s.key)}
                  className={`rounded-xl border px-3 py-1.5 text-[11.5px] font-bold transition ${sort === s.key ? "border-[#C8A762]/40 bg-[#C8A762]/15 text-[#C8A762]" : "border-white/10 text-zinc-400 hover:bg-white/[0.05]"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
              <table className="w-full min-w-[760px] text-[12px]">
                <thead className="bg-white/[0.03] text-[11px] text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 text-start font-bold">النظام</th>
                    <th className="px-3 py-2 text-start font-bold">المواد</th>
                    <th className="px-3 py-2 text-start font-bold">لها إحالة</th>
                    <th className="px-3 py-2 text-start font-bold">متوسط لكل مادة</th>
                    <th className="px-3 py-2 text-start font-bold">متقاربة في المعنى</th>
                    <th className="px-3 py-2 text-start font-bold">على النظام كله</th>
                    <th className="px-3 py-2 text-start font-bold">محذوفة ومرتبطة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
                    const p = coveragePercent(l.linked, l.articles);
                    return (
                      <tr key={l.slug} className="border-t border-white/[0.05] text-zinc-300">
                        <td className="px-3 py-2">
                          <Link href={`/laws/${encodeURIComponent(l.slug)}`} className="font-semibold text-zinc-100 hover:text-[#C8A762]">
                            {l.title}
                          </Link>
                          <span dir="ltr" className="block font-mono text-[10px] text-zinc-600">{l.slug}</span>
                        </td>
                        <td className="px-3 py-2">{n(l.articles)}</td>
                        <td className="px-3 py-2">
                          <span className={`font-bold ${p == null ? "text-zinc-500" : p < 25 ? "text-red-300" : p < 60 ? "text-amber-300" : "text-emerald-300"}`}>{pctText(p)}</span>
                          <span className="text-zinc-500"> ({n(l.linked)})</span>
                        </td>
                        <td className="px-3 py-2">{(linksPerArticle(l.links, l.articles) ?? 0).toLocaleString("ar-SA")}</td>
                        <td className="px-3 py-2">{n(l.similarLinked)}</td>
                        <td className="px-3 py-2">{l.docLevel > 0 ? <span className="font-bold text-amber-300">{n(l.docLevel)}</span> : "—"}</td>
                        <td className="px-3 py-2">{l.goneAnchors > 0 ? <span className="font-bold text-amber-300">{n(l.goneAnchors)}</span> : "—"}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-zinc-500">لا نتائج.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              «لها إحالة»: مادة لها رابط قانوني واحد على الأقل (تشريع أو مبدأ قضائي)؛ لا يُحسب رابط المادة إلى نفسها ولا «المتقاربة في المعنى» لأنها ربط بالمعنى لا إحالة قانونية.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-1 text-[14px] font-black text-white">تحتاج مراجعة ({n(data.anomalyCount)})</h2>
            <p className="mb-3 text-[11.5px] text-zinc-500">
              مادة ترتبط بـ{n(data.anomalyMin)} مواد فأكثر من مستند واحد بالنوع نفسه — قد يكون صحيحاً وقد يكون خطأ في الاستخراج.
            </p>
            {data.anomalies.length === 0 ? (
              <p className="text-[12px] text-zinc-500">لا شيء.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.anomalies.map((a) => (
                  <li key={`${a.articleKey}|${a.edgeType}|${a.direction}|${a.otherDoc}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-zinc-300">
                    <span className="font-semibold text-zinc-100">{a.articleTitle}</span>
                    <span className="text-zinc-500"> — {COVERAGE_EDGE_LABELS[a.edgeType] ?? a.edgeType} {a.direction === "out" ? "إلى" : "من"} </span>
                    <span className="font-semibold text-zinc-100">{a.otherTitle}</span>
                    <span className="mr-1 rounded-md bg-amber-500/15 px-1.5 text-[11px] font-bold text-amber-300">{n(a.n)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {unresolvedOwner.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-[14px] font-black text-white">روابط ملف المالك حسب حالتها</h2>
              <ul className="space-y-1 text-[12px] text-zinc-300">
                {unresolvedOwner.map(([k, v]) => (
                  <li key={k}>
                    {OWNER_EDGE_STATUS_LABELS[k] ?? k}: <span className="font-bold">{n(v)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {checkedAt && <p className="text-[11px] text-zinc-600">حُسبت {new Date(checkedAt).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}.</p>}
        </>
      )}
    </div>
  );
}
