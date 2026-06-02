"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Vault, CloudArrowUp, FileText, Buildings,
  IdentificationCard, Scroll, Certificate,
  Trash, Eye, Lock, User, Phone, Envelope,
  MapPin, Image, Stamp, Notebook, Warning,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock data ────────────────────────────────────────────────────────────────

const INITIAL_ITEMS = [
  { id: "1", name: "السجل التجاري", type: "reg", date: "مارس ٢٠٢٦", size: "١.٢ م.ب", icon: Buildings, expires: "رجب ١٤٤٨هـ", daysLeft: 320 },
  { id: "2", name: "عقد التأسيس", type: "contract", date: "يناير ٢٠٢٤", size: "٨٤٠ ك.ب", icon: Scroll, daysLeft: null },
  { id: "3", name: "لائحة العمل الداخلية", type: "policy", date: "ديسمبر ٢٠٢٥", size: "٢.١ م.ب", icon: FileText, daysLeft: null },
  { id: "4", name: "ترويسة المكتب الرسمية", type: "branding", date: "فبراير ٢٠٢٦", size: "١٨٠ ك.ب", icon: Certificate, daysLeft: null },
  { id: "5", name: "وكالة المحامي", type: "power", date: "مارس ٢٠٢٦", size: "٦٤٠ ك.ب", icon: Stamp, expires: "ربيع أول ١٤٤٧هـ", daysLeft: 45 },
  { id: "6", name: "بيانات ممثل النظامي", type: "id", date: "مارس ٢٠٢٦", size: "٦٤٠ ك.ب", icon: IdentificationCard, daysLeft: null },
];

const TYPE_LABELS: Record<string, string> = {
  reg: "سجل تجاري", contract: "عقد", policy: "لائحة", branding: "هوية", id: "هوية شخصية", power: "وكالة", other: "ملف",
};

const MOCK_LAWYER = {
  name: "أ. محمد بن عبدالله العتيبي",
  license: "١٢٣٤٥ / ١٤٤٦",
  court: "محكمة الاستئناف بالرياض",
  address: "الرياض — حي العليا — شارع العروبة",
  phone: "+966 55 123 4567",
  email: "m.otaibi@lawfirm.com.sa",
  hasLogo: true,
  hasLetterhead: true,
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type VaultTab = "documents" | "lawyer" | "templates";

const VAULT_TABS: { key: VaultTab; label: string; icon: typeof Vault }[] = [
  { key: "documents", label: "المستندات",   icon: Vault },
  { key: "lawyer",    label: "بيانات المحامي", icon: User },
  { key: "templates", label: "القوالب المحفوظة", icon: Notebook },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIVaultPage() {
  const { isDark } = useTheme();
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [dragging, setDragging] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<VaultTab>("documents");

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
    setDeleteId(null);
  }

  return (
    <div className={`p-5 md:p-7 max-w-4xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>خزنة البيانات الذكية</h1>
            <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 text-[10px] font-bold text-purple-400">MAX فقط</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            ارفع وثائق شركتك/مكتبك — AI ينزّل البيانات تلقائياً في كل عقد ومذكرة
          </p>
        </div>
        <div className={`hidden sm:flex items-center gap-1.5 rounded-xl px-3 py-2 border ${isDark ? "border-white/[0.06] bg-zinc-800" : "border-zinc-200 bg-zinc-50"}`}>
          <Lock size={12} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>مشفّر E2E</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className={`rounded-xl p-1 flex gap-1 ${isDark ? "bg-zinc-800/60" : "bg-zinc-100"}`}>
        {VAULT_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`relative flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[12px] font-semibold transition-all ${
                isActive
                  ? isDark ? "bg-[#0B3D2E] text-white shadow-md" : "bg-white text-[#0B3D2E] shadow-sm"
                  : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-700"
              }`}>
              <Icon size={15} weight={isActive ? "fill" : "regular"} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab 1: المستندات ── */}
      {activeTab === "documents" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          {/* Info strip */}
          <div className={`rounded-2xl p-4 border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
            <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              <span className="font-bold text-[#C8A762] me-1">كيف تعمل الخزنة؟</span>
              ارفع وثائق شركتك (سجل تجاري، عقد تأسيس، ترويسة...) — عند صياغة أي وثيقة، AI ينزّل بيانات الشركة تلقائياً.
            </p>
          </div>

          {/* Upload zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault(); setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) setItems(prev => [{ id: Date.now().toString(), name: f.name, type: "other", date: "الآن", size: `${(f.size / 1024).toFixed(0)} ك.ب`, icon: FileText, daysLeft: null }, ...prev]);
            }}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${dragging
              ? isDark ? "border-[#C8A762]/60 bg-[#C8A762]/5" : "border-amber-400/60 bg-amber-50"
              : isDark ? "border-white/[0.08] hover:border-[#C8A762]/30" : "border-zinc-200 hover:border-amber-300"
            }`}
          >
            <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${dragging ? "bg-[#C8A762]/20" : isDark ? "bg-white/[0.05]" : "bg-zinc-100"}`}>
              <CloudArrowUp size={22} className={dragging ? "text-[#C8A762]" : isDark ? "text-zinc-500" : "text-zinc-400"} />
            </div>
            <p className={`text-[13px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
              {dragging ? "أفلت الملف للرفع" : "اسحب وأفلت الملفات هنا"}
            </p>
            <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>PDF · Word · PNG/JPG — حد أقصى ٢٠ م.ب/ملف</p>
            <div className="flex flex-wrap gap-2 justify-center mt-3">
              {["سجل تجاري", "عقد تأسيس", "ترويسة", "لوائح", "وكالات", "صكوك"].map(t => (
                <span key={t} className={`rounded-full px-2.5 py-1 text-[10px] border ${isDark ? "border-white/[0.06] text-zinc-600" : "border-zinc-200 text-zinc-400"}`}>{t}</span>
              ))}
            </div>
          </div>

          {/* Vault items */}
          <div className={`${card} overflow-hidden shadow-sm`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
              <div className="flex items-center gap-2">
                <Vault size={16} weight="duotone" className="text-[#C8A762]" />
                <h2 className="font-bold text-[14px]">المستندات المحفوظة</h2>
              </div>
              <span className={`font-mono text-[12px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{items.length} ملف</span>
            </div>

            <AnimatePresence>
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Vault size={32} className={isDark ? "text-zinc-700 mb-3" : "text-zinc-300 mb-3"} />
                  <p className={`text-[13px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>الخزنة فارغة — ارفع مستنداتك للبدء</p>
                </div>
              ) : (
                <div className={`divide-y ${isDark ? "divide-white/[0.04]" : "divide-zinc-50"}`}>
                  {items.map((item, i) => {
                    const Icon = item.icon;
                    const isExpiring = item.daysLeft !== null && item.daysLeft !== undefined && item.daysLeft <= 60;
                    return (
                      <motion.div key={item.id}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, height: 0 }} transition={{ delay: i * 0.05 }}
                        className={`flex items-center gap-3 px-5 py-3.5 ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-zinc-50/70"}`}
                      >
                        <div className={`flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
                          <Icon size={16} weight="duotone" className="text-[#C8A762]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{item.name}</p>
                            {isExpiring && (
                              <span className="flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-bold text-orange-500">
                                <Warning size={8} /> ينتهي قريباً
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"}`}>{TYPE_LABELS[item.type] ?? "ملف"}</span>
                            <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{item.size}</span>
                            <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{item.date}</span>
                            {(item as any).expires && <span className={`text-[10px] ${isExpiring ? "text-orange-500 font-semibold" : isDark ? "text-zinc-600" : "text-zinc-400"}`}>↤ {(item as any).expires}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${isDark ? "hover:bg-white/[0.07] text-zinc-600 hover:text-zinc-300" : "hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"}`}>
                            <Eye size={13} />
                          </button>
                          <button onClick={() => setDeleteId(item.id)}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${isDark ? "hover:bg-red-900/30 text-zinc-600 hover:text-red-400" : "hover:bg-red-50 text-zinc-400 hover:text-red-500"}`}>
                            <Trash size={13} />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* ── Tab 2: بيانات المحامي ── */}
      {activeTab === "lawyer" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <div className={`rounded-2xl p-4 border ${isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
            <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              <span className="font-bold text-emerald-500 me-1">الغرض:</span>
              بيانات المحامي تُدرج تلقائياً عند صياغة أي مذكرة أو عقد. لا تحتاج لإعادة كتابتها في كل مرة.
            </p>
          </div>

          <div className={`${card} p-6 shadow-sm space-y-5`}>
            {/* Name + License */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: "اسم المحامي الكامل", value: MOCK_LAWYER.name, icon: User },
                { label: "رقم الترخيص", value: MOCK_LAWYER.license, icon: IdentificationCard },
              ].map((field, i) => (
                <div key={i}>
                  <label className={`text-[11px] font-semibold mb-1.5 flex items-center gap-1.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    <field.icon size={12} /> {field.label}
                  </label>
                  <input type="text" defaultValue={field.value}
                    className={`w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 focus:border-[#C8A762]/40" : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]/40"}`}
                  />
                </div>
              ))}
            </div>

            {/* Court */}
            <div>
              <label className={`text-[11px] font-semibold mb-1.5 flex items-center gap-1.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                <Buildings size={12} /> المحكمة المعتمدة
              </label>
              <select defaultValue={MOCK_LAWYER.court}
                className={`w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`}>
                <option>محكمة الاستئناف بالرياض</option>
                <option>محكمة الاستئناف بجدة</option>
                <option>المحكمة العامة بالرياض</option>
                <option>المحكمة الجزائية بالرياض</option>
                <option>محكمة التنفيذ بالرياض</option>
                <option>أخرى</option>
              </select>
            </div>

            {/* Address + Phone + Email */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "العنوان", value: MOCK_LAWYER.address, icon: MapPin },
                { label: "رقم الجوال", value: MOCK_LAWYER.phone, icon: Phone },
                { label: "البريد الإلكتروني", value: MOCK_LAWYER.email, icon: Envelope },
              ].map((field, i) => (
                <div key={i}>
                  <label className={`text-[11px] font-semibold mb-1.5 flex items-center gap-1.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    <field.icon size={12} /> {field.label}
                  </label>
                  <input type="text" defaultValue={field.value}
                    className={`w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 focus:border-[#C8A762]/40" : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]/40"}`}
                  />
                </div>
              ))}
            </div>

            {/* Logo + Letterhead */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: "شعار المكتب", desc: "PNG / SVG — مربع", icon: Image, uploaded: MOCK_LAWYER.hasLogo },
                { label: "ترويسة المكتب", desc: "PDF — حجم A4", icon: Stamp, uploaded: MOCK_LAWYER.hasLetterhead },
              ].map((field, i) => (
                <div key={i} className={`rounded-xl border-2 border-dashed p-6 text-center ${isDark ? "border-white/[0.06]" : "border-zinc-200"}`}>
                  <field.icon size={24} className={`mx-auto mb-2 ${field.uploaded ? "text-emerald-500" : isDark ? "text-zinc-600" : "text-zinc-400"}`} />
                  <p className={`text-[12px] font-semibold mb-0.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{field.label}</p>
                  <p className={`text-[10px] mb-2 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{field.desc}</p>
                  {field.uploaded ? (
                    <span className="text-[10px] font-bold text-emerald-500 rounded-full bg-emerald-500/10 px-2 py-0.5">✓ مرفوع</span>
                  ) : (
                    <button className="text-[10px] font-bold text-[#C8A762] rounded-full bg-[#C8A762]/10 px-2 py-0.5 hover:bg-[#C8A762]/20 transition-colors">رفع الملف</button>
                  )}
                </div>
              ))}
            </div>

            {/* Save button */}
            <div className="flex justify-end">
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-2.5 text-[13px] font-bold text-white shadow-md">
                حفظ البيانات
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Tab 3: القوالب المحفوظة ── */}
      {activeTab === "templates" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center mb-4 ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
              <Notebook size={28} className={isDark ? "text-zinc-600" : "text-zinc-400"} />
            </div>
            <h3 className={`text-[16px] font-bold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>القوالب المحفوظة</h3>
            <p className={`text-[13px] max-w-sm mb-4 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
              قوالب المذكرات والعقود التي أعجبتك ستظهر هنا — يمكنك إعادة استخدامها وتعديلها في أي وقت.
            </p>
            <div className={`rounded-xl px-4 py-2 border text-[11px] ${isDark ? "border-[#C8A762]/20 text-[#C8A762]" : "border-amber-200 text-amber-600"}`}>
              قريباً — ستتوفر مع تحديث الصائغ القانوني
            </div>
          </div>
        </motion.div>
      )}

      {/* Confirm delete */}
      <AnimatePresence>
        {deleteId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[4px]"
            onClick={e => { if (e.target === e.currentTarget) setDeleteId(null); }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-zinc-200"}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <Trash size={18} className="text-red-500" />
                </div>
                <p className={`font-bold text-[15px] ${isDark ? "text-white" : "text-zinc-900"}`}>حذف الملف؟</p>
              </div>
              <p className={`text-[13px] mb-5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                لن يتمكن AI من استخدام بيانات هذا الملف بعد حذفه.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setDeleteId(null)}
                  className={`flex-1 rounded-xl py-2.5 text-[13px] font-semibold border ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
                  إلغاء
                </button>
                <button onClick={() => removeItem(deleteId)}
                  className="flex-1 rounded-xl bg-red-600 py-2.5 text-[13px] font-bold text-white">
                  حذف
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
