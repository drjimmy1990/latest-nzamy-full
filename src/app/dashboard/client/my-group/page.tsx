"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import {
  UsersThree, Crown, CreditCard, CheckCircle, Clock, Gavel,
  Warning, Plus, ShareNetwork, Repeat, Bell,
  ArrowLeft, Gear, UserPlus, SealPercent, ArrowClockwise,
  PaperPlaneTilt, ChartBar, Star, Confetti, X, Copy,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useClientGroupMembership } from "@/hooks/useClientGroupMembership";
import { createGroup, joinGroup, inviteToGroup, getGroupState, getGroupMembers, getGroups } from "@/lib/services/groupService";
import { SkeletonCard } from "../_components/DashboardSkeleton";
import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

// ── Types ────────────────────────────────────────────────────────────────────
interface Member {
  id: string; name: string; initials: string;
  role: "admin" | "member"; queriesUsed: number; queriesTotal: number;
  rotationIndex: number; skippedTurns: number; status: "active" | "inactive";
}
interface RotationEntry {
  month: string; memberId: string; memberName: string;
  status: "paid" | "current" | "upcoming" | "skipped"; amount: number; paidAt?: string;
}

// ── Default fallback data ──────────────────────────────────────────────────────────
const DEFAULT_GROUP = {
  id: "", name: "الربع القانونية",
  plan: "الربع القانونية", totalCost: 499, perPerson: 99,
  lawyerConsultsLeft: 1, caseUsed: false,
  maxMembers: 5, skipGraceDays: 3,
  totalUsed: 0, totalQuota: 100,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const card = "relative rounded-[1.5rem] border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-hidden";
const sp = { type:"spring" as const, stiffness:120, damping:20 };
const stagger = { hidden:{}, visible:{ transition:{ staggerChildren:0.07 } } };
const fadeUp = { hidden:{ opacity:0, y:16 }, visible:{ opacity:1, y:0, transition:sp } };

function Avatar({ initials, size="md", glow=false, isDark=true }: { initials:string; size?:"sm"|"md"|"lg"; glow?:boolean; isDark?:boolean }) {
  const s = size==="lg"?"w-16 h-16 text-xl":size==="sm"?"w-8 h-8 text-xs":"w-11 h-11 text-sm";
  return (
    <div className={`${s} rounded-full bg-gradient-to-br from-emerald-500/30 to-teal-500/20 flex items-center justify-center font-bold flex-shrink-0 ${isDark?"text-emerald-300 border border-emerald-500/20":"text-emerald-700 border border-emerald-500/30"} ${glow?"shadow-lg shadow-emerald-500/20":""}`}>
      {initials}
    </div>
  );
}



// ── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onCreate, onJoin, isDark }: { onCreate:()=>void; onJoin:()=>void; isDark:boolean }) {
  const card = isDark
    ? "relative rounded-[1.5rem] border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-hidden"
    : "relative rounded-[1.5rem] border border-zinc-200 bg-white shadow-sm overflow-hidden";

  const discounts = [
    { n:2, pct:15, price:84 }, { n:3, pct:20, price:79 },
    { n:4, pct:25, price:74 }, { n:5, pct:30, price:69 },
  ];
  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-8 max-w-2xl mx-auto py-16 text-center">
      <motion.div variants={fadeUp} className="space-y-4">
        <div className={`w-20 h-20 rounded-[1.5rem] flex items-center justify-center mx-auto ${isDark ? "bg-white/5 border border-white/10" : "bg-emerald-50 border border-emerald-100"}`}>
          <UsersThree size={40} className={isDark ? "text-emerald-400" : "text-emerald-600"} weight="duotone" />
        </div>
        <h1 className={`text-3xl font-bold tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>الربع القانونية</h1>
        <p className={`leading-relaxed max-w-md mx-auto ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          اشترك مع أصدقائك أو عائلتك — كلما كبر عددكم، كبر الخصم. نظام تناوب ذكي يدير الدفع تلقائياً.
        </p>
      </motion.div>
      <motion.div variants={fadeUp} className={`${card} p-6`}>
        <p className={`text-xs mb-4 font-medium ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>الخصم حسب حجم المجموعة</p>
        <div className="grid grid-cols-4 gap-3">
          {discounts.map(d => (
            <div key={d.n} className={`rounded-xl p-3 text-center space-y-1 ${isDark ? "bg-white/5 border border-white/10" : "bg-zinc-50 border border-zinc-100"}`}>
              <p className={`text-lg font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>{d.n}<span className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-400"}`}> أشخاص</span></p>
              <p className="text-emerald-500 font-bold text-sm">-{d.pct}%</p>
              <p className={`text-xs font-mono ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{d.price} ر.س/شخص</p>
            </div>
          ))}
        </div>
      </motion.div>
      <motion.div variants={fadeUp} className={`${card} p-5 text-right space-y-3`}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Repeat size={16} className={isDark ? "text-amber-400" : "text-amber-600"} />
          </div>
          <div>
            <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-zinc-800"}`}>نظام التناوب الذكي</p>
            <p className={`text-xs mt-0.5 leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>كل شهر شخص واحد يدفع المبلغ كاملاً. لو ما دفع خلال ٣ أيام، ينتقل الدور تلقائياً للتالي.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ChartBar size={16} className={isDark ? "text-blue-400" : "text-blue-600"} />
          </div>
          <div>
            <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-zinc-800"}`}>شفافية تامة</p>
            <p className={`text-xs mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>كل عضو يشوف استهلاك المجموعة كاملاً — الأرقام فقط، بدون محتوى الأسئلة.</p>
          </div>
        </div>
      </motion.div>
      <motion.div variants={fadeUp} className="flex gap-3 justify-center flex-wrap">
        <motion.button onClick={onCreate} whileHover={{ scale:1.03, y:-2 }} whileTap={{ scale:0.97 }} transition={sp}
          className="flex items-center gap-2 px-6 py-3 rounded-[1rem] bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 transition-colors shadow-sm">
          <Plus size={18} weight="bold" />
          أنشئ مجموعة جديدة
        </motion.button>
        <motion.button onClick={onJoin} whileHover={{ scale:1.03, y:-2 }} whileTap={{ scale:0.97 }} transition={sp}
          className={`flex items-center gap-2 px-6 py-3 rounded-[1rem] border font-medium text-sm transition-colors ${isDark ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 shadow-sm"}`}>
          <UserPlus size={18} />
          انضم بكود دعوة
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function MyGroupPage() {
  const { isDark } = useTheme();
  const searchParams = useSearchParams();
  const membership = useClientGroupMembership();
  const hasGroup = membership.hasGroup;
  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Modals state
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string>("");

  // Dynamic data from service
  const [groupData, setGroupData] = useState<{ group: any; members: Member[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasGroup) {
      setLoading(false);
      return;
    }
    getGroupState()
      .then(async (state) => {
        if (state.status === "none") {
          setGroupData(null);
          return;
        }
        // Fetch members + the group's join_code (for the invite link) in parallel.
        let members: Member[] = [];
        let code = "";
        if (state.groupId) {
          try {
            const [apiMembers, groups] = await Promise.all([
              getGroupMembers(state.groupId),
              getGroups(),
            ]);
            members = apiMembers.map((m, i) => ({
              id: m.user_id,
              name: m.profile?.display_name || m.user_id,
              initials: (m.profile?.display_name || "--").slice(0, 2),
              role: m.role === "owner" ? "admin" as const : "member" as const,
              queriesUsed: 0,
              queriesTotal: 25,
              rotationIndex: i,
              skippedTurns: 0,
              status: m.status === "active" ? "active" as const : "inactive" as const,
            }));
            const matched = groups.find((g) => g.id === state.groupId);
            code = matched?.join_code ?? "";
          } catch { /* keep empty */ }
        }
        setInviteCode(code);
        setGroupData({
          group: { ...DEFAULT_GROUP, id: state.groupId || "", name: state.groupName || DEFAULT_GROUP.name, invite_code: code },
          members,
        });
      })
      .catch(() => setGroupData(null))
      .finally(() => setLoading(false));
  }, [hasGroup]);

  // Derive display data from service response
  const GROUP = groupData?.group || DEFAULT_GROUP;
  const MEMBERS: Member[] = groupData?.members || [];
  // Rotation/payer/billing derivations removed — there is no rotation or billing
  // backend, so those values were pure array-index fiction rendered to real
  // users as "money owed". The billing/rotation UI is gated behind
  // DashboardComingSoon below; only the real membership features remain.
  const activeGroup = { ...GROUP, name: membership.groupName ?? GROUP.name };

  const card = isDark
    ? "relative rounded-[1.5rem] border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-hidden"
    : "relative rounded-[1.5rem] border border-zinc-200 bg-white shadow-sm overflow-hidden";

  if (loading) {
    return (
      <div className={`p-6 md:p-10 space-y-4 max-w-5xl ${isDark ? "text-white" : "text-zinc-900"}`} dir="rtl">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!hasGroup) {
    return (
      <div className={`p-6 md:p-10 min-h-[80vh] flex flex-col items-center justify-center ${isDark ? "text-white" : "text-zinc-900"}`}>
        <EmptyState onCreate={() => setShowCreate(true)} onJoin={() => setShowJoin(true)} isDark={isDark} />
        
        {/* Create Group Modal */}
        <AnimatePresence>
          {showCreate && (
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
              <motion.div initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }} exit={{ scale:0.9, y:20 }}
                className={`w-full max-w-md rounded-[2rem] p-6 border ${isDark ? "bg-zinc-900 border-white/10" : "bg-white border-zinc-200 shadow-xl"}`}>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold">إنشاء مجموعة جديدة</h2>
                  <button onClick={() => setShowCreate(false)} className={isDark ? "text-zinc-500 hover:text-white" : "text-zinc-400 hover:text-zinc-800"}><X size={20} /></button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>اسم المجموعة</label>
                    <input 
                      autoFocus
                      placeholder="مثال: عائلة المحمد"
                      value={groupName}
                      onChange={e => setGroupName(e.target.value)}
                      className={`w-full rounded-xl px-4 py-3 border outline-none transition-colors ${isDark ? "bg-zinc-800 border-white/10 focus:border-emerald-500" : "bg-zinc-50 border-zinc-200 focus:border-emerald-500"}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>حجم المجموعة</label>
                    <select className={`w-full rounded-xl px-4 py-3 border outline-none appearance-none ${isDark ? "bg-zinc-800 border-white/10" : "bg-zinc-50 border-zinc-200"}`}>
                      <option>٥ أشخاص (خصم ٣٠٪) - الأفضل</option>
                      <option>٤ أشخاص (خصم ٢٥٪)</option>
                      <option>٣ أشخاص (خصم ٢٠٪)</option>
                      <option>شخصين (خصم ١٥٪)</option>
                    </select>
                  </div>
                </div>

                <div className={`mt-6 p-4 rounded-xl mb-6 ${isDark ? "bg-white/5 border border-white/10" : "bg-zinc-50 border border-zinc-200"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <UsersThree size={16} weight="fill" className={isDark ? "text-emerald-400" : "text-emerald-600"} />
                    <p className={`text-sm font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>إنشاء المجموعة</p>
                  </div>
                  <p className={`text-xs leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>ستحصل على رابط الدعوة فوراً لدعوة باقي الأعضاء. نظام الفوترة والتناوب غير مفعَّل بعد — لن يتم سحب أي مبلغ الآن.</p>
                </div>

                {createError && (
                  <div className={`mb-4 rounded-xl border px-4 py-2.5 text-xs ${isDark ? "border-rose-500/20 bg-rose-500/10 text-rose-400" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                    {createError}
                  </div>
                )}

                <motion.button
                  whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
                  onClick={async () => {
                    setCreateError(null);
                    try {
                      await createGroup({ name: groupName.trim() || GROUP.name });
                      setShowCreate(false);
                      await membership.refresh();
                    } catch (err) {
                      console.error("[my-group] create failed:", err);
                      setCreateError("تعذّر إنشاء المجموعة. حاول مرة أخرى لاحقاً.");
                    }
                  }}
                  className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-colors"
                >
                  <UsersThree size={18} weight="fill" /> أنشئ المجموعة
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Join Group Modal */}
        <AnimatePresence>
          {showJoin && (
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
              <motion.div initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }} exit={{ scale:0.9, y:20 }}
                className={`w-full max-w-sm rounded-[2rem] p-6 border text-center ${isDark ? "bg-zinc-900 border-white/10" : "bg-white border-zinc-200 shadow-xl"}`}>
                <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center ${isDark ? "bg-white/5 border border-white/10" : "bg-zinc-50 border border-zinc-200"}`}>
                  <UsersThree size={32} weight="duotone" className={isDark ? "text-zinc-400" : "text-zinc-600"} />
                </div>
                <h2 className="text-xl font-bold mb-2">الانضمام لمجموعة</h2>
                <p className={`text-sm mb-6 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>أدخل كود الدعوة الذي وصلك من مدير المجموعة</p>
                
                <input 
                  autoFocus
                  placeholder="مثال: RHB-2026"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  className={`w-full text-center text-lg font-mono tracking-widest rounded-xl px-4 py-3 border outline-none mb-4 transition-colors ${isDark ? "bg-zinc-800 border-white/10 focus:border-royal/50 uppercase text-white" : "bg-zinc-50 border-zinc-200 focus:border-royal/50 uppercase text-zinc-900"}`}
                />
                
                {joinError && (
                  <div className={`mb-4 rounded-xl border px-4 py-2.5 text-xs ${isDark ? "border-rose-500/20 bg-rose-500/10 text-rose-400" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                    {joinError}
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setShowJoin(false)} className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${isDark ? "border-white/10 hover:bg-white/5" : "border-zinc-200 hover:bg-zinc-50"}`}>إلغاء</button>
                  <motion.button
                    whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
                    onClick={async () => {
                      setJoinError(null);
                      try {
                        await joinGroup(joinCode.trim());
                        setShowJoin(false);
                        await membership.refresh();
                      } catch (err) {
                        console.error("[my-group] join failed:", err);
                        setJoinError("تعذّر الانضمام بهذا الكود. تأكد من الكود وحاول مرة أخرى.");
                      }
                    }}
                    disabled={joinCode.length < 5}
                    className="flex-1 py-3 rounded-xl bg-royal text-white text-sm font-bold hover:bg-blue-600 transition-colors disabled:opacity-50"
                  >
                    انضمام
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const inviteLink = typeof window !== 'undefined' ? `${window.location.origin}/group/join/${inviteCode || ''}` : '';

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate/fetch the group's invite code, then reveal the invite banner.
  async function handleInvite() {
    setInviteError(null);
    const groupId = groupData?.group?.id;
    if (!groupId) return;
    setInviteLoading(true);
    try {
      const { inviteCode: code } = await inviteToGroup(groupId);
      if (code) setInviteCode(code);
      setShowInvite(true);
    } catch (err) {
      console.error("[my-group] invite failed:", err);
      setInviteError("تعذّر إنشاء رابط الدعوة. حاول مرة أخرى لاحقاً.");
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <div className={`p-6 md:p-10 space-y-6 max-w-5xl ${isDark ? "text-white" : "text-zinc-900"}`} dir="rtl">
      {/* ── Header ── */}
      <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={fadeUp} className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[1rem] bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center shadow-sm">
              <UsersThree size={24} className={isDark ? "text-emerald-400" : "text-emerald-600"} weight="duotone" />
            </div>
            <div>
              <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{activeGroup.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-mono ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{GROUP.plan}</span>
                <span className={`w-1 h-1 rounded-full ${isDark ? "bg-zinc-700" : "bg-zinc-300"}`} />
                <span className={`text-xs font-medium ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>{MEMBERS.length}/{GROUP.maxMembers} أعضاء</span>
                <span className={`w-1 h-1 rounded-full ${isDark ? "bg-zinc-700" : "bg-zinc-300"}`} />
                <span className="text-xs px-2 py-0.5 rounded-full bg-gold/10 border border-gold/20 text-gold font-medium">محامٍ متخصص</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button onClick={handleInvite} whileHover={{ scale:1.05 }} whileTap={{ scale:0.97 }} transition={sp}
              disabled={inviteLoading}
              className={`flex items-center gap-2 px-4 py-2 rounded-[1rem] border text-sm font-medium transition-colors disabled:opacity-60 ${isDark ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 shadow-sm"}`}>
              <UserPlus size={16} /> {inviteLoading ? "جارٍ…" : "دعوة عضو"}
            </motion.button>
            {inviteError && (
              <span className={`text-xs ${isDark ? "text-rose-400" : "text-rose-600"}`}>{inviteError}</span>
            )}
            <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.97 }} transition={sp}
              className={`w-9 h-9 rounded-[0.75rem] border flex items-center justify-center transition-colors ${isDark ? "border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10" : "border-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 shadow-sm"}`}>
              <Gear size={16} />
            </motion.button>
          </div>
        </motion.div>

        {/* ── Invite Banner ── */}
        <AnimatePresence>
          {showInvite && (
            <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }} exit={{ opacity:0, height:0 }}
              className={`${card} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-sm font-medium ${isDark ? "text-white" : "text-zinc-800"}`}>رابط دعوة المجموعة</p>
                <button onClick={() => setShowInvite(false)} className={`transition-colors ${isDark ? "text-zinc-500 hover:text-white" : "text-zinc-400 hover:text-zinc-800"}`}><X size={16} /></button>
              </div>
              <div className="flex gap-2">
                <div className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-mono truncate ${isDark ? "border-white/10 bg-white/5 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>{inviteLink}</div>
                <motion.button onClick={copyLink} whileTap={{ scale:0.95 }} transition={sp}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${isDark ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20" : "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100"}`}>
                  {copied ? <CheckCircle size={16} weight="fill" /> : <Copy size={16} />}
                  {copied ? "تم" : "نسخ"}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Billing & rotation — no backend yet, gated honestly ── */}
        <motion.div variants={fadeUp}>
          <DashboardComingSoon
            title="نظام التناوب والدفع الجماعي"
            description="إدارة دورة الدفع الشهرية بين أعضاء المجموعة غير متاحة حالياً. حالياً يمكنك إنشاء المجموعة ودعوة الأعضاء فقط — لا توجد فوترة فعلية بعد."
          />
        </motion.div>

        {/* ── Members List ── */}
        <motion.div variants={fadeUp} className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-zinc-900"}`}>أعضاء المجموعة</p>
            <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              <UsersThree size={13} />
              <span className={`font-mono font-semibold ${isDark ? "text-white" : "text-zinc-800"}`}>{MEMBERS.length}/{GROUP.maxMembers} أعضاء</span>
            </div>
          </div>

          {/* Members as a clean vertical list */}
          <div className="space-y-2">
            {MEMBERS.map((m, i) => {
              const isAdmin = m.role === "admin";
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity:0, x: 12 }} animate={{ opacity:1, x:0 }}
                  transition={{ ...sp, delay: i * 0.06 }}
                  className={`flex items-center gap-4 px-4 py-3 rounded-2xl border transition-colors ${isDark ? "border-white/8 bg-white/[0.025] hover:bg-white/[0.04]" : "border-zinc-200 bg-white hover:bg-zinc-50 shadow-sm"}`}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <Avatar initials={m.initials} size="md" isDark={isDark} />
                  </div>

                  {/* Name + role */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[15px] font-semibold leading-tight truncate ${isDark ? "text-white" : "text-zinc-900"}`}>{m.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {isAdmin ? (
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${isDark ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-600"}`}>
                          <Crown size={9} weight="fill" /> مدير
                        </span>
                      ) : (
                        <span className={`text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-500"}`}>عضو</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* Add member slot */}
            {MEMBERS.length < GROUP.maxMembers && (
              <motion.button
                initial={{ opacity:0, x:12 }} animate={{ opacity:1, x:0 }}
                transition={{ ...sp, delay: MEMBERS.length * 0.06 }}
                whileHover={{ scale:1.01 }} whileTap={{ scale:0.99 }}
                onClick={() => setShowInvite(true)}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl border border-dashed transition-colors group ${isDark ? "border-white/10 bg-transparent hover:border-white/20" : "border-zinc-300 bg-transparent hover:border-emerald-300 hover:bg-emerald-50/50"}`}
              >
                <div className={`w-11 h-11 rounded-full border border-dashed flex items-center justify-center transition-colors flex-shrink-0 ${isDark ? "border-white/10 text-zinc-500 group-hover:border-emerald-500/30 group-hover:text-emerald-400" : "border-zinc-300 text-zinc-400 group-hover:border-emerald-400 group-hover:text-emerald-500"}`}>
                  <Plus size={18} />
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${isDark ? "text-zinc-500 group-hover:text-zinc-300" : "text-zinc-600 group-hover:text-emerald-700"}`}>أضف عضواً جديداً</p>
                  <p className={`text-xs mt-0.5 ${isDark ? "text-zinc-600" : "text-zinc-500"}`}>متبقي {GROUP.maxMembers - MEMBERS.length} مقعد</p>
                </div>
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* Group Stats Row removed — quota/cost/consults were DEFAULT_GROUP
            constants (0/100, 99 ر.س, 1/شهر), not real group data. */}
      </motion.div>
    </div>
  );
}
