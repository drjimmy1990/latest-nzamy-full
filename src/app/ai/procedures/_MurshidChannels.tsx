"use client";

import { Phone, Warning } from "@phosphor-icons/react";
import { toArabicDigits } from "@/lib/services/arabicCount";
import type { MurshidChannel } from "@/lib/murshid/murshidData";
import { CircuitEmail } from "./_data";
import { SafeLink, arabicDate, tone, useMurshidJson } from "./_murshidShared";

/**
 * «القنوات الوطنية» — the 15 unified national channels of the owner's murshid
 * package (unified_channels.json, 2026-10-28): آمر، تواصل، ناجز، معين، النيابة،
 * نزاهة، the quasi-judicial committees' secretariats and the sector call
 * centres. Data from GET /api/v1/murshid/channels.
 */

interface ChannelsResponse { sourceDate: string; channels: MurshidChannel[] }

export function MurshidChannels({ isDark }: { isDark: boolean }) {
  const t = tone(isDark);
  const { data, failed } = useMurshidJson<ChannelsResponse>("/api/v1/murshid/channels");

  if (failed) return <p className={`text-[12px] ${t.muted}`}>تعذّر تحميل القنوات الوطنية — أعد تحميل الصفحة.</p>;
  if (!data) return <p className={`text-[12px] ${t.muted}`}>جارٍ تحميل القنوات الوطنية…</p>;

  return (
    <div className="space-y-3">
      <div>
        <h2 className={`text-[14px] font-bold ${t.strong}`}>القنوات الوطنية</h2>
        <p className={`mt-0.5 text-[12px] leading-relaxed ${t.muted}`}>
          {toArabicDigits(data.channels.length)} قناة وطنية موحدة للاستفسار والشكوى والبلاغ، من ملفات المرشد القضائي المصححة ({arabicDate(data.sourceDate)}).
        </p>
      </div>
      <ul className="space-y-2">
        {data.channels.map((c) => (
          <li key={c.id} className={`${t.card} p-3.5 space-y-1.5`}>
            <p className={`text-[13px] font-bold ${t.strong}`}>{c.name}</p>
            <p className="flex flex-wrap gap-1.5">
              {c.category && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${t.chip}`}>{c.category}</span>}
            </p>
            {c.operator && <p className={`text-[11px] ${t.muted}`}>الجهة المشغّلة: {c.operator}</p>}
            {c.scope && <p className={`text-[12px] leading-relaxed ${t.body}`}>{c.scope}</p>}
            {c.phones.map((p) => (
              <p key={p.value} className={`flex flex-wrap items-center gap-1.5 text-[12px] ${t.strong}`}>
                <Phone size={12} className={t.muted} />
                <span dir="ltr" className="font-mono select-all">{p.value}</span>
                {p.type && <span className={`text-[10px] ${t.muted}`}>({p.type})</span>}
              </p>
            ))}
            {c.emails.map((e) => <CircuitEmail key={e} email={e} isDark={isDark} verified={false} />)}
            {c.portals.length > 0 && (
              <ul className="space-y-0.5 text-[11px]">
                {c.portals.map((p) => <li key={p.url}><SafeLink url={p.url} label={p.name || undefined} isDark={isDark} /></li>)}
              </ul>
            )}
            {c.notes && <p className={`text-[11px] leading-relaxed ${t.muted}`}>{c.notes}</p>}
          </li>
        ))}
      </ul>
      <p className={`inline-flex items-center gap-1 text-[10px] font-bold ${t.warn}`}>
        <Warning size={10} weight="fill" /> الأرقام والعناوين كما وردت في ملفات المرشد؛ تأكّد منها قبل الاعتماد عليها
      </p>
    </div>
  );
}
