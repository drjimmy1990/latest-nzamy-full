"use client";

/**
 * FirmRulesCard — batch l12 firm (20261202_80): two platform settings the
 * owner's answers of 20 Nov left as his assistant's defaults, so they are
 * admin switches, not constants. Both written through PATCH
 * /api/v1/admin/settings, which validates and audits each write.
 *   - firm_case_scope           (Q112: which firm roles see only the cases
 *                                assigned to them; read by the database's RLS)
 *   - founder_storage_fair_use  (N21: the founder's internal storage line and
 *                                its alert; never shown on a marketing page)
 * A key with no row shows the default the database applies and says so.
 */

import { useEffect, useState } from "react";
import { Buildings, FloppyDisk, SpinnerGap } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  FIRM_CASE_ALWAYS_SCOPED_ROLES,
  FIRM_CASE_OPTIONAL_SCOPED_ROLES,
  FIRM_CASE_SCOPE_KEY,
  FIRM_SCOPE_ROLE_LABEL_AR,
  firmCaseScopeValue,
  parseFirmCaseScope,
} from "@/lib/firm/firmCaseScope";
import { FOUNDER_STORAGE_KEY, parseFounderStorage } from "@/lib/membership/founderStorage";

type Status = { key: string; ok: boolean; text: string } | null;

async function patchSetting(key: string, value: unknown): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await fetch("/api/v1/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (res.ok) return { ok: true, text: "حُفظ، ويسري فوراً." };
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return { ok: false, text: typeof body?.error === "string" && body.error ? body.error : "تعذّر الحفظ، حاول مرة أخرى." };
  } catch {
    return { ok: false, text: "تعذّر الحفظ، حاول مرة أخرى." };
  }
}

export function FirmRulesCard() {
  const { isDark } = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [stored, setStored] = useState<Record<string, boolean>>({});
  const [roles, setRoles] = useState<string[]>([...FIRM_CASE_OPTIONAL_SCOPED_ROLES]);
  const [financeNoCases, setFinanceNoCases] = useState(true);
  const [gb, setGb] = useState("25");
  const [pct, setPct] = useState("80");
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: Record<string, unknown> } | null) => {
        if (cancelled) return;
        const s = body?.data ?? {};
        setStored({ [FIRM_CASE_SCOPE_KEY]: s[FIRM_CASE_SCOPE_KEY] !== undefined, [FOUNDER_STORAGE_KEY]: s[FOUNDER_STORAGE_KEY] !== undefined });
        const scope = parseFirmCaseScope(s[FIRM_CASE_SCOPE_KEY]);
        setRoles(scope.assignedOnlyRoles);
        setFinanceNoCases(scope.financeManagerNoCases);
        const storage = parseFounderStorage(s[FOUNDER_STORAGE_KEY]);
        setGb(String(storage.gb));
        setPct(String(storage.alertPct));
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(key: string, value: unknown) {
    setSaving(key);
    const r = await patchSetting(key, value);
    setStatus({ key, ...r });
    if (r.ok) setStored((p) => ({ ...p, [key]: true }));
    setSaving(null);
  }

  function saveScope() {
    const ordered = FIRM_CASE_OPTIONAL_SCOPED_ROLES.filter((r) => roles.includes(r));
    void save(FIRM_CASE_SCOPE_KEY, firmCaseScopeValue({ assignedOnlyRoles: ordered, financeManagerNoCases: financeNoCases }));
  }

  function saveStorage() {
    const g = /^\d+$/.test(gb.trim()) ? Number(gb.trim()) : NaN;
    const p = /^\d+$/.test(pct.trim()) ? Number(pct.trim()) : NaN;
    if (!(g >= 1 && g <= 10_000) || !(p >= 1 && p <= 100)) {
      setStatus({ key: FOUNDER_STORAGE_KEY, ok: false, text: "أدخل عدداً صحيحاً للجيجابايت (١–١٠٠٠٠) ونسبة تنبيه من ١ إلى ١٠٠." });
      return;
    }
    void save(FOUNDER_STORAGE_KEY, { gb: g, alert_pct: p });
  }

  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-100 bg-white shadow-sm";
  const label = `text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`;
  const hint = `text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`;
  const input = `w-24 rounded-xl border px-3 py-2 text-[13px] ${isDark ? "border-white/10 bg-zinc-800 text-white" : "border-slate-200 bg-white text-slate-800"}`;
  const notStored = (key: string) =>
    loaded && !stored[key] ? <span className={`ms-2 text-[11px] font-normal ${isDark ? "text-amber-300" : "text-amber-700"}`}>(القيمة الافتراضية — لم تُحفظ بعد)</span> : null;
  const note = (key: string) =>
    status?.key === key ? (
      <p role="status" className={`mt-2 text-[12px] ${status.ok ? (isDark ? "text-emerald-300" : "text-emerald-700") : isDark ? "text-red-300" : "text-red-700"}`}>
        {status.text}
      </p>
    ) : null;
  const saveButton = (key: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!loaded || saving !== null}
      className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-[#C8A762] disabled:opacity-50"
    >
      {saving === key ? <SpinnerGap size={14} className="animate-spin" /> : <FloppyDisk size={14} />} حفظ
    </button>
  );

  return (
    <div className={card} dir="rtl">
      <div className={`flex items-center gap-2 border-b px-6 py-4 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
        <Buildings size={18} className="text-[#C8A762]" />
        <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>قواعد المكاتب وعضوية المؤسس</h2>
      </div>

      <div className="space-y-6 p-6">
        <section>
          <p className={label}>من يرى من أعضاء المكتب القضايا المسندة إليه وحدها{notStored(FIRM_CASE_SCOPE_KEY)}</p>
          <p className={`mt-1 ${hint}`}>
            {FIRM_CASE_ALWAYS_SCOPED_ROLES.map((r) => FIRM_SCOPE_ROLE_LABEL_AR[r]).join(" و")} يريان ما يُسند إليهما وحده دائماً. واختر
            معهما من الأدوار الإدارية؛ ومن لم تختره يرى كل قضايا المكتب غير المقيّدة. الشركاء والمحامون لا يتأثرون.
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            {FIRM_CASE_OPTIONAL_SCOPED_ROLES.map((r) => (
              <label key={r} className={`flex items-center gap-2 ${hint}`}>
                <input
                  type="checkbox"
                  checked={roles.includes(r)}
                  onChange={(e) => setRoles((p) => (e.target.checked ? [...p, r] : p.filter((x) => x !== r)))}
                />
                {FIRM_SCOPE_ROLE_LABEL_AR[r]}
              </label>
            ))}
            <label className={`flex items-center gap-2 ${hint}`}>
              <input type="checkbox" checked={financeNoCases} onChange={(e) => setFinanceNoCases(e.target.checked)} />
              {FIRM_SCOPE_ROLE_LABEL_AR.finance_manager}: يرى المالية والأتعاب دون ملفات القضايا
            </label>
          </div>
          <div className="mt-3">{saveButton(FIRM_CASE_SCOPE_KEY, saveScope)}</div>
          {note(FIRM_CASE_SCOPE_KEY)}
        </section>

        <section className={`border-t pt-6 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <p className={label}>حدّ الاستعمال العادل لتخزين العضو المؤسس{notStored(FOUNDER_STORAGE_KEY)}</p>
          <p className={`mt-1 ${hint}`}>
            حدّ داخلي لا يُذكر في أي صفحة تسويقية. حين تبلغ ملفات العضو المؤسس نسبة التنبيه منه يصله إشعار في حسابه ورسالة بريد مرة
            واحدة في الشهر، ولا يُوقف عنه شيء.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className={`flex items-center gap-2 ${hint}`}>
              جيجابايت
              <input className={input} inputMode="numeric" value={gb} onChange={(e) => setGb(e.target.value)} aria-label="حد الاستعمال العادل بالجيجابايت" />
            </label>
            <label className={`flex items-center gap-2 ${hint}`}>
              نسبة التنبيه ٪
              <input className={input} inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value)} aria-label="نسبة التنبيه" />
            </label>
            {saveButton(FOUNDER_STORAGE_KEY, saveStorage)}
          </div>
          {note(FOUNDER_STORAGE_KEY)}
        </section>
      </div>
    </div>
  );
}
