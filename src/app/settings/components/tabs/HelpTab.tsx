"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpen, Headset, Question, CheckCircle, WarningCircle, ArrowClockwise, Clock } from "@phosphor-icons/react";
import {
  submitTicket, getMyTickets,
  TICKET_CATEGORIES, TICKET_CATEGORY_AR,
  TICKET_PRIORITIES, TICKET_PRIORITY_AR, TICKET_STATUS_AR,
  type Ticket, type TicketCategory, type TicketPriority, type TicketStatus,
} from "@/lib/services/ticketsService";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import { SectionTitle, EmptyPanel } from "./_shared";

const STATUS_STYLE: Record<TicketStatus, string> = {
  open:     "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  pending:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  closed:   "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

// ── Tab 6: Help ─────────────────────────────────────────────────────
export function HelpTab() {
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMsg,     setTicketMsg]     = useState("");
  const [category,      setCategory]      = useState<TicketCategory>(TICKET_CATEGORIES[0]);
  const [priority,      setPriority]      = useState<TicketPriority>("normal");
  const [submitting,    setSubmitting]    = useState(false);
  const [submitted,     setSubmitted]     = useState(false);
  const [submitError,   setSubmitError]   = useState<string | null>(null);

  const [ticketsRead, setTicketsRead] = useState<ListRead<Ticket> | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(true);

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      setTicketsRead(await getMyTickets());
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitTicket({ subject: ticketSubject.trim(), message: ticketMsg.trim(), category, priority });
      // A real success message, only now that the server answered.
      setSubmitted(true);
      setTicketSubject("");
      setTicketMsg("");
      setPriority("normal");
      await loadTickets();
      setTimeout(() => setSubmitted(false), 3000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "تعذّر إرسال التذكرة، حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  const ticketsState = listViewState(loadingTickets, ticketsRead);
  const tickets = itemsOf(ticketsRead);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: <BookOpen size={24} weight="fill" />, title: "مركز المساعدة", desc: "مقالات وأدلة مفصلة", color: "text-royal bg-royal/10 dark:text-emerald-400 dark:bg-emerald-400/10" },
          { icon: <Headset size={24} weight="fill" />, title: "تواصل مع الدعم", desc: "فريقنا متاح ٢٤/٧", color: "text-gold bg-gold/10" },
          { icon: <Question size={24} weight="fill" />, title: "الأسئلة الشائعة", desc: "أجوبة للأسئلة الأكثر طرحاً", color: "text-purple-400 bg-purple-400/10" },
        ].map((card) => (
          <button
            key={card.title}
            className="flex flex-col items-center gap-3 p-5 bg-white dark:bg-dark-card border border-gray-100 dark:border-gray-800 rounded-2xl hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-md transition-all text-center"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${card.color}`}>
              {card.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-300">{card.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{card.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div>
        <SectionTitle>إرسال تذكرة دعم</SectionTitle>
        <form onSubmit={handleSubmit} className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الموضوع</label>
            <input
              type="text"
              placeholder="وصف موجز للمشكلة"
              value={ticketSubject}
              onChange={(e) => setTicketSubject(e.target.value)}
              required
              minLength={3}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-royal/40 focus:border-royal transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الرسالة</label>
            <textarea
              rows={4}
              placeholder="اشرح مشكلتك بالتفصيل..."
              value={ticketMsg}
              onChange={(e) => setTicketMsg(e.target.value)}
              required
              minLength={5}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-royal/40 focus:border-royal transition-colors resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">التصنيف</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-royal/40 focus:border-royal transition-colors"
              >
                {TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{TICKET_CATEGORY_AR[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الأولوية</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-royal/40 focus:border-royal transition-colors"
              >
                {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{TICKET_PRIORITY_AR[p]}</option>)}
              </select>
            </div>
          </div>

          {submitError && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
              <WarningCircle size={14} weight="fill" />
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-royal hover:bg-royal/90 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-60"
          >
            {submitted ? <CheckCircle size={16} weight="fill" /> : null}
            {submitting ? "جارٍ الإرسال..." : submitted ? "تم الإرسال!" : "إرسال التذكرة"}
          </button>
        </form>
      </div>

      <div>
        <SectionTitle>تذاكري</SectionTitle>

        {ticketsState === "loading" && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-6">جارٍ التحميل...</p>
        )}

        {ticketsState === "unreadable" && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            <p className="text-xs font-semibold">تعذّر تحميل تذاكرك</p>
            <button onClick={loadTickets} className="flex items-center gap-1 text-xs font-bold hover:underline">
              <ArrowClockwise size={13} />
              إعادة المحاولة
            </button>
          </div>
        )}

        {ticketsState === "empty" && (
          <EmptyPanel
            icon={<Headset size={28} weight="duotone" />}
            title="لا توجد تذاكر بعد"
            description="أي تذكرة دعم ترسلها ستظهر هنا مع حالتها الفعلية."
          />
        )}

        {ticketsState === "ready" && (
          <div className="space-y-2.5">
            {tickets.map((t) => (
              <div key={t.id} className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-300">{t.subject}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{t.message}</p>
                  </div>
                  <span className={`flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[(t.status as TicketStatus)] ?? STATUS_STYLE.open}`}>
                    {TICKET_STATUS_AR[t.status as TicketStatus] ?? t.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {new Date(t.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}
                  </span>
                  {t.category && <span>· {TICKET_CATEGORY_AR[t.category as TicketCategory] ?? t.category}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
