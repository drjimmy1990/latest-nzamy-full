"use client";

/**
 * /dashboard/admin/marketplace/orders — «طلبات السوق» (l12, owner answers of 20 Nov).
 *
 * Replaces a screen of made-up orders and amounts with the real market:
 *   1. Settings — the market switch, how a lawyer's ask is accepted (admin
 *      approval within N minutes, default 30 — RAW[66]; or instant — Q151),
 *      and the commission rates (shown only; nothing is collected through the
 *      platform). Saving needs settings.write.
 *   2. Lawyers' asks — approve / reject (with a reason the lawyer reads); an
 *      ask past its window is marked «تجاوز المهلة» and the staff are alerted;
 *      it is NEVER accepted automatically.
 *   3. The requests lawyers see now — assign one to a verified lawyer
 *      (RAW[22]: the administration has priority), or hide it from the market.
 * N9: «المنصة وسيط لا ضامن ولا أمين على الأتعاب».
 */

import { useCallback, useEffect, useState } from "react";
import { Storefront, ArrowClockwise, CheckCircle, XCircle, Warning, EyeSlash, UserPlus } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import IntermediaryNotice from "@/components/marketplace/IntermediaryNotice";
import { formatArabicDate } from "@/lib/services/clientDashboardCards";
import { toArabicDigits } from "@/lib/marketplace/marketSettings";
import PrioritySettingsBox from "@/components/marketplace/PrioritySettingsBox";
import { isHeld } from "@/lib/marketplace/marketPriority";

interface Settings {
  open: boolean;
  openedAt: string | null;
  acceptMode: "admin_approval" | "instant";
  approvalMinutes: number;
  commission: { founderOrEnterprise: number; subscriber: number; free: number };
  installed: boolean;
}

interface Ask {
  id: string;
  requestId: string;
  requestTitle: string;
  requestCategory: string | null;
  requestTaken: boolean;
  lawyerName: string | null;
  lawyerVerified: boolean;
  mode: string;
  status: string;
  statusLabel: string;
  dueAt: string | null;
  createdAt: string | null;
  note: string | null;
  overdue: boolean;
}

interface MarketRequest {
  id: string;
  title: string;
  typeLabel: string;
  cityLabel: string | null;
  summary: string | null;
  createdAt: string | null;
  published: boolean;
  pendingAsks: number;
  /** l16 س٢٣: set while the request is still in the Nezamy priority window. */
  releaseAt?: string | null;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar-SA-u-nu-arab", { dateStyle: "medium", timeStyle: "short" });
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export default function MarketplaceOrdersPage() {
  const { isDark } = useTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [settingsMsg, setSettingsMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [asks, setAsks] = useState<Ask[] | null>(null);
  const [askFilter, setAskFilter] = useState("pending");
  const [requests, setRequests] = useState<MarketRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [lawyerQuery, setLawyerQuery] = useState("");
  const [lawyers, setLawyers] = useState<Array<{ id: string; name: string }>>([]);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [s, a, r] = await Promise.all([
        fetch("/api/v1/admin/marketplace/settings", { cache: "no-store" }),
        fetch(`/api/v1/admin/marketplace/acceptances?status=${askFilter}`, { cache: "no-store" }),
        fetch("/api/v1/admin/marketplace/requests", { cache: "no-store" }),
      ]);
      const sb = await readJson<{ data?: Settings; error?: string }>(s);
      const ab = await readJson<{ data?: Ask[]; error?: string }>(a);
      const rb = await readJson<{ data?: MarketRequest[]; error?: string }>(r);
      if (!s.ok || !a.ok || !r.ok) {
        setError(sb.error || ab.error || rb.error || "تعذّر تحميل بيانات السوق.");
      }
      if (sb.data) {
        setSettings(sb.data);
        setDraft(sb.data);
      }
      setAsks(Array.isArray(ab.data) ? ab.data : []);
      setRequests(Array.isArray(rb.data) ? rb.data : []);
    } catch {
      setError("تعذّر الاتصال — تحقق من اتصالك وحاول مجدداً.");
    }
  }, [askFilter]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!assignFor || lawyerQuery.trim().length < 2) {
      setLawyers([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/v1/admin/marketplace/lawyers?q=${encodeURIComponent(lawyerQuery.trim())}`, { cache: "no-store" });
      const body = await readJson<{ data?: Array<{ id: string; name: string }> }>(res);
      setLawyers(Array.isArray(body.data) ? body.data : []);
    }, 300);
    return () => clearTimeout(t);
  }, [assignFor, lawyerQuery]);

  const saveSettings = async () => {
    if (!draft) return;
    setBusy("settings");
    setSettingsMsg(null);
    try {
      const res = await fetch("/api/v1/admin/marketplace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          open: draft.open,
          acceptMode: draft.acceptMode,
          approvalMinutes: Number(draft.approvalMinutes),
          commission: {
            founderOrEnterprise: Number(draft.commission.founderOrEnterprise),
            subscriber: Number(draft.commission.subscriber),
            free: Number(draft.commission.free),
          },
        }),
      });
      const body = await readJson<{ data?: Settings; error?: string }>(res);
      if (!res.ok) {
        setSettingsMsg({ text: body.error || "تعذّر الحفظ.", ok: false });
        return;
      }
      if (body.data) {
        setSettings(body.data);
        setDraft(body.data);
      }
      setSettingsMsg({ text: "حُفظت الإعدادات.", ok: true });
      void loadAll();
    } finally {
      setBusy(null);
    }
  };

  const decide = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    setRowMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/marketplace/acceptances/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: notes[id] ?? "" }),
      });
      const body = await readJson<{ message?: string; error?: string }>(res);
      setRowMsg({ id, text: body.message || body.error || "", ok: res.ok });
      void loadAll();
    } finally {
      setBusy(null);
    }
  };

  const requestAction = async (id: string, payload: Record<string, unknown>) => {
    setBusy(id);
    setRowMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/marketplace/requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await readJson<{ message?: string; error?: string }>(res);
      setRowMsg({ id, text: body.message || body.error || "", ok: res.ok });
      if (res.ok) {
        setAssignFor(null);
        setLawyerQuery("");
      }
      void loadAll();
    } finally {
      setBusy(null);
    }
  };

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-5"
    : "rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const tp = isDark ? "text-white" : "text-slate-800";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";
  const input = isDark
    ? "rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
    : "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800";
  const btn = "rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50";
  const chip = isDark ? "bg-white/[0.06] text-zinc-300" : "bg-slate-100 text-slate-700";

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className={`text-xl font-bold mb-1 flex items-center gap-2 ${tp}`}>
            <Storefront size={22} weight="duotone" />
            طلبات السوق
          </h1>
          <p className={`text-[12px] ${ts}`}>
            طلبات العملاء التي يراها المحامون الموثَّقون، وطلبات قبولهم، والإسناد. لا تُحصَّل الأتعاب عبر المنصة حالياً.
          </p>
          <IntermediaryNotice className="mt-1" />
        </div>
        <button type="button" onClick={() => void loadAll()} className={`${btn} ${chip} inline-flex items-center gap-1`}>
          <ArrowClockwise size={14} weight="bold" />
          تحديث
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* 1. Settings */}
      <section className={card} aria-labelledby="market-settings">
        <h2 id="market-settings" className={`text-base font-bold mb-3 ${tp}`}>إعدادات السوق</h2>
        {!draft && <p className={`text-sm ${ts}`}>جارٍ التحميل…</p>}
        {draft && !draft.installed && (
          <p className={`text-sm ${ts}`}>إعدادات السوق غير مفعّلة بعد على قاعدة البيانات (ملف SQL ‏20261202_70).</p>
        )}
        {draft && draft.installed && (
          <div className="space-y-4">
            <label className={`flex items-center gap-2 text-sm ${tp}`}>
              <input
                type="checkbox"
                checked={draft.open}
                onChange={(e) => setDraft({ ...draft, open: e.target.checked })}
              />
              السوق مفتوح: تظهر طلبات العملاء الجديدة للمحامين الموثَّقين دون نشر يدوي
              {settings?.open && settings.openedAt ? (
                <span className={`text-xs ${ts}`}>(مفتوح منذ {fmtTime(settings.openedAt)})</span>
              ) : null}
            </label>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className={tp}>قبول المحامي للطلب:</span>
              <label className={`flex items-center gap-1 ${tp}`}>
                <input
                  type="radio"
                  name="acceptMode"
                  checked={draft.acceptMode === "admin_approval"}
                  onChange={() => setDraft({ ...draft, acceptMode: "admin_approval" })}
                />
                باعتماد الإدارة
              </label>
              <label className={`flex items-center gap-1 ${tp}`}>
                <input
                  type="radio"
                  name="acceptMode"
                  checked={draft.acceptMode === "instant"}
                  onChange={() => setDraft({ ...draft, acceptMode: "instant" })}
                />
                فوري
              </label>
              <label className={`flex items-center gap-1 ${tp}`}>
                مهلة الاعتماد
                <input
                  type="number"
                  min={5}
                  max={1440}
                  className={`${input} w-20`}
                  value={draft.approvalMinutes}
                  onChange={(e) => setDraft({ ...draft, approvalMinutes: Number(e.target.value) })}
                />
                دقيقة
              </label>
            </div>
            <p className={`text-xs ${ts}`}>
              إذا انتهت المهلة دون قرار تُنبَّه الإدارة، ولا يُقبل أي محامٍ تلقائياً.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={tp}>نسب العمولة (للعرض؛ لا تحصيل الآن):</span>
              {(
                [
                  ["founderOrEnterprise", "المؤسسون وشركات المحاماة المتكاملة"],
                  ["subscriber", "المشتركون"],
                  ["free", "الحسابات المجانية"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className={`flex items-center gap-1 ${tp}`}>
                  {label}
                  <input
                    type="number"
                    min={5}
                    max={15}
                    className={`${input} w-16`}
                    value={draft.commission[key]}
                    onChange={(e) => setDraft({ ...draft, commission: { ...draft.commission, [key]: Number(e.target.value) } })}
                  />
                  ٪
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={busy === "settings"}
                onClick={() => void saveSettings()}
                className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
              >
                حفظ الإعدادات
              </button>
              {settingsMsg && (
                <span role="status" className={`text-xs ${settingsMsg.ok ? "text-emerald-600" : "text-red-600 dark:text-red-400"}`}>
                  {settingsMsg.text}
                </span>
              )}
            </div>
          </div>
        )}
        {/* l16 س٢٣: the Nezamy priority window (its own route). */}
        <PrioritySettingsBox isDark={isDark} />
      </section>

      {/* 2. Asks */}
      <section className={card} aria-labelledby="market-asks">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 id="market-asks" className={`text-base font-bold ${tp}`}>طلبات قبول المحامين</h2>
          <select className={input} value={askFilter} onChange={(e) => setAskFilter(e.target.value)} aria-label="تصفية">
            <option value="pending">بانتظار الاعتماد</option>
            <option value="approved">معتمدة</option>
            <option value="rejected">مرفوضة</option>
            <option value="superseded">أُسندت لغيره</option>
            <option value="withdrawn">مسحوبة</option>
            <option value="all">الكل</option>
          </select>
        </div>
        {asks === null && <p className={`text-sm ${ts}`}>جارٍ التحميل…</p>}
        {asks !== null && asks.length === 0 && <p className={`text-sm ${ts}`}>لا توجد طلبات قبول في هذا التصنيف.</p>}
        {asks !== null && asks.length > 0 && (
          <ul className="space-y-3">
            {asks.map((a) => (
              <li
                key={a.id}
                className={`rounded-xl border p-3 ${a.overdue ? "border-red-400/60" : isDark ? "border-white/10" : "border-slate-200"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className={`text-sm ${tp}`}>
                    <span className="font-bold">{a.lawyerName || "محامٍ"}</span>
                    {!a.lawyerVerified && <span className="text-xs text-red-600"> (لم يعد موثَّقاً)</span>}
                    <span className={ts}> يطلب قبول </span>
                    <span className="font-bold">{a.requestTitle || a.requestId}</span>
                    {a.requestCategory && <span className={ts}> · {a.requestCategory}</span>}
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${chip}`}>{a.statusLabel}</span>
                </div>
                <p className={`text-xs mt-1 ${ts}`}>
                  {fmtTime(a.createdAt)}
                  {a.status === "pending" && a.dueAt ? ` · المهلة حتى ${fmtTime(a.dueAt)}` : ""}
                  {a.requestTaken && a.status === "pending" ? " · الطلب أُسند من قبل" : ""}
                </p>
                {a.overdue && (
                  <p className="text-xs mt-1 text-red-600 dark:text-red-400 inline-flex items-center gap-1">
                    <Warning size={13} weight="bold" />
                    تجاوز المهلة دون قرار — لا يُقبل تلقائياً
                  </p>
                )}
                {a.note && <p className={`text-xs mt-1 ${ts}`}>الملاحظة: {a.note}</p>}
                {a.status === "pending" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      className={`${input} flex-1 min-w-[12rem]`}
                      placeholder="سبب الرفض (يقرؤه المحامي) — اختياري"
                      maxLength={500}
                      value={notes[a.id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                    />
                    <button
                      type="button"
                      disabled={busy === a.id}
                      onClick={() => void decide(a.id, "approve")}
                      className={`${btn} bg-emerald-600 text-white inline-flex items-center gap-1`}
                    >
                      <CheckCircle size={14} weight="bold" />
                      اعتماد وإسناد
                    </button>
                    <button
                      type="button"
                      disabled={busy === a.id}
                      onClick={() => void decide(a.id, "reject")}
                      className={`${btn} bg-red-600 text-white inline-flex items-center gap-1`}
                    >
                      <XCircle size={14} weight="bold" />
                      رفض
                    </button>
                  </div>
                )}
                {rowMsg?.id === a.id && (
                  <p role="status" className={`text-xs mt-1 ${rowMsg.ok ? "text-emerald-600" : "text-red-600 dark:text-red-400"}`}>
                    {rowMsg.text}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. Requests in the market */}
      <section className={card} aria-labelledby="market-requests">
        <h2 id="market-requests" className={`text-base font-bold mb-1 ${tp}`}>الطلبات المعروضة على المحامين الآن</h2>
        <p className={`text-xs mb-3 ${ts}`}>
          يرى المحامون النوع والمدينة وسطر الملخّص فقط. لاسترجاع طلب أُسند لمحامٍ استخدم «توجيه» في صفحة طلبات الخدمات.
        </p>
        {requests === null && <p className={`text-sm ${ts}`}>جارٍ التحميل…</p>}
        {requests !== null && requests.length === 0 && <p className={`text-sm ${ts}`}>لا توجد طلبات معروضة في السوق الآن.</p>}
        {requests !== null && requests.length > 0 && (
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={r.id} className={`rounded-xl border p-3 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className={`text-sm ${tp}`}>
                    <span className="font-bold">{r.title || r.id}</span>
                    <span className={ts}>
                      {" "}
                      · {r.typeLabel}
                      {r.cityLabel ? ` · ${r.cityLabel}` : ""} · {formatArabicDate(r.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {r.published && <span className={`rounded-full px-2 py-0.5 ${chip}`}>منشور يدوياً</span>}
                    {!r.published && isHeld(r.releaseAt, Date.now()) && (
                      <span className="rounded-full px-2 py-0.5 bg-sky-500/15 text-sky-700 dark:text-sky-300">
                        لدى فريق نظامي حتى {fmtTime(r.releaseAt ?? null)} — لا يراه المحامون بعد
                      </span>
                    )}
                    {r.pendingAsks > 0 && (
                      <span className="rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        {toArabicDigits(r.pendingAsks)} طلب قبول
                      </span>
                    )}
                  </div>
                </div>
                {r.summary && <p className={`text-xs mt-1 ${ts}`}>{r.summary}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAssignFor(assignFor === r.id ? null : r.id);
                      setLawyerQuery("");
                    }}
                    className={`${btn} ${chip} inline-flex items-center gap-1`}
                  >
                    <UserPlus size={14} weight="bold" />
                    إسناد لمحامٍ
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => void requestAction(r.id, { action: "hide" })}
                    className={`${btn} ${chip} inline-flex items-center gap-1`}
                  >
                    <EyeSlash size={14} weight="bold" />
                    إخفاء من السوق
                  </button>
                </div>
                {assignFor === r.id && (
                  <div className="mt-2 space-y-2">
                    <input
                      className={`${input} w-full`}
                      placeholder="ابحث باسم المحامي الموثَّق (حرفان على الأقل)"
                      value={lawyerQuery}
                      onChange={(e) => setLawyerQuery(e.target.value)}
                    />
                    {lawyers.length > 0 && (
                      <ul className="flex flex-wrap gap-2">
                        {lawyers.map((l) => (
                          <li key={l.id}>
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => void requestAction(r.id, { action: "assign_lawyer", lawyerUserId: l.id })}
                              className={`${btn} bg-emerald-600 text-white`}
                            >
                              إسناد إلى {l.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {lawyerQuery.trim().length >= 2 && lawyers.length === 0 && (
                      <p className={`text-xs ${ts}`}>لا محامٍ موثَّقاً بهذا الاسم.</p>
                    )}
                  </div>
                )}
                {rowMsg?.id === r.id && (
                  <p role="status" className={`text-xs mt-1 ${rowMsg.ok ? "text-emerald-600" : "text-red-600 dark:text-red-400"}`}>
                    {rowMsg.text}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
