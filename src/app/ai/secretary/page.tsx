"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Robot, Plus, Trash, ToggleLeft, ToggleRight,
  ClipboardText, ChartLine, ChatText,
  CheckCircle, Clock, Warning, Info, CaretLeft,
  ArrowRight, ListChecks, ChatCircleDots, PaperPlaneRight, DotsThree,
  Bell, ArrowSquareOut, Sparkle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerType = "mail_urgent" | "contract_expiry" | "hearing_3days" | "invoice_received" | "employee_probation" | "custom";
type ActionType = "whatsapp_alert" | "draft_email" | "add_task" | "notify_owner" | "generate_doc" | "communicate_client" | "notify_team_member" | "request_docs";
type FrequencyType = "once" | "recurring" | "on_event";

interface AutomationRule {
  id: string;
  title: string;
  trigger: TriggerType;
  action: ActionType;
  frequency: FrequencyType;
  active: boolean;
  lastFired?: string;
}

interface DecisionLog { id: string; date: string; category: string; title: string; notes: string; }
interface ActivityItem { id: string; time: string; actor: "secretary" | "user"; action: string; link?: string; }

// ─── Mock Data ────────────────────────────────────────────────────────────────

const INITIAL_RULES: AutomationRule[] = [
  { id: "r1", active: true, frequency: "on_event", title: "إشعار واتساب عند وصول بريد عاجل", trigger: "mail_urgent", action: "whatsapp_alert", lastFired: "منذ ساعتين" },
  { id: "r2", active: true, frequency: "recurring", title: "تنبيه بريد المورد قبل 30 يوم من انتهاء عقده", trigger: "contract_expiry", action: "draft_email", lastFired: "منذ 3 أيام" },
  { id: "r3", active: true, frequency: "on_event", title: "إشعار الموظف قبل انتهاء فترة التجربة بأسبوعين", trigger: "employee_probation", action: "generate_doc", lastFired: "لم تُفعَّل بعد" },
  { id: "r4", active: false, frequency: "on_event", title: "استخراج قيمة الفاتورة الواردة تلقائياً", trigger: "invoice_received", action: "add_task" },
];

const INITIAL_DECISIONS: DecisionLog[] = [
  { id: "d1", date: "09/04/2026", category: "موارد بشرية", title: "إنهاء فترة تجربة الموظف / فلان", notes: "تم إصدار نموذج التثبيت. مرفق في نظام الموارد." },
  { id: "d2", date: "07/04/2026", category: "قانوني",      title: "رفض التسوية في القضية Y",      notes: "توصية بانتظار جلسة الاستئناف القادمة." },
  { id: "d3", date: "05/04/2026", category: "تجاري",      title: "تجديد عقد مورد اللحوم",        notes: "تم رفع المبلغ بنسبة 5% — وافق المورد خطياً." },
];

const INITIAL_ACTIVITY: ActivityItem[] = [
  { id: "a1", time: "09:15", actor: "secretary", action: "جهّز مسودة تجديد عقد المورد الرئيسي", link: "/ai/contracts" },
  { id: "a2", time: "08:40", actor: "secretary", action: "أرسل رسالة تذكير للعميل أحمد عبدالله" },
  { id: "a3", time: "08:15", actor: "user",       action: "أضاف قرار: رفض التسوية في القضية Y" },
  { id: "a4", time: "أمس 17:30", actor: "secretary", action: "استخرج قيمة فاتورة شركة النجم: 48,500 ر.س" },
];

// ─── Labels ───────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<TriggerType, { label: string; icon: string }> = {
  mail_urgent:        { label: "وصول بريد عاجل عبر LegalMail",    icon: "" },
  contract_expiry:    { label: "اقتراب انتهاء عقد مسجل (30 يوم)", icon: "" },
  hearing_3days:      { label: "جلسة قضائية بعد 3 أيام",          icon: "" },
  invoice_received:   { label: "استلام فاتورة شراء عبر البريد",    icon: "" },
  employee_probation: { label: "انتهاء فترة تجربة الموظف قريباً",  icon: "" },
  custom:             { label: "حدث مخصص",                        icon: "" },
};

const ACTION_LABELS: Record<ActionType, { label: string; color: string }> = {
  whatsapp_alert: { label: "إرسال تنبيه واتساب",         color: "text-emerald-500" },
  draft_email:    { label: "إعداد مسودة بريد إلكتروني",  color: "text-blue-500" },
  add_task:       { label: "إضافة مهمة للقائمة",         color: "text-purple-500" },
  notify_owner:   { label: "تنبيه المالك / الشريك",      color: "text-amber-500" },
  generate_doc:   { label: "توليد مستند جاهز",           color: "text-[#C8A762]" },
  communicate_client: { label: "التواصل مع العميل (رسالة/بريد)", color: "text-teal-500" },
  notify_team_member: { label: "إسناد / تنبيه عضو بالفريق", color: "text-indigo-500" },
  request_docs:   { label: "طلب نواقص المستندات",        color: "text-orange-500" },
};

const FREQ_LABELS: Record<FrequencyType, string> = { once: "مرة واحدة", recurring: "متكررة", on_event: "عند الحدث" };

type Tab = "chat" | "rules" | "decisions" | "activity";

interface ChatMessage { id: string; sender: "user" | "secretary"; text: string; time: string; }
const INITIAL_CHAT: ChatMessage[] = [
  { id: "c1", sender: "secretary", text: "أهلاً بك أ. فهد. هل من مهام أو التزامات تود مني جدولتها أو تذكيرك بها؟", time: "08:00" }
];

// ─── AddRule Modal ─────────────────────────────────────────────────────────────
function AddRuleModal({ onAdd, onClose, isDark }: { onAdd: (r: Omit<AutomationRule, "id">) => void; onClose: () => void; isDark: boolean }) {
  const [trigger, setTrigger] = useState<TriggerType>("mail_urgent");
  const [action, setAction]   = useState<ActionType>("whatsapp_alert");
  const [freq, setFreq]       = useState<FrequencyType>("on_event");
  const [title, setTitle]     = useState("");
  const inp = `w-full rounded-xl border px-3 py-2 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-800"}`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
        className={`w-full max-w-md rounded-2xl p-6 space-y-4 ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200 shadow-xl"}`}
        onClick={e => e.stopPropagation()}>
        <h3 className={`text-[15px] font-black ${isDark ? "text-zinc-100" : "text-slate-800"}`}>إضافة قاعدة أتمتة جديدة</h3>
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>عنوان القاعدة</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="وصف موجز للقاعدة" className={inp} />
        </div>
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>الشرط (إذا...)</label>
          <select value={trigger} onChange={e => setTrigger(e.target.value as TriggerType)} className={inp}>
            {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
        </div>
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>الإجراء (نفّذ...)</label>
          <select value={action} onChange={e => setAction(e.target.value as ActionType)} className={inp}>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>التكرار</label>
          <div className="flex gap-2">
            {(Object.entries(FREQ_LABELS) as [FrequencyType, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setFreq(k)}
                className={`flex-1 py-2 rounded-xl border text-[12px] font-bold transition-all ${freq === k ? "bg-[#0B3D2E] text-white border-[#0B3D2E]" : isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl border text-[13px] font-semibold ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>إلغاء</button>
          <button onClick={() => { if (title) { onAdd({ title, trigger, action, frequency: freq, active: true }); onClose(); } }}
            disabled={!title} className="flex-1 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-bold disabled:opacity-40">
            إضافة القاعدة
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── AddDecision Modal ─────────────────────────────────────────────────────────
function AddDecisionModal({ onAdd, onClose, isDark }: { onAdd: (d: Omit<DecisionLog, "id">) => void; onClose: () => void; isDark: boolean }) {
  const [category, setCategory] = useState("قانوني");
  const [title, setTitle]       = useState("");
  const [notes, setNotes]       = useState("");
  const today = new Date().toLocaleDateString("ar", { day: "2-digit", month: "2-digit", year: "numeric" });
  const inp = `w-full rounded-xl border px-3 py-2 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-800"}`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
        className={`w-full max-w-md rounded-2xl p-6 space-y-4 ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200 shadow-xl"}`}
        onClick={e => e.stopPropagation()}>
        <h3 className={`text-[15px] font-black ${isDark ? "text-zinc-100" : "text-slate-800"}`}>تسجيل قرار جديد</h3>
        <div className="flex gap-2 flex-wrap">
          {["قانوني", "تجاري", "موارد بشرية", "إداري"].map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${category === c ? "bg-[#C8A762]/10 border-[#C8A762]/40 text-[#C8A762]" : isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
              {c}
            </button>
          ))}
        </div>
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>عنوان القرار</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="وصف موجز للقرار" className={inp} />
        </div>
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>ملاحظات</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="تفاصيل، مستندات، التوصية..." className={inp} />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl border text-[13px] font-semibold ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>إلغاء</button>
          <button onClick={() => { if (title) { onAdd({ date: today, category, title, notes }); onClose(); } }}
            disabled={!title} className="flex-1 py-2.5 rounded-xl bg-[#C8A762] text-white text-[13px] font-bold disabled:opacity-40">
            حفظ القرار
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SecretaryPage() {
  const { isDark } = useTheme();
  const [tab, setTab]               = useState<Tab>("chat");
  const [rules, setRules]           = useState<AutomationRule[]>(INITIAL_RULES);
  const [decisions, setDecisions]   = useState<DecisionLog[]>(INITIAL_DECISIONS);
  const [activity]                  = useState<ActivityItem[]>(INITIAL_ACTIVITY);
  const [showAddRule, setShowAddRule]         = useState(false);
  const [showAddDecision, setShowAddDecision] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [msgInput, setMsgInput] = useState("");
  const [isTyping, setIsTyping]   = useState(false);

  const handleSendChat = () => {
    if (!msgInput.trim()) return;
    const time = new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
    setMessages(prev => [...prev, { id: Date.now().toString(), sender: "user", text: msgInput, time }]);
    setMsgInput("");
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, { id: Date.now().toString(), sender: "secretary", text: "تم تسجيل ذلك في السجل، وسأقوم بتذكيرك في الوقت المناسب ومتابعة تنفيذه.", time: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) }]);
    }, 1500);
  };

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  const toggleRule    = (id: string) => setRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  const deleteRule    = (id: string) => setRules(prev => prev.filter(r => r.id !== id));
  const deleteDecision = (id: string) => setDecisions(prev => prev.filter(d => d.id !== id));
  const addRule       = (r: Omit<AutomationRule, "id">) => setRules(prev => [{ ...r, id: Date.now().toString() }, ...prev]);
  const addDecision   = (d: Omit<DecisionLog, "id">) => setDecisions(prev => [{ ...d, id: Date.now().toString() }, ...prev]);
  const activeCount   = rules.filter(r => r.active).length;

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "chat",      label: "المحادثة",       icon: ChatCircleDots },
    { id: "rules",     label: "قواعد الأتمتة",  icon: Robot },
    { id: "decisions", label: "سجل القرارات",   icon: ClipboardText },
    { id: "activity",  label: "سجل الأنشطة",    icon: ChartLine },
  ];

  return (
    <>
      <AnimatePresence>
        {showAddRule && <AddRuleModal onAdd={addRule} onClose={() => setShowAddRule(false)} isDark={isDark} />}
        {showAddDecision && <AddDecisionModal onAdd={addDecision} onClose={() => setShowAddDecision(false)} isDark={isDark} />}
      </AnimatePresence>

      <div className="max-w-3xl mx-auto space-y-6" dir="rtl">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-4 text-sm">
            <Link href="/ai" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>نظامي AI</Link>
            <CaretLeft size={12} className={isDark ? "text-zinc-600" : "text-slate-300"} />
            <span className={isDark ? "text-zinc-300" : "text-slate-600"}>السكرتير القانوني</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-[#0B3D2E]/10 flex items-center justify-center">
                <Robot size={24} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
              </div>
              {activeCount > 0 && (
                <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center">{activeCount}</span>
              )}
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
                السكرتير القانوني الذكي
              </h1>
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {activeCount} قاعدة أتمتة نشطة · {decisions.length} قرار مسجل · {activity.length} نشاط اليوم
              </p>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {([
            { label: "قواعد نشطة",   value: activeCount,       Icon: ToggleRight,  color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "قرارات مسجلة", value: decisions.length,  Icon: ClipboardText, color: "text-[#C8A762]",  bg: "bg-[#C8A762]/10" },
            { label: "أنشطة اليوم",  value: activity.length,   Icon: ChartLine,     color: "text-blue-500",   bg: "bg-blue-500/10" },
          ]).map(({ label, value, Icon, color, bg }) => (
            <div key={label} className={`${card} p-4 flex items-center gap-3`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
                <Icon size={18} className={color} weight="duotone" />
              </div>
              <div>
                <p className={`text-[18px] font-black ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{value}</p>
                <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── مستجدات التشريعات widget ── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className={`rounded-2xl border p-4 ${isDark ? "border-[#C8A762]/15 bg-[#C8A762]/[0.03]" : "border-amber-100 bg-amber-50/50"}`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${isDark ? "bg-[#C8A762]/15" : "bg-amber-100"}`}>
                <Bell size={14} weight="duotone" className="text-[#C8A762]" />
              </div>
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
                مستجدات تشريعية
              </p>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-100 text-emerald-700"}`}>
                3 جديد
              </span>
            </div>
            <Link
              href="/ai/monitor"
              className={`flex items-center gap-1 text-[11px] font-semibold transition ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}
            >
              عرض الكل <ArrowSquareOut size={11} />
            </Link>
          </div>
          <div className="space-y-2">
            {[
              { title: "تعديل اللائحة التنفيذية لنظام العمل — باب الإجازات", date: "٩ أبريل ٢٠٢٦", badge: "عمالي", isNew: true },
              { title: "قرار وزارة العدل بشأن رسوم التوثيق الإلكتروني", date: "٧ أبريل ٢٠٢٦", badge: "إداري", isNew: true },
              { title: "تحديث نظام التحكيم — اشتراطات اتفاق التحكيم الدولي", date: "٣ أبريل ٢٠٢٦", badge: "تجاري", isNew: false },
            ].map((item, i) => (
              <Link
                key={i}
                href="/ai/monitor"
                className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition group ${
                  isDark ? "hover:bg-white/[0.04]" : "hover:bg-white"
                }`}
              >
                <div className="flex-shrink-0 pt-0.5">
                  {item.isNew
                    ? <span className="block w-2 h-2 rounded-full bg-emerald-500 mt-0.5" />
                    : <span className="block w-2 h-2 rounded-full bg-slate-300 mt-0.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-semibold leading-snug truncate group-hover:text-[#C8A762] transition ${
                    isDark ? "text-zinc-200" : "text-zinc-700"
                  }`}>
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-500"
                    }`}>{item.badge}</span>
                    <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.date}</span>
                  </div>
                </div>
                <ArrowSquareOut size={11} className={`flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition ${
                  isDark ? "text-zinc-500" : "text-slate-400"
                }`} />
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Tabs */}
        <div className={`p-1.5 rounded-2xl flex gap-1 ${isDark ? "bg-zinc-800/80" : "bg-slate-100"}`}>
          {TABS.map(t => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all text-[12px] font-bold ${isActive ? isDark ? "bg-zinc-700 text-zinc-100 shadow-sm" : "bg-white text-slate-800 shadow-sm" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>

            {/* Chat */}
            {tab === "chat" && (
              <div className={`flex flex-col h-[400px] rounded-2xl border ${isDark ? "border-white/[0.06] bg-zinc-900/40" : "border-slate-100 bg-white"}`}>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((m) => (
                    <div key={m.id} className={`flex w-full ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                        m.sender === "user" 
                          ? "bg-[#0B3D2E] text-white rounded-tl-none" 
                          : isDark ? "bg-zinc-800 text-zinc-200 rounded-tr-none" : "bg-slate-100 text-slate-800 rounded-tr-none"
                      }`}>
                        <div className="flex items-center gap-2 mb-1 opacity-70">
                          {m.sender === "secretary" && <Robot size={12} />}
                          <span className="text-[10px] font-bold">{m.sender === "secretary" ? "السكرتير الذكي" : "أنت"}</span>
                          <span className="text-[9px] mx-1">·</span>
                          <span className="text-[9px]">{m.time}</span>
                        </div>
                        <p className="text-[13px] leading-relaxed">{m.text}</p>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex w-full justify-start">
                      <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${isDark ? "bg-zinc-800 text-zinc-200 rounded-tr-none" : "bg-slate-100 text-slate-800 rounded-tr-none"}`}>
                         <DotsThree size={24} weight="bold" className="animate-pulse opacity-50" />
                      </div>
                    </div>
                  )}
                </div>
                <div className={`p-3 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                  <div className="relative flex items-center">
                    <input 
                      value={msgInput} 
                      onChange={e => setMsgInput(e.target.value)} 
                      onKeyDown={e => e.key === "Enter" && handleSendChat()}
                      placeholder="اطلب أي تفويض، تذكير، أو جدولة مهمة..." 
                      className={`w-full rounded-xl border px-4 py-3 pe-12 text-[13px] outline-none transition-all ${isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]/50" : "border-slate-200 bg-slate-50 text-slate-800 focus:border-[#0B3D2E]/30"}`} 
                    />
                    <button onClick={handleSendChat} disabled={!msgInput.trim()} className="absolute left-2 w-8 h-8 flex items-center justify-center rounded-lg bg-[#0B3D2E] text-white disabled:opacity-40 transition-opacity">
                      <PaperPlaneRight size={15} weight="fill" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Rules */}
            {tab === "rules" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>التعليمات المستدامة (إذا... نفّذ...)</p>
                  <button onClick={() => setShowAddRule(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0B3D2E] text-white text-[12px] font-bold">
                    <Plus size={13} /> قاعدة جديدة
                  </button>
                </div>
                {rules.map(rule => (
                  <motion.div key={rule.id} layout className={`${card} p-4 flex items-start gap-3 ${!rule.active ? "opacity-50" : ""}`}>
                    <button onClick={() => toggleRule(rule.id)} className="mt-0.5 flex-shrink-0">
                      {rule.active
                        ? <ToggleRight size={22} className="text-emerald-500" weight="fill" />
                        : <ToggleLeft size={22} className={isDark ? "text-zinc-600" : "text-slate-300"} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-bold mb-1.5 ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{rule.title}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-500"}`}>
                          {TRIGGER_LABELS[rule.trigger].icon} {TRIGGER_LABELS[rule.trigger].label}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isDark ? "bg-white/[0.06]" : "bg-slate-100"} ${ACTION_LABELS[rule.action].color}`}>
                          {ACTION_LABELS[rule.action].label}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.04] text-zinc-600" : "bg-slate-50 text-slate-400"}`}>{FREQ_LABELS[rule.frequency]}</span>
                      </div>
                      {rule.lastFired && <p className={`text-[10px] mt-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}><Clock size={10} className="inline me-1" />آخر تفعيل: {rule.lastFired}</p>}
                    </div>
                    <button onClick={() => deleteRule(rule.id)} className={`flex-shrink-0 p-1.5 rounded-xl ${isDark ? "text-zinc-700 hover:text-red-400 hover:bg-red-900/20" : "text-slate-300 hover:text-red-400 hover:bg-red-50"}`}><Trash size={14} /></button>
                  </motion.div>
                ))}
                <div className={`p-4 rounded-2xl border ${isDark ? "border-white/[0.04] bg-white/[0.01]" : "border-slate-100 bg-slate-50"}`}>
                  <p className={`text-[11px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    <Info size={11} className="inline me-1" />أمثلة مقترحة
                  </p>
                  {[
                    "إذا اقتربت جلسة قضائية بعد 3 أيام → أرسل رسالة آلية للعميل لتجهيز المستندات",
                    "إذا وصل بريد بتصنيف دعوى/عاجل → أرسل واتساب فوري بملخص الموضوع",
                    "إذا انتهت فترة تجربة الموظف → جهّز نموذج قرار (تثبيت/إنهاء)",
                  ].map((s, i) => (
                    <p key={i} className={`text-[11px] mb-1.5 leading-relaxed ${isDark ? "text-zinc-600" : "text-slate-400"}`}>• {s}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Decisions */}
            {tab === "decisions" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>سجل القرارات الموثقة</p>
                  <button onClick={() => setShowAddDecision(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C8A762] text-white text-[12px] font-bold">
                    <Plus size={13} /> تسجيل قرار
                  </button>
                </div>
                {decisions.map(d => (
                  <motion.div key={d.id} layout className={`${card} p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-600 border border-amber-200"}`}>{d.category}</span>
                          <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{d.date}</span>
                        </div>
                        <p className={`text-[13px] font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{d.title}</p>
                        {d.notes && <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{d.notes}</p>}
                      </div>
                      <button onClick={() => deleteDecision(d.id)} className={`flex-shrink-0 p-1.5 rounded-xl ${isDark ? "text-zinc-700 hover:text-red-400 hover:bg-red-900/20" : "text-slate-300 hover:text-red-400 hover:bg-red-50"}`}><Trash size={13} /></button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Activity */}
            {tab === "activity" && (
              <div className="space-y-2">
                <p className={`text-[13px] font-bold mb-3 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>سجل الأنشطة اليوم</p>
                {activity.map((item, i) => (
                  <motion.div key={item.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className={`${card} p-3.5 flex items-center gap-3`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${item.actor === "secretary" ? isDark ? "bg-[#0B3D2E]/20" : "bg-[#0B3D2E]/8" : isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
                      {item.actor === "secretary"
                        ? <Robot size={15} className={isDark ? "text-emerald-400" : "text-[#0B3D2E]"} />
                        : <CheckCircle size={15} className="text-[#C8A762]" weight="fill" />}
                    </div>
                    <div className="flex-1">
                      <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{item.action}</p>
                      <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.actor === "secretary" ? "السكرتير" : "أنت"} · {item.time}</p>
                    </div>
                    {item.link && <Link href={item.link} className={`text-[11px] flex items-center gap-1 ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>فتح <ArrowRight size={11} /></Link>}
                  </motion.div>
                ))}
                <div className={`mt-4 p-3.5 rounded-2xl border flex gap-2 ${isDark ? "border-white/[0.04] bg-white/[0.01]" : "border-slate-100 bg-slate-50"}`}>
                  <Warning size={13} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`} />
                  <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>هذا السجل يُحفَظ 30 يوماً. ميزة تصدير PDF قادمة قريباً.</p>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/ai/mail-advisor" className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${isDark ? "border-white/[0.06] hover:bg-white/[0.03]" : "border-slate-100 hover:bg-slate-50 bg-white shadow-sm"}`}>
            <ChatText size={18} className="text-blue-500" weight="duotone" />
            <div>
              <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>LegalMail</p>
              <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>تحليل البريد الوارد</p>
            </div>
            <ArrowRight size={13} className="ms-auto text-slate-300" />
          </Link>
          <Link href="/dashboard/lawyer/tasks" className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${isDark ? "border-white/[0.06] hover:bg-white/[0.03]" : "border-slate-100 hover:bg-slate-50 bg-white shadow-sm"}`}>
            <ListChecks size={18} className="text-purple-500" weight="duotone" />
            <div>
              <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>المهام</p>
              <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>عرض المهام النشطة</p>
            </div>
            <ArrowRight size={13} className="ms-auto text-slate-300" />
          </Link>
        </div>
      </div>
    </>
  );
}
