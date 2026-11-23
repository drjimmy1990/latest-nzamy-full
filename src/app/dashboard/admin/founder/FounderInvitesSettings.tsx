"use client";

import { useEffect, useState } from "react";
import {
  FOUNDER_INVITES_DEFAULTS,
  FOUNDER_INVITES_KEY,
  founderInvitesIssue,
  founderInvitesValue,
  inviteGiftAr,
  parseFounderInvites,
  type FounderInvitesSettings as Settings,
} from "@/lib/founder/founderInvites";

/**
 * «دعوات العضو المؤسس» (batch l13, owner Q144 أ; SQL 20261203_20) — the
 * platform_settings.founder_invites row: invites a month, the invitee's
 * library-trial days, his points and their wallet, and how long a code stays
 * usable. Read and written through /api/v1/admin/settings (settings.write,
 * validated and audited there). A missing row shows the defaults the
 * database applies. The admin console is always dark.
 */

const FIELDS: Array<{ key: "monthly" | "trialDays" | "points" | "validDays"; label: string }> = [
  { key: "monthly", label: "الدعوات في الشهر لكل عضو" },
  { key: "trialDays", label: "أيام تجربة المكتبة للمدعو" },
  { key: "points", label: "نقاط المدعو (تنتهي بانتهاء التجربة)" },
  { key: "validDays", label: "صلاحية رمز الدعوة بالأيام" },
];

export default function FounderInvitesSettings() {
  const [loaded, setLoaded] = useState(false);
  const [stored, setStored] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<Settings["pointsScope"]>(FOUNDER_INVITES_DEFAULTS.pointsScope);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: Record<string, unknown> } | null) => {
        if (cancelled) return;
        const raw = body?.data?.[FOUNDER_INVITES_KEY];
        setStored(raw !== undefined && raw !== null);
        const s = parseFounderInvites(raw);
        setForm({ monthly: String(s.monthly), trialDays: String(s.trialDays), points: String(s.points), validDays: String(s.validDays) });
        setScope(s.pointsScope);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const draft: Settings = {
    monthly: Number(form.monthly),
    trialDays: Number(form.trialDays),
    points: Number(form.points),
    pointsScope: scope,
    validDays: Number(form.validDays),
  };
  const issue = founderInvitesIssue(founderInvitesValue(draft));

  async function save() {
    if (issue) return setNotice({ ok: false, msg: issue });
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: FOUNDER_INVITES_KEY, value: founderInvitesValue(draft) }),
      });
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      if (res.ok) {
        setStored(true);
        setNotice({ ok: true, msg: "حُفظ، ويسري على الدعوات الجديدة فوراً." });
      } else {
        setNotice({ ok: false, msg: typeof body?.error === "string" && body.error ? body.error : "تعذّر الحفظ." });
      }
    } catch {
      setNotice({ ok: false, msg: "تعذّر الحفظ." });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-5">
      <h2 className="mb-1 text-sm font-bold text-white">دعوات العضو المؤسس</h2>
      <p className="mb-3 text-[12px] leading-relaxed text-zinc-400">
        قرار المالك (س١٤٤ أ): يحصل المدعو على {issue ? inviteGiftAr(FOUNDER_INVITES_DEFAULTS) : inviteGiftAr(draft)}. لا تعمل
        الدعوات إلا والدفع الإلكتروني مفعّل.{stored ? "" : " لم يُحفظ إعداد بعد؛ المعروض هو الافتراضي."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-[12px] text-zinc-300">
            {f.label}
            <input
              type="number"
              inputMode="numeric"
              value={form[f.key] ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-1.5 text-sm text-white"
            />
          </label>
        ))}
        <label className="text-[12px] text-zinc-300">
          النقاط صالحة لـ
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value === "general" ? "general" : "library_agent")}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-1.5 text-sm text-white"
          >
            <option value="library_agent">مساعد المكتبة فقط</option>
            <option value="general">كل أدوات الذكاء الاصطناعي</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="mt-4 rounded-xl bg-[#C8A762] px-4 py-2 text-xs font-bold text-[#0B3D2E] disabled:opacity-50"
      >
        {busy ? "جارٍ الحفظ…" : "حفظ"}
      </button>
      {notice && (
        <p role="status" className={`mt-2 text-[12px] font-semibold ${notice.ok ? "text-emerald-300" : "text-amber-300"}`}>
          {notice.msg}
        </p>
      )}
    </section>
  );
}
