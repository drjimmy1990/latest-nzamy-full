"use client";

import { useMemo, useState } from "react";
import {
  CalendarBlank,
  Check,
  FloppyDisk,
  PencilSimple,
  Plus,
  Prohibit,
  Tag,
  WarningCircle,
  X,
  FileText,
  User,
  Desktop,
  DownloadSimple
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import type { AdminCoupon, AdminCouponStatus, AdminDiscountType, AdminEligibleRole, AdminCouponType } from "@/types/adminBackendReady";

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

const INITIAL_COUPONS: AdminCoupon[] = [
  {
    code: "NZAMY25",
    couponType: "discount",
    discountType: "percentage",
    value: 25,
    usedCount: 143,
    usageLimit: 500,
    startsAt: "2026-05-01",
    expiresAt: "2026-06-30",
    status: "active",
    eligibleRoles: ["client", "business", "micro"],
    createdAt: "2026-04-20 10:00 AST",
    createdByAdmin: "سعود القحطاني",
    createdFromDevice: "Mac OS Safari",
    usageLog: [
      { usedBy: "أحمد العبدالله", usedByRole: "client", usedAt: "2026-05-15 14:30 AST", usedFromDevice: "iPhone iOS Safari", appliedTo: "استشارة قانونية", discountApplied: 50 },
      { usedBy: "شركة النماء", usedByRole: "business", usedAt: "2026-05-16 09:15 AST", usedFromDevice: "Windows Chrome", appliedTo: "مراجعة عقد تأسيس", discountApplied: 250 },
    ]
  },
  {
    code: "LAWYER100",
    couponType: "discount",
    discountType: "fixed",
    value: 100,
    usedCount: 52,
    usageLimit: 100,
    startsAt: "2026-05-01",
    expiresAt: "2026-05-15",
    status: "expired",
    eligibleRoles: ["lawyer", "firm"],
    createdAt: "2026-04-15 08:00 AST",
    createdByAdmin: "فريق التسويق",
    createdFromDevice: "Windows Edge",
    usageLog: []
  },
  {
    code: "GOV2026",
    couponType: "points",
    discountType: "fixed",
    value: 0,
    pointsGranted: 500,
    usedCount: 21,
    usageLimit: 200,
    startsAt: "2026-05-20",
    expiresAt: "2026-12-31",
    status: "scheduled",
    eligibleRoles: ["government", "ngo"],
    createdAt: "2026-05-18 11:20 AST",
    createdByAdmin: "النظام الذكي",
    createdFromDevice: "System",
    usageLog: []
  },
];

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
  const [coupons, setCoupons] = useState(INITIAL_COUPONS);
  const [draft, setDraft] = useState<AdminCoupon | null>(null);
  const [selectedCoupon, setSelectedCoupon] = useState<AdminCoupon | null>(null);
  const [toast, setToast] = useState("جاهز للربط بالباك إند: لا يوجد حفظ خادمي في هذه المرحلة.");

  const activeCount = coupons.filter((coupon) => coupon.status === "active").length;
  const totalUsage = useMemo(() => coupons.reduce((sum, coupon) => sum + coupon.usedCount, 0), [coupons]);
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-white/10" : "bg-white border-gray-200 shadow-sm"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  function openNewCoupon() {
    setDraft({ ...EMPTY_COUPON, code: `NZ-${coupons.length + 1}00` });
  }

  function saveDraft() {
    if (!draft) return;
    const code = draft.code.trim().toUpperCase();
    if (!code) {
      setToast("الكوبون يحتاج كود واضح قبل تجهيزه للربط.");
      return;
    }

    const normalized = { ...draft, code };
    setCoupons((current) => {
      const exists = current.some((coupon) => coupon.code === code);
      return exists ? current.map((coupon) => (coupon.code === code ? normalized : coupon)) : [normalized, ...current];
    });
    setDraft(null);
    setToast(`تم تحديث ${code} محلياً. عقد AdminCoupon جاهز للربط بالباك إند.`);
  }

  function toggleDisabled(code: string) {
    setCoupons((current) =>
      current.map((coupon) =>
        coupon.code === code
          ? { ...coupon, status: coupon.status === "disabled" ? "active" : "disabled" }
          : coupon,
      ),
    );
    setToast(`تم تغيير حالة ${code} في الواجهة فقط. الحفظ الحقيقي ينتظر API الكوبونات.`);
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
                <p className={`text-xs ${muted}`}>واجهة إدارة محلية جاهزة لعقد AdminCoupon بدون باك إند.</p>
              </div>
            </div>
          </div>
          <button onClick={openNewCoupon} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition">
            <Plus size={16} weight="bold" />
            كوبون جديد
          </button>
        </div>

        <div className={`flex items-start gap-2 text-sm p-4 rounded-2xl border ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
          <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span>{toast}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            ["إجمالي الكوبونات", coupons.length],
            ["كوبونات نشطة", activeCount],
            ["استخدامات محفوظة محلياً", totalUsage],
          ].map(([label, value]) => (
            <div key={label} className={`${card} p-5`}>
              <p className={`text-xs mb-2 ${muted}`}>{label}</p>
              <p className={`text-2xl font-black font-mono ${isDark ? "text-white" : "text-gray-900"}`}>{value}</p>
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
                حفظ محلي
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
            {coupons.map((coupon, index) => (
              <motion.div key={coupon.code} onClick={() => setSelectedCoupon(coupon)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.04 }} className={`grid grid-cols-12 items-center gap-2 px-5 py-4 cursor-pointer transition ${isDark ? "hover:bg-white/[0.04]" : "hover:bg-gray-50"}`}>
                <span className={`col-span-2 font-mono text-sm font-black ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>{coupon.code}</span>
                
                <span className={`col-span-2 text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {coupon.couponType === "points" ? `+${coupon.pointsGranted} نقطة` : 
                   coupon.couponType === "free_plan" ? "ترقية باقة" :
                   `${coupon.value}${coupon.discountType === "percentage" ? "%" : " ر.س"}`}
                </span>

                <div className="col-span-2">
                  <span className={`text-xs font-bold ${coupon.usedCount >= coupon.usageLimit ? "text-rose-500" : isDark ? "text-gray-300" : "text-gray-700"}`}>{coupon.usedCount}</span>
                  <span className={`text-xs ${muted}`}>/{coupon.usageLimit}</span>
                  <div className={`h-1 rounded-full mt-1 ${isDark ? "bg-gray-800" : "bg-gray-200"} w-20`}>
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min((coupon.usedCount / coupon.usageLimit) * 100, 100)}%` }} />
                  </div>
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
