"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  CalendarBlank,
  Check,
  FloppyDisk,
  PencilSimple,
  Plus,
  Prohibit,
  Tag,
  Warning,
  WarningCircle,
  X,
  FileText,
  User,
  Desktop,
  DownloadSimple
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import { listFailed, listFromApi, listOk, listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import type { AdminCoupon, AdminCouponStatus, AdminDiscountType, AdminEligibleRole, AdminCouponType } from "@/types/adminBackendReady";

// ─── DB row → AdminCoupon mapping ──────────────────────────────────────────────
// The coupons table (20260603_phase1_003_subscriptions_billing.sql) uses
// discount_type ('percentage'|'fixed'|'points_grant'|'plan_upgrade') and
// eligible_user_types (with "individual" where the page uses "client").

const USER_TYPE_TO_ROLE: Record<string, AdminEligibleRole> = {
  individual: "client",
  client: "client",
  business: "business",
  micro: "micro",
  lawyer: "lawyer",
  firm: "firm",
  provider: "provider",
  government: "government",
  ngo: "ngo",
};

function toDateInput(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  return value.slice(0, 10);
}

function deriveStatus(row: Record<string, unknown>): AdminCouponStatus {
  const metaStatus = ((row.metadata as Record<string, unknown> | null)?.status) as string | undefined;
  if (metaStatus === "disabled") return "disabled";
  if (row.active === false) return "disabled";

  const now = Date.now();
  const validUntil = typeof row.valid_until === "string" ? Date.parse(row.valid_until) : NaN;
  if (!Number.isNaN(validUntil) && validUntil < now) return "expired";

  const validFrom = typeof row.valid_from === "string" ? Date.parse(row.valid_from) : NaN;
  if (!Number.isNaN(validFrom) && validFrom > now) return "scheduled";

  return "active";
}

function mapRowToCoupon(row: Record<string, unknown>): AdminCoupon {
  const dbType = String(row.discount_type ?? "percentage");

  let couponType: AdminCouponType;
  let discountType: AdminDiscountType = "percentage";
  if (dbType === "points_grant") {
    couponType = "points";
  } else if (dbType === "plan_upgrade") {
    couponType = "free_plan";
  } else {
    couponType = "discount";
    discountType = dbType === "fixed" ? "fixed" : "percentage";
  }

  const userTypes = Array.isArray(row.eligible_user_types) ? (row.eligible_user_types as unknown[]) : [];
  const eligibleRoles = userTypes
    .map((t) => USER_TYPE_TO_ROLE[String(t)])
    .filter((r): r is AdminEligibleRole => Boolean(r));

  return {
    code: String(row.code ?? ""),
    couponType,
    discountType,
    value: Number(row.discount_value ?? 0),
    pointsGranted: Number(row.points_granted ?? 0),
    planGranted: typeof row.plan_granted === "string" ? row.plan_granted : undefined,
    usedCount: Number(row.used_count ?? 0),
    usageLimit: Number(row.max_uses ?? 0) || 0,
    startsAt: toDateInput(row.valid_from),
    expiresAt: toDateInput(row.valid_until),
    status: deriveStatus(row),
    eligibleRoles: eligibleRoles.length ? eligibleRoles : ["client"],
    createdAt: toDateInput(row.created_at),
    usageLog: [],
  };
}

const ROLE_LABEL: Record<AdminEligibleRole, string> = {
  client: "الأفراد",
  business: "الشركات",
  micro: "المنشآت الصغيرة",
  lawyer: "المحامون",
  firm: "المكاتب",
  provider: "مقدمو الخدمات",
  government: "الجهات الحكومية",
  ngo: "الجمعيات",
};

const STATUS_LABEL: Record<AdminCouponStatus, string> = {
  active: "نشط",
  scheduled: "مجدول",
  expired: "منتهي",
  disabled: "معطل",
};

/* ── No demo coupons ─────────────────────────────────────────────────────────
 *
 * `INITIAL_COUPONS` — NZAMY25, LAWYER100, GOV2026 — used to be this page's
 * initial state AND its fallback, shown whenever the fetch failed or the table
 * came back empty, under a toast reading «تُعرض بيانات تجريبية».
 *
 * Three separate problems, on a screen that decides what money the office gives
 * away. The codes looked real and an admin could read one out to a client who
 * would then find it invalid at checkout. The «استخدامات» figures (143 of 500,
 * 52 of 100) were invented usage of coupons that do not exist. And NZAMY25
 * carried a two-row usage log naming «أحمد العبدالله» and «شركة النماء» with
 * timestamps, devices and amounts — a fabricated audit trail about named
 * customers, sitting under a heading that literally says «سجل الاستخدام (Audit
 * Log)».
 *
 * GET /api/v1/admin/coupons now returns 500 + {error} on a failed read, so the
 * page can tell "no coupons saved" from "could not read" and say which.
 */

const EMPTY_COUPON: AdminCoupon = {
  code: "",
  couponType: "discount",
  discountType: "percentage",
  value: 10,
  pointsGranted: 0,
  usedCount: 0,
  usageLimit: 100,
  startsAt: "2026-05-20",
  expiresAt: "2026-06-20",
  status: "scheduled",
  eligibleRoles: ["client"],
};

export default function AdminCouponsPage() {
  const { isDark } = useTheme();
  const [read, setRead] = useState<ListRead<AdminCoupon> | null>(null);
  // Starts `true`: nothing may be asserted about the coupon table before the
  // first response, least of all that it is empty.
  const [loading, setLoading] = useState(true);
  // Maps the page's coupon `code` → the DB row `id` so mutations can target it.
  const [codeToId, setCodeToId] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<AdminCoupon | null>(null);
  const [selectedCoupon, setSelectedCoupon] = useState<AdminCoupon | null>(null);
  // Now only ever reports what a WRITE did. The read has its own three states
  // below; a toast could not distinguish them and was the reason a failed load
  // could sit above three fake coupons saying «تُعرض بيانات تجريبية».
  const [toast, setToast] = useState("");

  const loadCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/coupons");
      if (!res.ok) {
        setRead(listFailed<AdminCoupon>());
        setCodeToId({});
        return;
      }
      const json = await res.json();
      const base = listFromApi<Record<string, unknown>>(json);
      if (!base.ok) {
        setRead(listFailed<AdminCoupon>());
        setCodeToId({});
        return;
      }
      const idMap: Record<string, string> = {};
      const mapped = base.items.map((row) => {
        const coupon = mapRowToCoupon(row);
        if (typeof row.id === "string") idMap[coupon.code] = row.id;
        return coupon;
      });
      setCodeToId(idMap);
      setRead(listOk(mapped, base.total));
    } catch (err) {
      console.error("[coupons] load failed:", err);
      setRead(listFailed<AdminCoupon>());
      setCodeToId({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCoupons();
  }, [loadCoupons]);

  const state = listViewState(loading, read);
  const coupons = itemsOf(read);
  // Only meaningful once a read succeeded. Rendered as «—» otherwise: «٠
  // كوبونات نشطة» over a failed read tells the office no discount is live,
  // which is a decision-grade claim about money.
  const countsKnown = state === "empty" || state === "ready";
  const activeCount = coupons.filter((coupon) => coupon.status === "active").length;
  const totalUsage = useMemo(() => coupons.reduce((sum, coupon) => sum + coupon.usedCount, 0), [coupons]);
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-white/10" : "bg-white border-gray-200 shadow-sm"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  function openNewCoupon() {
    setDraft({ ...EMPTY_COUPON, code: `NZ-${coupons.length + 1}00` });
  }

  async function saveDraft() {
    if (!draft) return;
    const code = draft.code.trim().toUpperCase();
    if (!code) {
      setToast("الكوبون يحتاج كود واضح قبل حفظه.");
      return;
    }

    const normalized = { ...draft, code };
    const existingId = codeToId[code];

    try {
      let res: Response;
      if (existingId) {
        // Update an existing coupon.
        res = await fetch(`/api/v1/admin/coupons/${existingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalized),
        });
      } else {
        // Create a new coupon.
        res = await fetch("/api/v1/admin/coupons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalized),
        });
      }

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setToast(err.error ?? `تعذّر حفظ ${code} على الخادم.`);
        return;
      }

      setDraft(null);
      setToast(`تم حفظ ${code} في قاعدة البيانات.`);
      await loadCoupons();
    } catch (err) {
      console.error("[coupons] save failed:", err);
      // NO optimistic local insert. This used to push the unsaved coupon into
      // the list, so a code that exists nowhere but in this browser tab sat in
      // the table looking exactly like a live one — and an admin could hand it
      // to a client. The draft is deliberately LEFT OPEN so the work is not
      // lost and the failure is visibly unresolved.
      setToast(`تعذّر الاتصال بالخادم — لم يُحفظ ${code}. الكوبون غير موجود بعد.`);
    }
  }

  async function toggleDisabled(code: string) {
    const current = coupons.find((coupon) => coupon.code === code);
    const nextStatus: AdminCouponStatus = current?.status === "disabled" ? "active" : "disabled";
    const id = codeToId[code];

    if (!id) {
      // Every row on screen now comes from the database, so this only fires if
      // the row arrived without an id. Previously it flipped the badge in local
      // state and said so quietly — the coupon then read as «معطل» to anyone
      // looking, while remaining fully active at checkout.
      setToast(`تعذّر تحديد ${code} على الخادم — لم يتغيّر شيء.`);
      return;
    }

    try {
      const res = await fetch(`/api/v1/admin/coupons/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextStatus !== "disabled", status: nextStatus }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setToast(err.error ?? `تعذّر تغيير حالة ${code} على الخادم.`);
        return;
      }
      setToast(`تم ${nextStatus === "disabled" ? "تعطيل" : "تفعيل"} ${code}.`);
      await loadCoupons();
    } catch (err) {
      console.error("[coupons] toggle failed:", err);
      setToast(`تعذّر الاتصال بالخادم لتغيير حالة ${code}.`);
    }
  }

  function toggleRole(role: AdminEligibleRole) {
    if (!draft) return;
    const nextRoles = draft.eligibleRoles.includes(role)
      ? draft.eligibleRoles.filter((item) => item !== role)
      : [...draft.eligibleRoles, role];
    setDraft({ ...draft, eligibleRoles: nextRoles.length ? nextRoles : [role] });
  }

  return (
    <div className={`${isDark ? "bg-[#0c0f12]" : "bg-gray-50"} min-h-screen relative`} dir="rtl">
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}>
                <Tag size={22} weight="duotone" className={isDark ? "text-amber-400" : "text-amber-600"} />
              </div>
              <div>
                <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>الكوبونات والخصومات</h1>
                {/* The old subtitle said «واجهة إدارة محلية … بدون باك إند»,
                    which stopped being true when /api/v1/admin/coupons landed.
                    A screen that writes real coupons while describing itself as
                    a local mock invites an admin to treat a live change as a
                    rehearsal. */}
                <p className={`text-xs ${muted}`}>كوبونات محفوظة في قاعدة البيانات — أي تغيير هنا يسري على العملاء.</p>
              </div>
            </div>
          </div>
          <button onClick={openNewCoupon} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition">
            <Plus size={16} weight="bold" />
            كوبون جديد
          </button>
        </div>

        {/* Only rendered when a write actually said something. It used to be
            permanent, and its default text («جارٍ تحميل الكوبونات…») was the
            page's only loading signal — under a table already full of demo
            coupons. */}
        {toast && (
          <div className={`flex items-start gap-2 text-sm p-4 rounded-2xl border ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
            <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
            <span>{toast}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {([
            ["إجمالي الكوبونات", coupons.length],
            ["كوبونات نشطة", activeCount],
            // Was «استخدامات محفوظة محلياً» — nothing is stored locally any
            // more, and the figure is the sum of used_count off the rows.
            ["إجمالي مرات الاستخدام", totalUsage],
          ] as [string, number][]).map(([label, value]) => (
            <div key={label} className={`${card} p-5`}>
              <p className={`text-xs mb-2 ${muted}`}>{label}</p>
              <p className={`text-2xl font-black font-mono ${
                countsKnown ? (isDark ? "text-white" : "text-gray-900") : (isDark ? "text-gray-600" : "text-gray-300")
              }`}>{countsKnown ? value : "—"}</p>
            </div>
          ))}
        </div>

        {draft && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5 space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className={`font-black ${isDark ? "text-white" : "text-gray-900"}`}>تجهيز كوبون للربط</h2>
              <span className="text-[11px] px-2 py-1 rounded-full border border-blue-500/25 bg-blue-500/10 text-blue-300 font-bold">Backend-ready</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field label="الكود">
                <input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} className={inputClass(isDark)} />
              </Field>
              <Field label="نوع الكوبون">
                <select value={draft.couponType || "discount"} onChange={(event) => setDraft({ ...draft, couponType: event.target.value as AdminCouponType })} className={inputClass(isDark)}>
                  <option value="discount">خصم خدمة/باقة</option>
                  <option value="points">منح نقاط</option>
                  <option value="free_plan">ترقية باقة مجانية</option>
                </select>
              </Field>
              {draft.couponType === "points" ? (
                <Field label="النقاط الممنوحة">
                  <input type="number" value={draft.pointsGranted || 0} min={1} onChange={(event) => setDraft({ ...draft, pointsGranted: Number(event.target.value) })} className={inputClass(isDark)} />
                </Field>
              ) : draft.couponType === "discount" ? (
                <>
                  <Field label="نوع الخصم">
                    <select value={draft.discountType} onChange={(event) => setDraft({ ...draft, discountType: event.target.value as AdminDiscountType })} className={inputClass(isDark)}>
                      <option value="percentage">نسبة</option>
                      <option value="fixed">مبلغ ثابت</option>
                    </select>
                  </Field>
                  <Field label="القيمة">
                    <input type="number" value={draft.value} min={1} onChange={(event) => setDraft({ ...draft, value: Number(event.target.value) })} className={inputClass(isDark)} />
                  </Field>
                </>
              ) : (
                <Field label="الباقة الممنوحة">
                  <select className={inputClass(isDark)}>
                    <option value="pro">Pro</option>
                    <option value="max">Max</option>
                  </select>
                </Field>
              )}
              
              <Field label="حد الاستخدام">
                <input type="number" value={draft.usageLimit} min={1} onChange={(event) => setDraft({ ...draft, usageLimit: Number(event.target.value) })} className={inputClass(isDark)} />
              </Field>
              <Field label="يبدأ في">
                <input type="date" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} className={inputClass(isDark)} />
              </Field>
              <Field label="ينتهي في">
                <input type="date" value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} className={inputClass(isDark)} />
              </Field>
              <Field label="الحالة">
                <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminCouponStatus })} className={inputClass(isDark)}>
                  {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
            </div>
            <div>
              <p className={`text-xs font-bold mb-2 ${muted}`}>الأدوار المستهدفة</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ROLE_LABEL) as AdminEligibleRole[]).map((role) => (
                  <button key={role} onClick={() => toggleRole(role)} className={`text-xs px-3 py-2 rounded-xl border font-bold transition ${draft.eligibleRoles.includes(role) ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : isDark ? "border-white/10 text-gray-400 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    {ROLE_LABEL[role]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDraft(null)} className={`px-4 py-2 rounded-xl text-sm font-bold border ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                إلغاء
              </button>
              <button onClick={saveDraft} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B3D2E] text-white text-sm font-bold hover:bg-[#0a3328]">
                <FloppyDisk size={16} />
                {/* It has POSTed/PATCHed to the server since the coupons API
                    landed; the label «حفظ محلي» outlived the behaviour. */}
                حفظ
              </button>
            </div>
          </motion.div>
        )}

        <div className={`${card} overflow-hidden`}>
          <div className={`grid grid-cols-12 text-xs font-bold px-5 py-3 border-b ${isDark ? "border-white/10 text-gray-500 bg-[#0c0f12]" : "border-gray-100 text-gray-400 bg-gray-50"}`}>
            <span className="col-span-2">الكود</span>
            <span className="col-span-2">التأثير</span>
            <span className="col-span-2">الاستخدام</span>
            <span className="col-span-2">الصلاحية</span>
            <span className="col-span-2">الأدوار</span>
            <span className="col-span-1">الحالة</span>
            <span className="col-span-1"></span>
          </div>
          <div className={`divide-y ${isDark ? "divide-white/10" : "divide-gray-100"}`}>
            {state === "loading" && (
              <div className={`px-5 py-12 text-center text-sm ${muted}`}>جارٍ تحميل الكوبونات…</div>
            )}

            {state === "unreadable" && (
              <div className="px-5 py-12 text-center">
                <Warning size={24} weight="fill" className="mx-auto mb-2 text-amber-500" />
                <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>تعذّرت قراءة الكوبونات</p>
                <p className={`text-xs mt-1 ${muted}`}>
                  هذه ليست قائمة فارغة — لم نتمكن من القراءة. قد تكون هناك كوبونات فعّالة لا تظهر هنا، فلا تُنشئ كوبوناً جديداً بناءً على هذه الشاشة.
                </p>
                <button type="button" onClick={() => { void loadCoupons(); }}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition">
                  <ArrowClockwise size={12} weight="bold" /> إعادة المحاولة
                </button>
              </div>
            )}

            {state === "empty" && (
              <div className={`px-5 py-12 text-center text-sm ${muted}`}>لا توجد كوبونات محفوظة بعد.</div>
            )}

            {state === "ready" && coupons.map((coupon, index) => (
              <motion.div key={coupon.code} onClick={() => setSelectedCoupon(coupon)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.04 }} className={`grid grid-cols-12 items-center gap-2 px-5 py-4 cursor-pointer transition ${isDark ? "hover:bg-white/[0.04]" : "hover:bg-gray-50"}`}>
                <span className={`col-span-2 font-mono text-sm font-black ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>{coupon.code}</span>
                
                <span className={`col-span-2 text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {coupon.couponType === "points" ? `+${coupon.pointsGranted} نقطة` : 
                   coupon.couponType === "free_plan" ? "ترقية باقة" :
                   `${coupon.value}${coupon.discountType === "percentage" ? "%" : " ر.س"}`}
                </span>

                {/* `max_uses` is nullable and maps to 0 here, which means "no
                    cap" — not "a cap of zero". Read the other way, this column
                    printed «٥/٠» in red with a full bar over a coupon that is
                    working perfectly, i.e. it reported a live coupon as
                    exhausted. Now an uncapped coupon says so and draws no bar,
                    because a progress bar with no denominator has nothing to
                    show. */}
                <div className="col-span-2">
                  {coupon.usageLimit > 0 ? (
                    <>
                      <span className={`text-xs font-bold ${coupon.usedCount >= coupon.usageLimit ? "text-rose-500" : isDark ? "text-gray-300" : "text-gray-700"}`}>{coupon.usedCount}</span>
                      <span className={`text-xs ${muted}`}>/{coupon.usageLimit}</span>
                      <div className={`h-1 rounded-full mt-1 ${isDark ? "bg-gray-800" : "bg-gray-200"} w-20`}>
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min((coupon.usedCount / coupon.usageLimit) * 100, 100)}%` }} />
                      </div>
                    </>
                  ) : (
                    <>
                      <span className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{coupon.usedCount}</span>
                      <span className={`text-xs ${muted}`}> — بلا حد</span>
                    </>
                  )}
                </div>
                <div className={`col-span-2 flex items-center gap-1 text-xs ${muted}`}>
                  <CalendarBlank size={12} />
                  {coupon.expiresAt}
                </div>
                <div className="col-span-2 flex flex-wrap gap-1">
                  {coupon.eligibleRoles.slice(0, 2).map((role) => (
                    <span key={role} className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}>{ROLE_LABEL[role]}</span>
                  ))}
                  {coupon.eligibleRoles.length > 2 && <span className={`text-[10px] ${muted}`}>+{coupon.eligibleRoles.length - 2}</span>}
                </div>
                <div className="col-span-1">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${coupon.status === "active" ? "bg-emerald-500/10 text-emerald-500" : coupon.status === "disabled" ? "bg-rose-500/10 text-rose-500" : "bg-amber-500/10 text-amber-500"}`}>
                    {coupon.status === "active" ? <Check size={8} weight="bold" /> : <X size={8} weight="bold" />}
                    {STATUS_LABEL[coupon.status]}
                  </span>
                </div>
                <div className="col-span-1 flex justify-end gap-1">
                  <button title="تعديل" onClick={(e) => { e.stopPropagation(); setDraft(coupon); }} className={`p-2 rounded-lg ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    <PencilSimple size={14} />
                  </button>
                  <button title="تعطيل/تفعيل" onClick={(e) => { e.stopPropagation(); toggleDisabled(coupon.code); }} className={`p-2 rounded-lg ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    <Prohibit size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedCoupon && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedCoupon(null)} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className={`fixed top-0 right-0 bottom-0 w-full max-w-md shadow-2xl z-50 flex flex-col ${isDark ? "bg-[#0d1117] border-l border-white/10" : "bg-white border-l border-gray-200"}`}>
              <div className={`p-5 flex items-center justify-between border-b ${isDark ? "border-white/10" : "border-gray-100"}`}>
                <h2 className={`text-lg font-black font-mono ${isDark ? "text-white" : "text-gray-900"}`}>{selectedCoupon.code}</h2>
                <button onClick={() => setSelectedCoupon(null)} className={`p-2 rounded-full ${isDark ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-600"}`}>
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <div>
                  <h3 className={`text-sm font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>بيانات الإنشاء والتتبع</h3>
                  <div className={`p-4 rounded-xl space-y-3 text-sm ${isDark ? "bg-white/5" : "bg-gray-50"}`}>
                    <div className="flex justify-between items-center">
                      <span className={muted}>تاريخ الإنشاء</span>
                      <span className={`font-mono font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{selectedCoupon.createdAt || "—"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={muted}>بواسطة الأدمن</span>
                      <span className={`flex items-center gap-1 font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        <User size={14} />
                        {selectedCoupon.createdByAdmin || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={muted}>الجهاز المستخدم</span>
                      <span className={`flex items-center gap-1 font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        <Desktop size={14} />
                        {selectedCoupon.createdFromDevice || "—"}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>سجل الاستخدام (Audit Log)</h3>
                    <button className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border font-bold ${isDark ? "border-white/10 hover:bg-white/5 text-gray-300" : "border-gray-200 hover:bg-gray-100 text-gray-700"}`}>
                      <DownloadSimple size={14} />
                      CSV
                    </button>
                  </div>
                  
                  {(!selectedCoupon.usageLog || selectedCoupon.usageLog.length === 0) ? (
                    <div className={`p-8 text-center rounded-xl border border-dashed ${isDark ? "border-white/10 text-gray-500" : "border-gray-200 text-gray-400"}`}>
                      <FileText size={32} weight="duotone" className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">لم يتم استخدام الكوبون بعد</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedCoupon.usageLog.map((log, idx) => (
                        <div key={idx} className={`p-4 rounded-xl border ${isDark ? "border-white/10 bg-white/[0.02]" : "border-gray-100 bg-white"}`}>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{log.usedBy}</p>
                              <p className={`text-[11px] ${muted}`}>{ROLE_LABEL[log.usedByRole]}</p>
                            </div>
                            <span className={`text-xs font-mono font-bold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>-{log.discountApplied}</span>
                          </div>
                          <div className={`flex items-center justify-between text-[11px] ${muted} mt-3 pt-3 border-t ${isDark ? "border-white/10" : "border-gray-50"}`}>
                            <span>{log.appliedTo}</span>
                            <span>{log.usedAt}</span>
                          </div>
                          <div className={`text-[10px] mt-1 ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                            الجهاز: {log.usedFromDevice}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function inputClass(isDark: boolean) {
  return `w-full rounded-xl border px-3 py-2 text-sm outline-none ${
    isDark ? "bg-[#0d1117] border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"
  }`;
}
