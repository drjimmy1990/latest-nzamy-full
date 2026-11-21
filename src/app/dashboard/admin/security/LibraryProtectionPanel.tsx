"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FloppyDisk, ShieldWarning } from "@phosphor-icons/react";
import { VERIFIED_CRAWLERS, VISITOR_AGENTS } from "@/lib/library/crawlerList";
import {
  PUBLIC_VIEW_BOOLS,
  PUBLIC_VIEW_INTS,
  publicViewSettingsFromRow,
  type PublicViewSettings,
} from "@/lib/library/publicViewCap";
import { useUser } from "@/hooks/useUser";
import { staffMaySee } from "@/lib/auth/adminNavAccess";
import LibraryListCapPanel from "./LibraryListCapPanel";

/**
 * «حماية المكتبة من السحب» (batch l11; owner register 14 items 52, 53, 56,
 * 60, 64, 67):
 *   - the non-subscriber daily view cap — OFF until the owner approves the
 *     evidence (the server refuses ON without the confirmation box, G45);
 *   - which verified crawlers are exempt and their own daily numbers;
 *   - the visitor agents' shared daily numbers;
 *   - the sequential / parallel reading alerts and the staff addresses;
 *   - the last 7 days' figures.
 *   GET|PUT /api/v1/admin/library-monitor/protection
 */

type Props = { isDark: boolean; card: string };

interface DayStats {
  day: string;
  viewers: number;
  accounts: number;
  opens: number;
  refusals: number;
  capped: number;
}
interface CrawlerStats {
  day: string;
  provider: string;
  verified: number;
  notVerified: number;
  refused: number;
}

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
};

const SEQUENCE_KEYS = ["sequenceOn", "sequenceDocs", "sequenceGapSeconds"] as const;
const PARALLEL_KEYS = ["parallelOn", "parallelSessions", "parallelMinutes"] as const;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function LibraryProtectionPanel({ isDark, card }: Props) {
  const { staffRole } = useUser();
  const canWrite = staffMaySee(staffRole, "settings.write");
  const [saved, setSaved] = useState<PublicViewSettings>(() => publicViewSettingsFromRow(null));
  const [draft, setDraft] = useState<PublicViewSettings>(() => publicViewSettingsFromRow(null));
  const [emailsText, setEmailsText] = useState("");
  const [confirmEvidence, setConfirmEvidence] = useState(false);
  const [days, setDays] = useState<DayStats[]>([]);
  const [crawlerRows, setCrawlerRows] = useState<CrawlerStats[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const tp = isDark ? "text-white" : "text-slate-800";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";
  const line = isDark ? "border-white/[0.06]" : "border-slate-100";
  const input = `w-full rounded-lg border px-3 py-2 text-[12px] outline-none ${
    isDark ? "border-white/10 bg-zinc-900 text-white" : "border-slate-200 bg-white text-slate-800"
  }`;
  const warn = isDark ? "text-amber-300" : "text-amber-700";

  const apply = useCallback((s: PublicViewSettings) => {
    setSaved(s);
    setDraft(s);
    setEmailsText(s.alertEmails.join("\n"));
    setConfirmEvidence(false);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/library-monitor/protection", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !body) {
        setNotice({ ok: false, msg: String(body?.error ?? "تعذّر تحميل الإعدادات.") });
        return;
      }
      apply(publicViewSettingsFromRowLike(body.settings));
      setUpdatedAt(typeof body.updatedAt === "string" ? body.updatedAt : null);
      setMissing(body.migrationMissing ? String(body.message ?? "") : null);
      const stats = body.stats && typeof body.stats === "object" ? (body.stats as Record<string, unknown>) : null;
      setDays(Array.isArray(stats?.days) ? (stats!.days as DayStats[]) : []);
      setCrawlerRows(Array.isArray(stats?.crawlers) ? (stats!.crawlers as CrawlerStats[]) : []);
    } catch {
      setNotice({ ok: false, msg: "تعذّر الاتصال بالخادم." });
    }
  }, [apply]);

  useEffect(() => {
    load();
  }, [load]);

  const emailsDraft = useMemo(
    () => [...new Set(emailsText.split(/[\s,;،]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))],
    [emailsText],
  );

  const patch = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const b of PUBLIC_VIEW_BOOLS) if (draft[b.key] !== saved[b.key]) out[b.key] = draft[b.key];
    for (const i of PUBLIC_VIEW_INTS) if (draft[i.key] !== saved[i.key]) out[i.key] = draft[i.key];
    if (!same(draft.crawlers, saved.crawlers)) out.crawlers = draft.crawlers;
    if (!same(draft.agents, saved.agents)) out.agents = draft.agents;
    if (!same(emailsDraft, saved.alertEmails)) out.alertEmails = emailsDraft;
    return out;
  }, [draft, saved, emailsDraft]);
  const changed = Object.keys(patch).length;
  const switchingOn = draft.enabled && !saved.enabled;

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/admin/library-monitor/protection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(switchingOn ? { ...patch, confirmEvidence } : patch),
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !body) setNotice({ ok: false, msg: String(body?.error ?? "تعذّر حفظ الإعدادات.") });
      else {
        apply(publicViewSettingsFromRowLike(body.settings));
        setUpdatedAt(typeof body.updatedAt === "string" ? body.updatedAt : null);
        setNotice({ ok: true, msg: "حُفظت الإعدادات. تسري خلال دقيقة." });
      }
    } catch {
      setNotice({ ok: false, msg: "تعذّر الاتصال بالخادم." });
    }
    setBusy(false);
  }

  const setInt = (key: keyof PublicViewSettings, raw: string) => {
    const n = Number(raw);
    setDraft({ ...draft, [key]: raw === "" ? ("" as unknown as number) : Number.isFinite(n) ? Math.trunc(n) : draft[key] });
  };
  const intField = (key: keyof PublicViewSettings, disabled = false) => {
    const spec = PUBLIC_VIEW_INTS.find((i) => i.key === key)!;
    return (
      <div key={key} className={disabled ? "opacity-40" : ""}>
        <label className={`mb-1 block text-[11px] ${ts}`}>{spec.labelAr}</label>
        <input type="number" min={spec.min} max={spec.max} disabled={disabled} value={String(draft[key] ?? "")}
          onChange={(e) => setInt(key, e.target.value)} className={input} />
        <p className={`mt-0.5 text-[9px] ${ts}`}>من {spec.min} إلى {spec.max}</p>
      </div>
    );
  };
  const boolField = (key: keyof PublicViewSettings) => {
    const spec = PUBLIC_VIEW_BOOLS.find((b) => b.key === key)!;
    return (
      <label key={key} className={`flex items-center gap-2 text-[12px] md:col-span-2 ${tp}`}>
        <input type="checkbox" checked={draft[key] === true} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} />
        {spec.labelAr}
      </label>
    );
  };

  return (
    <div className="space-y-5">
      {notice && (
        <p className={`text-[12px] font-bold ${notice.ok ? (isDark ? "text-emerald-300" : "text-emerald-700") : isDark ? "text-red-300" : "text-red-700"}`}>
          {notice.msg}
        </p>
      )}
      {missing && <p className={`text-[12px] font-bold ${warn}`}>غير متاح بعد: {missing}</p>}

      <div className={`${card} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className={`text-[12px] font-bold ${tp}`}>حماية المكتبة من السحب</p>
            <p className={`text-[10px] ${ts}`}>آخر تعديل: {fmt(updatedAt)}. التغيير يسري خلال دقيقة.</p>
          </div>
          {canWrite && (
            <div className="flex items-center gap-2">
              {changed > 0 && <button onClick={() => apply(saved)} className={`text-[11px] ${ts}`}>تراجع</button>}
              <button
                onClick={save}
                disabled={changed === 0 || busy || !!missing || (switchingOn && !confirmEvidence)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                <FloppyDisk size={13} /> حفظ {changed > 0 ? `(${changed})` : ""}
              </button>
            </div>
          )}
        </div>
        {!canWrite && <p className={`text-[11px] ${ts}`}>للاطلاع فقط: التعديل للمشرف الرئيسي.</p>}

        <fieldset disabled={!canWrite} className="space-y-4">
          {/* the cap */}
          <div className={`rounded-xl border p-4 space-y-3 ${line}`}>
            <p className={`text-[12px] font-bold ${tp}`}>حد الاطلاع اليومي لغير المشترك</p>
            <p className={`text-[11px] leading-relaxed ${ts}`}>
              يُحسب فتح نص المستند فقط (نظام، كتاب، مجموعة أحكام، قرار)، ولا تُحسب صفحة الملخص العامة ولا القوائم ولا البحث.
              إعادة فتح مستند فُتح اليوم لا تُحسب. المشترك لا يدخل في هذا الحد، وله حدوده الخاصة في «نشاط المكتبة».
            </p>
            <p className={`text-[12px] font-bold ${saved.enabled ? warn : tp}`}>
              الحالة الآن: {saved.enabled ? "مُشغَّل" : "مُطفأ"}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {boolField("enabled")}
              {intField("dailyViews")}
              {intField("addressDailyViews")}
            </div>
            {switchingOn && (
              <div className={`flex items-start gap-2 rounded-lg border p-3 ${isDark ? "border-amber-400/30" : "border-amber-300"}`}>
                <ShieldWarning size={16} className={warn} />
                <label className={`flex items-start gap-2 text-[11px] leading-relaxed ${tp}`}>
                  <input type="checkbox" checked={confirmEvidence} onChange={(e) => setConfirmEvidence(e.target.checked)} />
                  اطلعتُ على أدلة عدم الإضرار بالظهور في محركات البحث وإجابات الذكاء الاصطناعي، ووافق المالك على التشغيل.
                </label>
              </div>
            )}
          </div>

          {/* crawlers */}
          <div className={`rounded-xl border p-4 space-y-3 ${line}`}>
            <p className={`text-[12px] font-bold ${tp}`}>زواحف البحث المستثناة بعد التحقق</p>
            <p className={`text-[11px] leading-relaxed ${ts}`}>
              لا يُستثنى زاحف باسمه وحده: يُتحقق من عنوانه بالرجوع إلى نطاق مزوّده أو إلى قائمة العناوين التي ينشرها المزوّد.
              من لم يثبت يُعامل زائراً عادياً. الاستثناء يرفع العدّ فقط، ولا يفتح نصاً مقفلاً.
            </p>
            <div className="grid gap-2">
              {VERIFIED_CRAWLERS.map((c) => {
                const v = draft.crawlers[c.id] ?? { on: false, daily: 100 };
                return (
                  <div key={c.id} className={`grid items-center gap-2 rounded-lg border p-2 md:grid-cols-[1fr_auto_10rem] ${line}`}>
                    <div>
                      <p className={`text-[12px] font-bold ${tp}`}>{c.label}</p>
                      <p className={`text-[10px] ${ts}`}>
                        {c.rdnsSuffixes.length > 0 ? "التحقق بالنطاق ثم بقائمة العناوين" : "التحقق بقائمة العناوين المنشورة"}
                        {c.probation ? " — تحت التجربة" : ""}
                      </p>
                    </div>
                    <label className={`flex items-center gap-2 text-[11px] ${tp}`}>
                      <input type="checkbox" checked={v.on}
                        onChange={(e) => setDraft({ ...draft, crawlers: { ...draft.crawlers, [c.id]: { ...v, on: e.target.checked } } })} />
                      مستثنى
                    </label>
                    <input type="number" min={1} value={String(v.daily)} aria-label={`الحد اليومي — ${c.label}`}
                      onChange={(e) => {
                        const n = Math.trunc(Number(e.target.value));
                        if (Number.isFinite(n)) setDraft({ ...draft, crawlers: { ...draft.crawlers, [c.id]: { ...v, daily: n } } });
                      }}
                      className={input} />
                  </div>
                );
              })}
            </div>
            <p className={`text-[10px] ${ts}`}>الرقم: عدد المستندات المختلفة في اليوم لكل زاحف.</p>
          </div>

          {/* agents */}
          <div className={`rounded-xl border p-4 space-y-3 ${line}`}>
            <p className={`text-[12px] font-bold ${tp}`}>وكلاء المساعدات الذكية الذين يفتحون الصفحة لمستخدم</p>
            <p className={`text-[11px] leading-relaxed ${ts}`}>
              يُعاملون زواراً عاديين، ولكل مزوّد فوق ذلك عدد يومي مشترك لا يتجاوزه مجموع طلباته.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {VISITOR_AGENTS.map((a) => (
                <div key={a.id}>
                  <label className={`mb-1 block text-[11px] ${ts}`}>{a.label}</label>
                  <input type="number" min={1} value={String(draft.agents[a.id] ?? "")}
                    onChange={(e) => {
                      const n = Math.trunc(Number(e.target.value));
                      if (Number.isFinite(n)) setDraft({ ...draft, agents: { ...draft.agents, [a.id]: n } });
                    }}
                    className={input} />
                </div>
              ))}
            </div>
          </div>

          {/* alerts */}
          <div className={`rounded-xl border p-4 space-y-3 ${line}`}>
            <p className={`text-[12px] font-bold ${tp}`}>تنبيهات القراءة غير المعتادة</p>
            <p className={`text-[11px] leading-relaxed ${ts}`}>
              تسري على كل الحسابات، ومنها حسابات الإدارة والاختبار. يُوضع الحساب «قيد المراجعة» ويظهر في «نشاط المكتبة»،
              ويُنفَّذ الإجراء المختار هناك.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {boolField(SEQUENCE_KEYS[0])}
              {intField(SEQUENCE_KEYS[1], !draft.sequenceOn)}
              {intField(SEQUENCE_KEYS[2], !draft.sequenceOn)}
              {boolField(PARALLEL_KEYS[0])}
              {intField(PARALLEL_KEYS[1], !draft.parallelOn)}
              {intField(PARALLEL_KEYS[2], !draft.parallelOn)}
            </div>
            <div>
              <label className={`mb-1 block text-[11px] ${ts}`}>عناوين البريد التي تصلها التنبيهات (عنوان في كل سطر، عشرة على الأكثر)</label>
              <textarea rows={3} dir="ltr" value={emailsText} onChange={(e) => setEmailsText(e.target.value)} className={input} />
              <p className={`mt-0.5 text-[10px] ${ts}`}>
                تُرسل الرسالة بعد تفعيل خدمة البريد في المنصة. دونها يبقى التنبيه في جرس الإشعارات فقط.
              </p>
            </div>
          </div>
        </fieldset>
      </div>

      {/* figures */}
      <div className={`${card} p-5 space-y-3`}>
        <p className={`text-[12px] font-bold ${tp}`}>أرقام آخر ٧ أيام (حد غير المشترك)</p>
        {days.length === 0 ? (
          <p className={`text-[11px] ${ts}`}>لا أرقام بعد — الحد مُطفأ أو لم يُفتح شيء.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full text-[11px] ${tp}`}>
              <thead>
                <tr className={ts}>
                  <th className="p-1 text-right">اليوم</th>
                  <th className="p-1 text-right">زوار وحسابات</th>
                  <th className="p-1 text-right">منها حسابات</th>
                  <th className="p-1 text-right">مستندات فُتحت</th>
                  <th className="p-1 text-right">مرات الرفض</th>
                  <th className="p-1 text-right">بلغوا الحد</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.day} className={`border-t ${line}`}>
                    <td className="p-1">{d.day}</td>
                    <td className="p-1">{d.viewers}</td>
                    <td className="p-1">{d.accounts}</td>
                    <td className="p-1">{d.opens}</td>
                    <td className="p-1">{d.refusals}</td>
                    <td className="p-1">{d.capped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={`text-[12px] font-bold ${tp}`}>طلبات باسم زواحف البحث</p>
        {crawlerRows.length === 0 ? (
          <p className={`text-[11px] ${ts}`}>
            لا طلبات. المتوقع أن تبقى قليلة: ملف robots.txt يمنع كل الزواحف من مسارات النصوص، والزواحف تقرأ صفحات الملخص العامة.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full text-[11px] ${tp}`}>
              <thead>
                <tr className={ts}>
                  <th className="p-1 text-right">اليوم</th>
                  <th className="p-1 text-right">الزاحف</th>
                  <th className="p-1 text-right">ثبتت هويته</th>
                  <th className="p-1 text-right">لم تثبت</th>
                  <th className="p-1 text-right">رُفض</th>
                </tr>
              </thead>
              <tbody>
                {crawlerRows.map((c) => (
                  <tr key={`${c.day}-${c.provider}`} className={`border-t ${line}`}>
                    <td className="p-1">{c.day}</td>
                    <td className="p-1" dir="ltr">{VERIFIED_CRAWLERS.find((x) => x.id === c.provider)?.label ?? c.provider}</td>
                    <td className="p-1">{c.verified}</td>
                    <td className="p-1">{c.notVerified}</td>
                    <td className="p-1">{c.refused}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Batch l12 (Q100a): the non-subscriber list cap, its own settings and route. */}
      <LibraryListCapPanel isDark={isDark} card={card} />
    </div>
  );
}

/** The API answers the settings already shaped; re-validate them through the row parser's rules. */
function publicViewSettingsFromRowLike(value: unknown): PublicViewSettings {
  const s = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return publicViewSettingsFromRow({
    non_subscriber_view_limit_enabled: s.enabled,
    non_subscriber_daily_view_limit: s.dailyViews,
    non_subscriber_address_daily_limit: s.addressDailyViews,
    crawler_view_limits: s.crawlers,
    agent_view_limits: s.agents,
    rule_sequence_on: s.sequenceOn,
    rule_sequence_docs: s.sequenceDocs,
    rule_sequence_gap_seconds: s.sequenceGapSeconds,
    rule_parallel_on: s.parallelOn,
    rule_parallel_sessions: s.parallelSessions,
    rule_parallel_minutes: s.parallelMinutes,
    alert_emails: s.alertEmails,
  });
}
