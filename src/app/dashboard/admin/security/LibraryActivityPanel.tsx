"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowClockwise, CheckCircle, FloppyDisk, Gauge, LockSimple, Trash, UserFocus } from "@phosphor-icons/react";
import type { FlagDto, LimitDto } from "@/lib/library/monitorAdmin";
import {
  FLAG_ACTION_AR,
  FLAG_ACTIONS,
  MONITOR_SETTINGS_DEFAULTS,
  MONITOR_SETTINGS_FIELDS,
  type MonitorSettings,
  type SettingsGroup,
} from "@/lib/library/monitorSettings";

/**
 * «نشاط المكتبة» (20261031_10) — who reads the legal library how much, which
 * accounts are «قيد المراجعة», each reader's own limit, and EVERY number of
 * the library protection (the caps included), editable here.
 *   GET  /api/v1/admin/library-monitor/activity?range=today|week
 *   GET  /api/v1/admin/library-monitor/flags?state=open|all
 *   POST /api/v1/admin/library-monitor/flags/[id]/clear     { note?, liftSlow }
 *   GET  /api/v1/admin/library-monitor/user-limits
 *   POST /api/v1/admin/library-monitor/user-limits          { email, dailyDocs?, hourlyDocs?, until?, note }
 *   DELETE /api/v1/admin/library-monitor/user-limits/[userId]
 *   GET|PUT /api/v1/admin/library-monitor/settings
 *   POST /api/v1/admin/library-security-locks               { userId, note } (the lock itself)
 */

type Props = { isDark: boolean; card: string };

interface ActivityRow {
  userId: string;
  user: { name: string | null; email: string | null };
  userType: string | null;
  requests: number;
  docs: number;
  searches: number;
  aiCalls: number;
  activeHours: number;
  lastHour: string;
  flagReference: string | null;
  lockReference: string | null;
  limit: { dailyDocs: number | null; hourlyDocs: number | null; until: string | null; source: string } | null;
}

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
};

const GROUP_TITLE: Record<SettingsGroup, string> = {
  caps: "حدود القراءة",
  rules: "قواعد وضع الحساب قيد المراجعة",
  action: "الإجراء عند المراجعة",
  alerts: "التنبيهات والسجل",
};

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; body: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, body };
  } catch {
    return { ok: false, body: { error: "تعذّر الاتصال بالخادم." } };
  }
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export default function LibraryActivityPanel({ isDark, card }: Props) {
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [missing, setMissing] = useState<string | null>(null);

  const [range, setRange] = useState<"today" | "week">("today");
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);

  const [flagState, setFlagState] = useState<"open" | "all">("open");
  const [flags, setFlags] = useState<FlagDto[]>([]);
  const [clearNote, setClearNote] = useState<Record<string, string>>({});
  const [keepSlow, setKeepSlow] = useState<Record<string, boolean>>({});

  const [limits, setLimits] = useState<LimitDto[]>([]);
  const [limitForm, setLimitForm] = useState({ email: "", dailyDocs: "", hourlyDocs: "", until: "", note: "" });

  const [lockNote, setLockNote] = useState<Record<string, string>>({});
  const [lockOpen, setLockOpen] = useState<string | null>(null);

  const [saved, setSaved] = useState<MonitorSettings>({ ...MONITOR_SETTINGS_DEFAULTS });
  const [draft, setDraft] = useState<MonitorSettings>({ ...MONITOR_SETTINGS_DEFAULTS });
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);

  const tp = isDark ? "text-white" : "text-slate-800";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";
  const line = isDark ? "border-white/[0.06]" : "border-slate-100";
  const input = `w-full rounded-lg border px-3 py-2 text-[12px] outline-none ${
    isDark ? "border-white/10 bg-zinc-900 text-white" : "border-slate-200 bg-white text-slate-800"
  }`;
  const pill = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-[11px] font-bold ${on ? (isDark ? "bg-white/10 text-white" : "bg-slate-800 text-white") : ts}`;

  const loadRows = useCallback(async () => {
    setLoadingRows(true);
    const { ok, body } = await call(`/api/v1/admin/library-monitor/activity?range=${range}`);
    setRows(ok && Array.isArray(body?.data) ? (body!.data as ActivityRow[]) : []);
    if (!ok) setNotice({ ok: false, msg: String(body?.error ?? "تعذّر تحميل النشاط.") });
    if (body?.migrationMissing) setMissing(String(body.message ?? ""));
    setLoadingRows(false);
  }, [range]);

  const loadFlags = useCallback(async () => {
    const { ok, body } = await call(`/api/v1/admin/library-monitor/flags?state=${flagState}`);
    setFlags(ok && Array.isArray(body?.data) ? (body!.data as FlagDto[]) : []);
  }, [flagState]);

  const loadLimits = useCallback(async () => {
    const { ok, body } = await call("/api/v1/admin/library-monitor/user-limits");
    setLimits(ok && Array.isArray(body?.data) ? (body!.data as LimitDto[]) : []);
  }, []);

  const loadSettings = useCallback(async () => {
    const { ok, body } = await call("/api/v1/admin/library-monitor/settings");
    if (ok && body?.settings && typeof body.settings === "object") {
      setSaved(body.settings as MonitorSettings);
      setDraft(body.settings as MonitorSettings);
      setUpdatedAt(typeof body.updatedAt === "string" ? body.updatedAt : null);
    }
    if (body?.migrationMissing) setMissing(String(body.message ?? ""));
  }, []);

  useEffect(() => { loadRows(); }, [loadRows]);
  useEffect(() => { loadFlags(); }, [loadFlags]);
  useEffect(() => { loadLimits(); loadSettings(); }, [loadLimits, loadSettings]);

  const changed = useMemo(
    () => MONITOR_SETTINGS_FIELDS.filter((f) => draft[f.key] !== saved[f.key]).map((f) => f.key),
    [draft, saved],
  );

  async function saveSettings() {
    setBusy("settings");
    setNotice(null);
    const patch = Object.fromEntries(changed.map((k) => [k, draft[k]]));
    const { ok, body } = await call("/api/v1/admin/library-monitor/settings", json("PUT", patch));
    if (!ok) setNotice({ ok: false, msg: String(body?.error ?? "تعذّر حفظ الإعدادات.") });
    else {
      setSaved(body!.settings as MonitorSettings);
      setDraft(body!.settings as MonitorSettings);
      setUpdatedAt(typeof body!.updatedAt === "string" ? body!.updatedAt : null);
      setNotice({ ok: true, msg: "حُفظت الإعدادات. تسري على القرّاء خلال دقيقة." });
    }
    setBusy(null);
  }

  async function clearFlag(f: FlagDto) {
    setBusy(f.id);
    setNotice(null);
    const { ok, body } = await call(
      `/api/v1/admin/library-monitor/flags/${f.id}/clear`,
      json("POST", { note: clearNote[f.id] ?? "", liftSlow: !(keepSlow[f.id] ?? false) }),
    );
    if (!ok) setNotice({ ok: false, msg: String(body?.error ?? "تعذّر إغلاق المراجعة.") });
    else {
      setNotice({
        ok: true,
        msg: `أُغلقت المراجعة ${f.reference}.${body?.slowRemoved ? " وأُزيل الإبطاء التلقائي." : ""}${
          f.actionTaken === "lock" ? " القفل نفسه يُرفع من تبويب «قفل المكتبة»." : ""
        }`,
      });
      await Promise.all([loadFlags(), loadLimits(), loadRows()]);
    }
    setBusy(null);
  }

  async function setLimit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("limit");
    setNotice(null);
    const { ok, body } = await call(
      "/api/v1/admin/library-monitor/user-limits",
      json("POST", {
        email: limitForm.email.trim(),
        dailyDocs: limitForm.dailyDocs,
        hourlyDocs: limitForm.hourlyDocs,
        until: limitForm.until ? new Date(limitForm.until).toISOString() : null,
        note: limitForm.note.trim(),
      }),
    );
    if (!ok) setNotice({ ok: false, msg: String(body?.error ?? "تعذّر حفظ الحد الخاص.") });
    else {
      setNotice({ ok: true, msg: "حُفظ الحد الخاص. يسري خلال دقيقة." });
      setLimitForm({ email: "", dailyDocs: "", hourlyDocs: "", until: "", note: "" });
      await Promise.all([loadLimits(), loadRows()]);
    }
    setBusy(null);
  }

  async function removeLimit(l: LimitDto) {
    setBusy(`limit:${l.userId}`);
    setNotice(null);
    const { ok, body } = await call(`/api/v1/admin/library-monitor/user-limits/${l.userId}`, { method: "DELETE" });
    if (!ok) setNotice({ ok: false, msg: String(body?.error ?? "تعذّر إزالة الحد الخاص.") });
    else {
      setNotice({ ok: true, msg: "أُزيل الحد الخاص؛ يعود القارئ إلى الحدود العامة خلال دقيقة." });
      await Promise.all([loadLimits(), loadRows()]);
    }
    setBusy(null);
  }

  async function lockReader(r: ActivityRow) {
    const note = (lockNote[r.userId] ?? "").trim();
    if (!note) {
      setNotice({ ok: false, msg: "اكتب سبب الإيقاف أولاً." });
      return;
    }
    setBusy(`lock:${r.userId}`);
    setNotice(null);
    const { ok, body } = await call("/api/v1/admin/library-security-locks", json("POST", { userId: r.userId, note }));
    if (!ok) setNotice({ ok: false, msg: String(body?.error ?? "تعذّر إيقاف القراءة.") });
    else {
      const ref = (body?.data as { reference?: string } | undefined)?.reference ?? "";
      setNotice({ ok: true, msg: `أُوقفت قراءة المكتبة لهذا الحساب — المرجع ${ref}. يُرفع من تبويب «قفل المكتبة».` });
      setLockOpen(null);
      await loadRows();
    }
    setBusy(null);
  }

  const who = (u: { name: string | null; email: string | null }, id: string) => u.name || u.email || id;

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <p className={`text-[13px] font-bold mb-1 ${tp}`}>نشاط المكتبة — من يقرأ وكم</p>
        <p className={`text-[11px] leading-relaxed ${ts}`}>
          يُعدّ لكل حساب مسجّل: الوثائق المختلفة التي فتحها (عدّ دقيق)، وطلباته لفتح الوثائق وعمليات البحث واستدعاءات
          مساعد المكتبة (عدّ تقريبي يُرسل على دفعات كل نصف دقيقة؛ تصفّح قوائم الفهرس لا يُعدّ). إذا تجاوز حساب إحدى القواعد أدناه يُوضع «قيد المراجعة»
          ويصلك تنبيه في جرس المنصة. الزوار غير المسجّلين لا يُعدّون هنا (لا حساب يُنسب إليه النشاط)، ولا يُرسل بريد
          إلكتروني — التنبيه داخل المنصة فقط.
        </p>
      </div>

      {missing && (
        <p className={`rounded-xl border px-4 py-2 text-[11px] ${isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {missing}
        </p>
      )}

      {notice && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-2.5 text-[12px] ${
            notice.ok
              ? isDark ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-800"
              : isDark ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {notice.msg}
        </div>
      )}

      {/* ── top readers ── */}
      <div className={`${card} p-5`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className={`text-[12px] font-bold ${tp}`}>الأكثر قراءة</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setRange("today")} className={pill(range === "today")}>اليوم</button>
            <button onClick={() => setRange("week")} className={pill(range === "week")}>آخر ٧ أيام</button>
            <button onClick={loadRows} className={`inline-flex items-center gap-1 px-2 text-[11px] ${ts}`}>
              <ArrowClockwise size={12} /> تحديث
            </button>
          </div>
        </div>
        {loadingRows ? (
          <p className={`py-6 text-center text-[12px] ${ts}`}>جارِ التحميل…</p>
        ) : rows.length === 0 ? (
          <p className={`py-6 text-center text-[12px] ${ts}`}>لا يوجد نشاط مسجّل في هذه الفترة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className={`border-b ${line}`}>
                  {["الحساب", "وثائق", "طلبات", "بحث", "مساعد", "ساعات نشطة", "آخر نشاط", "الحالة", ""].map((h) => (
                    <th key={h} className={`px-2 py-2 text-[10px] font-bold ${ts}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId} className={`border-b align-top ${line} ${r.flagReference ? (isDark ? "bg-amber-500/[0.06]" : "bg-amber-50/60") : ""}`}>
                    <td className="px-2 py-2">
                      <p className={`text-[12px] font-bold ${tp}`}>{who(r.user, r.userId)}</p>
                      {r.user.email && r.user.name && <p dir="ltr" className={`text-[10px] ${ts}`}>{r.user.email}</p>}
                      {r.userType === "admin" && <p className={`text-[10px] ${ts}`}>مسؤول — مستثنى من الحدود</p>}
                    </td>
                    <td className={`px-2 py-2 text-[12px] font-bold ${tp}`}>{r.docs}</td>
                    <td className={`px-2 py-2 text-[12px] ${ts}`}>{r.requests}</td>
                    <td className={`px-2 py-2 text-[12px] ${ts}`}>{r.searches}</td>
                    <td className={`px-2 py-2 text-[12px] ${ts}`}>{r.aiCalls}</td>
                    <td className={`px-2 py-2 text-[12px] ${ts}`}>{r.activeHours}</td>
                    <td className={`px-2 py-2 text-[10px] ${ts}`}>{fmt(r.lastHour)}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        {r.flagReference && <span className="w-fit rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">قيد المراجعة · {r.flagReference}</span>}
                        {r.lockReference && <span className="w-fit rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">موقوف · {r.lockReference}</span>}
                        {r.limit && (
                          <span className="w-fit rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400">
                            {r.limit.source === "auto_slow" ? "مُبطأ" : "حد خاص"}: {r.limit.dailyDocs ?? "—"}/يوم · {r.limit.hourlyDocs ?? "—"}/ساعة
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {r.userType !== "admin" && (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => setLimitForm({ ...limitForm, email: r.user.email ?? "" })}
                            className={`inline-flex items-center gap-1 text-[10px] font-bold ${isDark ? "text-blue-300" : "text-blue-700"}`}
                          >
                            <Gauge size={11} /> حد خاص
                          </button>
                          {!r.lockReference && (lockOpen === r.userId ? (
                            <div className="flex flex-col gap-1">
                              <input
                                type="text"
                                maxLength={1000}
                                placeholder="سبب الإيقاف (للسجل)"
                                value={lockNote[r.userId] ?? ""}
                                onChange={(e) => setLockNote({ ...lockNote, [r.userId]: e.target.value })}
                                className={`${input} min-w-[160px]`}
                              />
                              <button
                                onClick={() => lockReader(r)}
                                disabled={busy === `lock:${r.userId}`}
                                className="rounded-lg bg-red-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-500 disabled:opacity-50"
                              >
                                تأكيد الإيقاف
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setLockOpen(r.userId)} className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400">
                              <LockSimple size={11} /> إيقاف القراءة
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── review flags ── */}
      <div className={`${card} p-5`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className={`text-[12px] font-bold ${tp}`}>حسابات قيد المراجعة</p>
          <div className="flex gap-1">
            <button onClick={() => setFlagState("open")} className={pill(flagState === "open")}>المفتوحة</button>
            <button onClick={() => setFlagState("all")} className={pill(flagState === "all")}>كل السجل</button>
          </div>
        </div>
        {flags.length === 0 ? (
          <p className={`py-6 text-center text-[12px] ${ts}`}>{flagState === "open" ? "لا يوجد حساب قيد المراجعة الآن." : "لا يوجد سجل مراجعات."}</p>
        ) : (
          <div className="space-y-2">
            {flags.map((f) => (
              <div key={f.id} className={`rounded-xl border p-3 ${line}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <UserFocus size={14} className={f.open ? "text-amber-500" : "text-emerald-500"} />
                    <span dir="ltr" className={`font-mono text-[12px] font-bold ${tp}`}>#{f.reference}</span>
                    <span className={`text-[12px] ${tp}`}>{who(f.user, f.userId)}</span>
                    {f.user.email && f.user.name && <span dir="ltr" className={`text-[11px] ${ts}`}>{f.user.email}</span>}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${f.open ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                    {f.open ? "مفتوحة" : "أُغلقت"}
                  </span>
                </div>
                <div className={`mt-1.5 grid gap-x-4 gap-y-0.5 text-[11px] md:grid-cols-2 ${ts}`}>
                  <span>السبب: {f.rulesAr.join("، ")}</span>
                  <span>منذ: {fmt(f.createdAt)}</span>
                  <span>الإجراء: {f.actionAr}</span>
                  {f.details && (
                    <span>
                      وثائق اليوم {String(f.details.docs_today ?? "—")} من {String(f.details.day_limit ?? "—")} · ٧ أيام {String(f.details.week_docs ?? "—")} ·
                      طلبات الساعة {String(f.details.hour_requests ?? "—")} · بحث الساعة {String(f.details.hour_searches ?? "—")}
                    </span>
                  )}
                  {!f.open && (
                    <span>أُغلقت: {fmt(f.clearedAt)}{f.clearedBy ? ` — ${f.clearedBy.name || f.clearedBy.email || "مسؤول"}` : ""}{f.clearNote ? ` — ${f.clearNote}` : ""}</span>
                  )}
                </div>
                {f.open && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="ملاحظة الإغلاق (اختياري)"
                      maxLength={1000}
                      value={clearNote[f.id] ?? ""}
                      onChange={(e) => setClearNote({ ...clearNote, [f.id]: e.target.value })}
                      className={`${input} max-w-xs`}
                    />
                    {f.actionTaken === "slow" && (
                      <label className={`inline-flex items-center gap-1 text-[11px] ${ts}`}>
                        <input type="checkbox" checked={keepSlow[f.id] ?? false} onChange={(e) => setKeepSlow({ ...keepSlow, [f.id]: e.target.checked })} />
                        أبقِ الإبطاء
                      </label>
                    )}
                    <button
                      onClick={() => clearFlag(f)}
                      disabled={busy === f.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      <CheckCircle size={12} /> إغلاق المراجعة
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── per-user limits ── */}
      <div className={`${card} p-5 space-y-3`}>
        <p className={`text-[12px] font-bold ${tp}`}>حدود خاصة لحسابات بعينها</p>
        <p className={`text-[11px] ${ts}`}>تتقدّم على الحدود العامة لهذا الحساب وحده: اخفضها لحساب مشبوه، أو ارفعها لمكتب يحتاج أكثر.</p>
        <form onSubmit={setLimit} className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className={`mb-1 block text-[11px] ${ts}`}>بريد المستخدم</label>
            <input type="email" required dir="ltr" value={limitForm.email} onChange={(e) => setLimitForm({ ...limitForm, email: e.target.value })} className={input} />
          </div>
          <div>
            <label className={`mb-1 block text-[11px] ${ts}`}>وثائق/يوم</label>
            <input type="number" min={1} max={100000} value={limitForm.dailyDocs} onChange={(e) => setLimitForm({ ...limitForm, dailyDocs: e.target.value })} className={input} />
          </div>
          <div>
            <label className={`mb-1 block text-[11px] ${ts}`}>وثائق/ساعة</label>
            <input type="number" min={1} max={100000} value={limitForm.hourlyDocs} onChange={(e) => setLimitForm({ ...limitForm, hourlyDocs: e.target.value })} className={input} />
          </div>
          <div className="md:col-span-2">
            <label className={`mb-1 block text-[11px] ${ts}`}>ينتهي في (اختياري)</label>
            <input type="datetime-local" value={limitForm.until} onChange={(e) => setLimitForm({ ...limitForm, until: e.target.value })} className={input} />
          </div>
          <div className="md:col-span-5">
            <label className={`mb-1 block text-[11px] ${ts}`}>السبب (للسجل)</label>
            <input type="text" required maxLength={1000} value={limitForm.note} onChange={(e) => setLimitForm({ ...limitForm, note: e.target.value })} className={input} />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={busy === "limit"} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-bold text-white hover:bg-blue-500 disabled:opacity-50">
              حفظ الحد
            </button>
          </div>
        </form>
        {limits.length > 0 && (
          <div className="space-y-1.5">
            {limits.map((l) => (
              <div key={l.userId} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${line} ${l.active ? "" : "opacity-60"}`}>
                <div className={`text-[11px] ${ts}`}>
                  <span className={`font-bold ${tp}`}>{who(l.user, l.userId)}</span> — {l.dailyDocs ?? "—"} وثيقة/يوم · {l.hourlyDocs ?? "—"}/ساعة ·{" "}
                  {l.sourceAr} · {l.until ? `حتى ${fmt(l.until)}` : "حتى يُزال"}{!l.active ? " (انتهى)" : ""}{l.note ? ` — ${l.note}` : ""}
                </div>
                <button
                  onClick={() => removeLimit(l)}
                  disabled={busy === `limit:${l.userId}`}
                  className={`inline-flex items-center gap-1 text-[11px] font-bold ${isDark ? "text-zinc-400 hover:text-red-300" : "text-slate-500 hover:text-red-600"}`}
                >
                  <Trash size={12} /> إزالة
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── settings: every number, editable ── */}
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className={`text-[12px] font-bold ${tp}`}>الإعدادات — كل أرقام حماية المكتبة</p>
            <p className={`text-[10px] ${ts}`}>آخر تعديل: {fmt(updatedAt)}. التغيير يسري على القرّاء خلال دقيقة.</p>
          </div>
          <div className="flex items-center gap-2">
            {changed.length > 0 && (
              <button onClick={() => setDraft({ ...saved })} className={`text-[11px] ${ts}`}>تراجع</button>
            )}
            <button
              onClick={saveSettings}
              disabled={changed.length === 0 || busy === "settings" || !!missing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              <FloppyDisk size={13} /> حفظ {changed.length > 0 ? `(${changed.length})` : ""}
            </button>
          </div>
        </div>

        {(["caps", "rules", "action", "alerts"] as SettingsGroup[]).map((g) => (
          <div key={g} className={`rounded-xl border p-4 ${line}`}>
            <p className={`mb-3 text-[12px] font-bold ${tp}`}>{GROUP_TITLE[g]}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {MONITOR_SETTINGS_FIELDS.filter((f) => f.group === g).map((f) => {
                const disabled = f.type === "int" && !!f.toggle && draft[f.toggle] === false;
                if (f.type === "bool") {
                  return (
                    <label key={f.key} className={`flex items-center gap-2 text-[12px] md:col-span-2 ${tp}`}>
                      <input type="checkbox" checked={draft[f.key] === true} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.checked })} />
                      {f.labelAr}
                    </label>
                  );
                }
                if (f.type === "enum") {
                  return (
                    <div key={f.key} className="md:col-span-2">
                      <label className={`mb-1 block text-[11px] ${ts}`}>{f.labelAr}</label>
                      <div className="flex flex-wrap gap-2">
                        {FLAG_ACTIONS.map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => setDraft({ ...draft, [f.key]: a })}
                            className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold ${
                              draft[f.key] === a
                                ? isDark ? "border-[#C8A762] bg-[#C8A762]/10 text-white" : "border-[#0B3D2E] bg-[#0B3D2E]/5 text-slate-800"
                                : `${line} ${ts}`
                            }`}
                          >
                            {FLAG_ACTION_AR[a]}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={f.key} className={disabled ? "opacity-40" : ""}>
                    <label className={`mb-1 block text-[11px] ${ts}`}>{f.labelAr}</label>
                    <input
                      type="number"
                      min={f.min}
                      max={f.max}
                      disabled={disabled}
                      value={String(draft[f.key] ?? "")}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        // "" while the field is being retyped; the server names the field if it is saved empty.
                        setDraft({ ...draft, [f.key]: e.target.value === "" ? "" : Number.isFinite(n) ? Math.trunc(n) : draft[f.key] });
                      }}
                      className={input}
                    />
                    <p className={`mt-0.5 text-[9px] ${ts}`}>من {f.min} إلى {f.max}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <p className={`text-[10px] leading-relaxed ${ts}`}>
          غير مبني: قاعدة «يقرأ الوثائق بترتيب الفهرس» (لا تُكشف بدقة دون خطأ يطال القارئ العادي). الزوار غير المسجّلين
          يحكمهم حد الطلبات لكل عنوان IP فقط.
        </p>
      </div>
    </div>
  );
}
