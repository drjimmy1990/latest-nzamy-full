"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Briefcase, Envelope, MagnifyingGlass, Copy, ArrowLeft, CheckCircle, Warning, ThumbsUp, ThumbsDown, PencilSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";
import Link from "next/link";
import { useState } from "react";

type TrustStatus = "confirmed" | "unconfirmed" | "systemic";

interface CircuitEmail {
  id: number;
  region: string;
  court: string;
  name: string;
  currentEmail: string;
  status: TrustStatus;
  proposedEmail?: string;
  votes?: number;
  requiredVotes?: number;
  systemSource?: string;
}

const INITIAL_CIRCUITS: CircuitEmail[] = [
  { 
    id: 1, region: "الرياض", court: "المحكمة التجارية", name: "الدائرة التجارية الأولى", 
    currentEmail: "com1.riyadh@moj.gov.sa", status: "systemic", systemSource: "مستخرج من تعميم وزارة العدل رقم ١٤٤٥/٢٣" 
  },
  { 
    id: 2, region: "جدة", court: "المحكمة العمالية", name: "الدائرة العمالية الثالثة", 
    currentEmail: "lab3.jeddah@moj.gov.sa", status: "confirmed" 
  },
  { 
    id: 3, region: "الدمام", court: "المحكمة العامة", name: "الدائرة العامة الخامسة", 
    currentEmail: "gen5.dammam@moj.gov.sa", status: "unconfirmed",
    proposedEmail: "dammam.gen5.updates@moj.gov.sa", votes: 3, requiredVotes: 5
  },
  { 
    id: 4, region: "مكة المكرمة", court: "محكمة التنفيذ", name: "دائرة التنفيذ الثانية", 
    currentEmail: "exe2.makkah@moj.gov.sa", status: "confirmed" 
  },
];

export default function CircuitsEmailsPage() {
  const { isDark } = useTheme();
  const [circuits, setCircuits] = useState(INITIAL_CIRCUITS);
  const [voteHistory, setVoteHistory] = useState<Record<number, "up" | "down">>({});
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleVote = (id: number, type: "up" | "down") => {
    if (voteHistory[id]) return;
    setVoteHistory(prev => ({ ...prev, [id]: type }));
    
    setCircuits(prev => prev.map(c => {
      if (c.id === id && c.status === "unconfirmed" && type === "up" && c.votes !== undefined && c.requiredVotes !== undefined) {
        const newVotes = c.votes + 1;
        if (newVotes >= c.requiredVotes) {
          // Edit becomes confirmed!
          return { ...c, currentEmail: c.proposedEmail!, status: "confirmed", proposedEmail: undefined, votes: undefined, requiredVotes: undefined };
        }
        return { ...c, votes: newVotes };
      }
      return c;
    }));
  };

  return (
    <SubscriptionGuard featureKey="business-litigation">
    <div className={`p-5 md:p-8 space-y-6 max-w-5xl mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard/business" className={`p-2 rounded-xl transition-colors ${isDark ? "bg-white/[0.04] hover:bg-white/[0.08]" : "bg-zinc-100 hover:bg-zinc-200"}`}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Briefcase className="text-[#C8A762]" weight="duotone" /> 
            دليل إيميلات الدوائر (تحديث جماعي)
          </h1>
          <p className={isDark ? "text-zinc-400" : "text-zinc-600"}>تأكد من صحة إيميلات الدوائر مبنياً على تجارب المحامين الميدانية ومصادر النظام.</p>
        </div>
      </div>

      {/* Search */}
      <div className={`relative flex items-center p-2 rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-200 shadow-sm"}`}>
        <MagnifyingGlass size={20} className={`ms-3 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
        <input 
          type="text" 
          placeholder="ابحث باسم المحكمة، المدينة، أو الدائرة..."
          className="flex-1 bg-transparent border-none outline-none py-2 px-3 text-sm"
        />
      </div>

      {/* List */}
      <div className="grid gap-4 mt-8">
        {circuits.map((c, i) => (
          <motion.div 
            key={c.id}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className={`flex flex-col p-5 rounded-3xl border overflow-hidden relative ${isDark ? "bg-zinc-900/50 border-white/[0.06]" : "bg-white border-zinc-200 shadow-sm"}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-100 text-zinc-600"}`}>
                    {c.region}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-[#0B3D2E]/20 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                    {c.court}
                  </span>
                  
                  {/* Status Badge */}
                  {c.status === "systemic" && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400" title={c.systemSource}>
                      <ShieldCheck size={12} weight="fill" /> إجابة نظامية (رسمية)
                    </span>
                  )}
                  {c.status === "confirmed" && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle size={12} weight="fill" /> أكيدة (تصديق المحامين)
                    </span>
                  )}
                  {c.status === "unconfirmed" && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Warning size={12} weight="fill" /> غير أكيدة (تحت المراجعة)
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-[16px] mb-3">{c.name}</h3>

                <div className="space-y-2">
                  {/* Current Email */}
                  <div className={`p-3 rounded-xl border flex items-center justify-between gap-4 ${c.status === "unconfirmed" ? isDark ? "bg-red-950/20 border-red-900/30 line-through opacity-60" : "bg-red-50 border-red-100 line-through opacity-60" : isDark ? "bg-zinc-950/50 border-white/5" : "bg-zinc-50 border-zinc-100"}`}>
                    <div className="flex items-center gap-2 text-sm font-mono font-medium">
                      <Envelope size={15} className="text-[#C8A762]" />
                      {c.currentEmail}
                    </div>
                    {c.status !== "unconfirmed" && (
                      <button className="text-zinc-500 hover:text-zinc-800 dark:hover:text-white transition-colors"><Copy size={16} /></button>
                    )}
                  </div>

                  {/* Proposed Email (Google Maps Edit Style) */}
                  {c.status === "unconfirmed" && c.proposedEmail && (
                    <div className={`p-3 rounded-xl border flex flex-col gap-3 ${isDark ? "bg-amber-950/20 border-amber-500/20" : "bg-amber-50 border-amber-200"}`}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-sm font-mono font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle size={15} weight="fill" />
                          {c.proposedEmail}
                        </div>
                        <button className="text-zinc-500 hover:text-zinc-800 dark:hover:text-white transition-colors"><Copy size={16} /></button>
                      </div>
                      
                      {/* Community Validation */}
                      <div className="flex items-center justify-between border-t border-amber-200/50 dark:border-amber-500/10 pt-3 mt-1">
                        <p className={`text-[11px] font-bold flex items-center gap-1.5 ${isDark ? "text-amber-400/80" : "text-amber-700"}`}>
                          تم اقتراح هذا البريد مؤخراً. (المؤيدين: {c.votes}/{c.requiredVotes})
                        </p>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] me-2 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>هل توافق على هذا التعديل؟</span>
                          <button 
                            disabled={!!voteHistory[c.id]}
                            onClick={() => handleVote(c.id, "up")}
                            className={`p-1.5 rounded-md border transition-colors ${voteHistory[c.id] === "up" ? "bg-emerald-500 border-emerald-500 text-white" : isDark ? "bg-zinc-900 border-white/10 text-zinc-400 hover:text-emerald-400" : "bg-white border-zinc-200 text-zinc-500 hover:text-emerald-600"} disabled:cursor-not-allowed`}
                          >
                            <ThumbsUp size={14} weight={voteHistory[c.id] === "up" ? "fill" : "regular"} />
                          </button>
                          <button 
                            disabled={!!voteHistory[c.id]}
                            onClick={() => handleVote(c.id, "down")}
                            className={`p-1.5 rounded-md border transition-colors ${voteHistory[c.id] === "down" ? "bg-red-500 border-red-500 text-white" : isDark ? "bg-zinc-900 border-white/10 text-zinc-400 hover:text-red-400" : "bg-white border-zinc-200 text-zinc-500 hover:text-red-600"} disabled:cursor-not-allowed`}
                          >
                            <ThumbsDown size={14} weight={voteHistory[c.id] === "down" ? "fill" : "regular"} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button */}
              {c.status !== "unconfirmed" && (
                <button 
                  onClick={() => setEditingId(c.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${isDark ? "bg-white/[0.03] border-white/10 hover:bg-white/[0.08]" : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100"}`}
                >
                  <PencilSimple size={14} /> اقتراح تصحيح
                </button>
              )}
            </div>

            {/* Editing Panel */}
            <AnimatePresence>
              {editingId === c.id && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-4">
                  <div className={`p-4 rounded-xl border ${isDark ? "bg-zinc-950 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                    <p className="text-xs font-bold mb-2">أدخل الإيميل الصحيح وتأكد منه:</p>
                    <div className="flex gap-2">
                      <input type="email" placeholder="example@moj.gov.sa" className={`flex-1 px-3 py-2 rounded-lg text-sm border outline-none ${isDark ? "bg-zinc-900 border-white/10" : "bg-white border-zinc-200"}`} />
                      <button onClick={() => setEditingId(null)} className="px-4 bg-[#0B3D2E] text-white text-xs font-bold rounded-lg shadow-sm">إرسال الاقتراح للمراجعة</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
    </SubscriptionGuard>
  );
}

// Additional imports for Shields
import { ShieldCheck } from "@phosphor-icons/react";
