"use client";

import { ArrowSquareOut, ShieldWarning, CheckCircle, Warning } from "@phosphor-icons/react";
import data from "@/data/public-prosecution-channels.json";
import { CircuitEmail } from "./_data";

/**
 * «النيابة العامة» — its own category beside the Ministry of Justice
 * directory (owner note ١٩ §٤, NOTE-19-C03). The MoJ directory has no
 * prosecution row (2,192 entries, all @moj.gov.sa), and the prosecution is
 * independent of the ministry, so its channels are not mixed into it.
 *
 * Only what the owner documented with a source and a check date
 * (src/data/public-prosecution-channels.json): the sectors form, the site,
 * the lawyers' platform, and the phone and e-mail my.gov.sa publishes — the
 * e-mail shown as text only, with his finding that its domain has no mail
 * record. No address is guessed: none is published for an investigation
 * circuit, and the card says so.
 */

interface Channel {
  id: string;
  kind: "portal" | "website" | "note" | "phone" | "email";
  label: string;
  value: string;
  source: string;
  sourceUrl: string;
  checkedAt: string;
  verified: boolean;
}

const channels = data.channels as Channel[];

const CHECKED_AT_AR = "٢٨ أكتوبر ٢٠٢٦";

export function ProsecutionChannels({ isDark, lead }: { isDark: boolean; lead?: string }) {
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-zinc-100" : "text-slate-800";
  const link = `${isDark ? "text-emerald-400" : "text-[#0B3D2E]"} underline underline-offset-2 break-all`;

  return (
    <section
      aria-label="النيابة العامة"
      className={`rounded-2xl border p-4 space-y-3 ${isDark ? "border-sky-500/20 bg-sky-500/5" : "border-sky-200 bg-sky-50/60"}`}
    >
      <div className="flex items-start gap-2">
        <ShieldWarning size={18} weight="duotone" className="text-sky-500 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className={`text-[13px] font-bold ${strong}`}>النيابة العامة — جهة مستقلة عن وزارة العدل</h3>
          <p className={`text-[11px] leading-relaxed mt-0.5 ${muted}`}>
            {lead ?? "دليل الدوائر أعلاه خاص بجهات وزارة العدل ولا يتضمن النيابة العامة. هذه قنواتها الموثقة بمصدر وتاريخ تحقق."}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {channels.map((c) => (
          <li key={c.id} className={`rounded-xl border p-3 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-100 bg-white"}`}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className={`text-[12px] font-bold ${strong}`}>{c.label}</p>
              {c.verified ? (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                  <CheckCircle size={10} weight="fill" /> تحقّق منه المالك في {CHECKED_AT_AR}
                </span>
              ) : (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/10 ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                  <Warning size={10} weight="fill" /> غير مُتحقَّق
                </span>
              )}
            </div>

            {(c.kind === "portal" || c.kind === "website") && (
              <a href={c.value} target="_blank" rel="noopener noreferrer" dir="ltr" className={`mt-1 inline-flex items-center gap-1 text-[12px] font-mono ${link}`}>
                {c.value} <ArrowSquareOut size={11} />
              </a>
            )}
            {c.kind === "portal" && (
              <p className={`text-[11px] mt-1 ${muted}`}>لتوجيه الطلب إلى الفرع ودائرة التحقيق المختصة.</p>
            )}
            {c.kind === "website" && (
              <p className={`text-[11px] mt-1 ${muted}`}>لا يعرض الموقع بريداً لأي فرع أو دائرة؛ يعرض نموذجين إلكترونيين، وفيه قسم «منصة المحامين».</p>
            )}
            {c.kind === "note" && (
              <p className={`text-[11px] mt-1 ${muted}`}>في موقع النيابة العامة؛ قد تعرض بيانات الدوائر للمحامي بعد الدخول — لم يُتحقَّق من ذلك.</p>
            )}
            {c.kind === "phone" && (
              <p dir="ltr" className={`mt-1 text-start font-mono text-[12px] select-all ${strong}`}>{c.value}</p>
            )}
            {c.kind === "email" && (
              <div className="mt-1 space-y-1">
                <CircuitEmail email={c.value} isDark={isDark} verified={false} />
                <p className={`text-[11px] leading-relaxed ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                  يبدو قديماً: نطاق bip.gov.sa بلا سجل بريد (MX) في فحص المالك، بينما pp.gov.sa له سجل بريد. فحص أولي من الخارج وقد يخطئ — لا تعتمده قبل التأكد بإرسال تجريبي أو اتصال.
                </p>
              </div>
            )}

            <p className={`text-[10px] mt-1.5 ${muted}`}>
              المصدر:{" "}
              <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className={link}>{c.source}</a>
              {" "}· تاريخ الفحص {CHECKED_AT_AR}
            </p>
          </li>
        ))}
      </ul>

      <p className={`text-[11px] leading-relaxed ${muted}`}>
        لا يوجد بريد علني منشور لدوائر التحقيق (ومنها دائرة الأموال بالنيابة العامة بالشرقية)، ولا نخترع بريداً ولا نخمّنه.
      </p>
    </section>
  );
}
