"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckCircle, XCircle, ArrowClockwise, Trash } from "@phosphor-icons/react";
import {
  LIBRARY_ACCOUNT_LOCKED_AR,
  LIBRARY_ACCOUNT_KEYS,
  LIBRARY_ACCOUNT_LABELS_AR,
  type LibraryAccessMap,
  type LibraryAccountKey,
} from "@/lib/library/accountAccess";

/**
 * Admin → «المكتبة حسب نوع الحساب» (owner item 9, batch l8).
 * GET/PUT /api/v1/admin/library-access — one switch per account type; a change
 * applies on the next library request, no deploy. POST/DELETE — one account's
 * exception (a team member, a trial). Every change is audited (who, when,
 * before/after) and the last changes are listed here.
 */

interface Override {
  userId: string;
  allowed: boolean;
  reason: string;
  updatedAt: string | null;
  name: string;
  email: string;
  userType: string | null;
}
interface HistoryRow {
  action: string;
  actor_email: string | null;
  target_id: string | null;
  before_state: unknown;
  after_state: unknown;
  created_at: string;
}
interface State {
  map: LibraryAccessMap;
  overrides: Override[];
  overridesMigrationMissing: boolean;
  history: HistoryRow[];
}

const ACTION_AR: Record<string, string> = {
  library_access_by_account_type_updated: "تغيير مفاتيح الأنواع",
  library_access_override_set: "استثناء لحساب",
  library_access_override_removed: "حذف استثناء",
};

function when(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-SA-u-nu-arab", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function stateText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if ("allowed" in o) return o.allowed === true ? "مفتوحة" : "مغلقة";
    return LIBRARY_ACCOUNT_KEYS.filter((k) => o[k] === true).map((k) => LIBRARY_ACCOUNT_LABELS_AR[k]).join("، ") || "لا أحد";
  }
  return String(v);
}

export default function AdminLibraryAccessPage() {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<LibraryAccountKey | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [email, setEmail] = useState("");
  const [allowed, setAllowed] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/v1/admin/library-access", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.map) {
        setLoadError(typeof body?.error === "string" ? body.error : "تعذّر تحميل الإعداد");
        return;
      }
      setState({
        map: body.map,
        overrides: Array.isArray(body.overrides) ? body.overrides : [],
        overridesMigrationMissing: body.overridesMigrationMissing === true,
        history: Array.isArray(body.history) ? body.history : [],
      });
    } catch {
      setLoadError("تعذّر تحميل الإعداد");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggle(key: LibraryAccountKey) {
    if (!state) return;
    const next = !state.map[key];
    setSaving(key);
    setToast(null);
    try {
      const res = await fetch("/api/v1/admin/library-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ map: { [key]: next } }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setToast({ ok: false, msg: typeof body?.error === "string" ? body.error : "تعذّر الحفظ" });
      } else {
        setToast({ ok: true, msg: `${LIBRARY_ACCOUNT_LABELS_AR[key]}: المكتبة ${next ? "مفتوحة" : "مغلقة"} الآن` });
        await load();
      }
    } catch {
      setToast({ ok: false, msg: "تعذّر الحفظ" });
    } finally {
      setSaving(null);
    }
  }

  async function addOverride() {
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch("/api/v1/admin/library-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), allowed, reason: reason.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setToast({ ok: false, msg: typeof body?.error === "string" ? body.error : "تعذّر حفظ الاستثناء" });
      } else {
        setToast({ ok: true, msg: "حُفظ الاستثناء" });
        setEmail("");
        setReason("");
        await load();
      }
    } catch {
      setToast({ ok: false, msg: "تعذّر حفظ الاستثناء" });
    } finally {
      setBusy(false);
    }
  }

  async function removeOverride(userId: string) {
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch(`/api/v1/admin/library-access?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
      const body = await res.json().catch(() => null);
      setToast(res.ok ? { ok: true, msg: "حُذف الاستثناء" } : { ok: false, msg: typeof body?.error === "string" ? body.error : "تعذّر الحذف" });
      if (res.ok) await load();
    } catch {
      setToast({ ok: false, msg: "تعذّر الحذف" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full p-6 md:p-8" dir="rtl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#C8A762]/20 bg-[#C8A762]/10">
            <BookOpen size={22} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">المكتبة حسب نوع الحساب</h1>
            <p className="text-[12px] text-zinc-500">
              يسري التغيير فوراً على صفحات المكتبة داخل الحساب وواجهاتها البرمجية والبحث ومساعد المكتبة والإضافة للمسودة وشراء باقات المكتبة.
              صفحات المكتبة العامة للزائر لا تتأثر. كل تغيير يُسجَّل.
            </p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] px-4 py-2 text-[12px] font-bold text-zinc-300 hover:bg-white/[0.04]"
        >
          <ArrowClockwise size={14} /> تحديث
        </button>
      </div>

      {toast && (
        <div className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-semibold ${
          toast.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {toast.ok ? <CheckCircle size={16} weight="fill" /> : <XCircle size={16} weight="fill" />}
          {toast.msg}
        </div>
      )}

      {loadError && <p role="alert" className="mb-4 text-[13px] text-red-300">{loadError}</p>}
      {!state && !loadError && <p className="text-[13px] text-zinc-500">جارٍ التحميل…</p>}

      {state && (
        <>
          <section className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
            <h2 className="mb-1 text-[14px] font-bold text-white">مفاتيح الأنواع</h2>
            <p className="mb-4 text-[11px] text-zinc-500">
              رسالة الحساب المغلق: «{LIBRARY_ACCOUNT_LOCKED_AR}». المحامي العضو في مكتب يتبع نوع حسابه (محامٍ). المدير مفتوح دائماً.
            </p>
            <ul className="divide-y divide-white/[0.06]">
              {LIBRARY_ACCOUNT_KEYS.map((key) => {
                const on = state.map[key];
                return (
                  <li key={key} className="flex items-center justify-between gap-4 py-3">
                    <span className="text-[13px] text-zinc-200">{LIBRARY_ACCOUNT_LABELS_AR[key]}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`المكتبة لـ${LIBRARY_ACCOUNT_LABELS_AR[key]}`}
                      disabled={saving !== null}
                      onClick={() => void toggle(key)}
                      className={`min-w-[96px] rounded-xl border px-3 py-1.5 text-[12px] font-bold transition-colors disabled:opacity-50 ${
                        on ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-500/30 bg-zinc-500/10 text-zinc-300"
                      }`}
                    >
                      {saving === key ? "…" : on ? "مفتوحة" : "مغلقة"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
            <h2 className="mb-1 text-[14px] font-bold text-white">استثناءات لحسابات بعينها</h2>
            <p className="mb-4 text-[11px] text-zinc-500">يفتح الاستثناء المكتبة لحساب واحد (فريق، تجربة) أو يغلقها عنه، أياً كان مفتاح نوعه.</p>
            {state.overridesMigrationMissing ? (
              <p className="text-[12px] text-amber-300">الاستثناءات غير متاحة بعد: شغّل ملف الترحيل 20261128_20_library_access_by_account_type.sql.</p>
            ) : (
              <>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="البريد الإلكتروني للحساب"
                    dir="ltr"
                    className="rounded-xl border border-white/[0.08] bg-[#0d1117] px-3 py-2 text-sm text-white outline-none sm:col-span-1"
                  />
                  <select
                    value={allowed ? "open" : "closed"}
                    onChange={(e) => setAllowed(e.target.value === "open")}
                    className="rounded-xl border border-white/[0.08] bg-[#0d1117] px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="open">فتح المكتبة له</option>
                    <option value="closed">إغلاق المكتبة عنه</option>
                  </select>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="السبب (إلزامي)"
                    className="rounded-xl border border-white/[0.08] bg-[#0d1117] px-3 py-2 text-sm text-white outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy || !email.trim() || reason.trim().length < 3}
                    onClick={() => void addOverride()}
                    className="rounded-xl bg-[#0B3D2E] px-4 py-2 text-[13px] font-bold text-[#C8A762] hover:bg-[#155e41] disabled:opacity-50"
                  >
                    حفظ الاستثناء
                  </button>
                </div>
                {state.overrides.length === 0 ? (
                  <p className="text-[12px] text-zinc-500">لا استثناءات.</p>
                ) : (
                  <ul className="divide-y divide-white/[0.06]">
                    {state.overrides.map((o) => (
                      <li key={o.userId} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[12px]">
                        <span className="text-zinc-200">
                          {o.name || "—"} <span dir="ltr" className="text-zinc-500">{o.email}</span>
                        </span>
                        <span className={o.allowed ? "text-emerald-300" : "text-red-300"}>{o.allowed ? "مفتوحة له" : "مغلقة عنه"}</span>
                        <span className="text-zinc-400">{o.reason}</span>
                        <span className="text-zinc-500">{when(o.updatedAt)}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removeOverride(o.userId)}
                          aria-label="حذف الاستثناء"
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] disabled:opacity-50"
                        >
                          <Trash size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
            <h2 className="mb-3 text-[14px] font-bold text-white">سجل التغييرات</h2>
            {state.history.length === 0 ? (
              <p className="text-[12px] text-zinc-500">لا تغييرات مسجّلة بعد.</p>
            ) : (
              <ul className="space-y-2 text-[12px]">
                {state.history.map((h, i) => (
                  <li key={`${h.created_at}-${i}`} className="rounded-xl border border-white/[0.04] px-3 py-2 text-zinc-300">
                    <span className="font-bold text-white">{ACTION_AR[h.action] ?? h.action}</span>
                    {" — "}<span dir="ltr" className="text-zinc-400">{h.actor_email ?? "—"}</span>
                    {" — "}<span className="text-zinc-500">{when(h.created_at)}</span>
                    <div className="mt-1 text-zinc-400">
                      قبل: {stateText(h.before_state)} · بعد: {stateText(h.after_state)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
