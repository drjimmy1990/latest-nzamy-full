"use client";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
// Ten more icons were imported here and used nowhere — CreditCard, Clock,
// Gavel, ShareNetwork, Bell, ArrowLeft, SealPercent, PaperPlaneTilt, Star and
// Confetti. They are the leftovers of the rotation/billing UI this page shed,
// and each one is a `import` cost on a client bundle for a control that does
// not exist.
import {
  UsersThree, Crown, CheckCircle, Warning, Plus, Repeat,
  UserPlus, ArrowClockwise, ChartBar, X, Copy,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useClientGroupMembership } from "@/hooks/useClientGroupMembership";
import { createGroup, joinGroup, inviteToGroup, getGroupState, getGroupMembers, getGroups } from "@/lib/services/groupService";
import {
  listOk,
  listFailed,
  listViewState,
  itemsOf,
  type ListRead,
} from "@/lib/services/listRead";
import { SkeletonCard } from "../_components/DashboardSkeleton";
import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

// ── Types ────────────────────────────────────────────────────────────────────
/**
 * A member row, reduced to the four fields this page actually renders.
 *
 * WHAT CAME OFF IT: `queriesUsed`, `queriesTotal`, `rotationIndex`,
 * `skippedTurns` and `status`. Every one was filled in by the mapper below
 * with a literal — `queriesUsed: 0`, `queriesTotal: 25`, `skippedTurns: 0` —
 * and none of the five has a column behind it: GET /api/v1/groups/[id]/members
 * returns id, user_id, role, joined_at, status and an embedded profile, and
 * nothing anywhere counts a member's queries. They were invisible today only
 * because the rotation UI that read them was gated behind DashboardComingSoon;
 * left in the shape, they are «٠ / ٢٥ استفسار» waiting to be re-rendered by
 * whoever ungates it. `RotationEntry` went with them — it had no producer and
 * no consumer at all.
 */
interface Member {
  id: string;
  name: string;
  initials: string;
  role: "admin" | "member";
}

/**
 * The name a new group is created with when the client leaves the field blank.
 *
 * This is the ONE survivor of the `DEFAULT_GROUP` literal that used to sit
 * here, and it survives because it is a value being SENT, not a fact being
 * displayed: `createGroup` writes it to `groups.name`. Everything else in that
 * object was a display fallback — a plan «الربع القانونية», «٤٩٩ ر.س» total,
 * «٩٩ ر.س» per head, «١/شهر» lawyer consultations, a five-seat cap and a
 * «١٠٠» query quota — and a page that could not read a group rendered every
 * one of them as that group's own terms. There is no billing backend to price
 * anything (the card below says so in the client's own language), and the seat
 * cap is a real column that is now read from the row instead of assumed.
 */
const NEW_GROUP_FALLBACK_NAME = "الربع القانونية";

// ── Helpers ──────────────────────────────────────────────────────────────────
// A module-level `card` string stood here, shadowed by a theme-aware `card` in
// both components below and therefore read by nothing.
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
  // «حجم المجموعة» used to be a <select> with no value and no onChange, so the
  // answer never left the modal and createGroup() always fell back to the API
  // default of 10. `groups.max_members` is a real column
  // (20260603_phase1_004_community_features.sql:138) and POST /api/v1/groups
  // already accepts it — the picker just was not wired to anything.
  const [maxMembers, setMaxMembers] = useState(5);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string>("");

  // ── The group, in the three states a read has ──────────────────────────────
  //
  // `groupUnreadable` is the one this page did not have. `getGroupState()` now
  // THROWS in supabase mode instead of answering a failed request with this
  // browser's last known group (groupService.ts), and the `.catch(() =>
  // setGroupData(null))` that stood here turned that throw straight back into
  // «لا توجد مجموعة» — the same false statement one layer up.
  //
  // BEWARE OF ONE MORE LAYER ABOVE THIS ONE, which is not fixed here because
  // it is not this change's file: useClientGroupMembership swallows the same
  // throw back to `readClientGroupState()` (src/hooks/useClientGroupMembership.ts:26),
  // so `hasGroup` can still be true purely because this browser once joined a
  // group — under another account, or before being removed from it. That is
  // reported as a follow-up. What this page can guarantee is that it never
  // DRAWS a group out of local defaults: every figure below comes from the row
  // or is withheld.
  const [groupUnreadable, setGroupUnreadable] = useState(false);
  /**
   * The group's own row-derived facts, or null for "the server says this
   * account is in no group". `capacity` is `groups.max_members`, read from the
   * row rather than assumed to be five; null when the groups list could not be
   * read, and then no seat arithmetic is printed at all.
   */
  const [groupInfo, setGroupInfo] = useState<
    { id: string; name: string; capacity: number | null } | null
  >(null);
  const [membersRead, setMembersRead] = useState<ListRead<Member> | null>(null);
  const [loading, setLoading] = useState(true);
  /** Bumped by «إعادة المحاولة»; the loader below refetches when it changes. */
  const [attempt, setAttempt] = useState(0);

  // The pricing page's «ابدأ مجموعتك» CTA links to /dashboard/client/my-group
  // ?action=create. `searchParams` was read on line 126 and then used by
  // nothing at all, so that button landed on the overview and the visitor had
  // to hunt for «أنشئ مجموعة» themselves. Guarded on !hasGroup: someone who is
  // already in a group must not be shown a create dialogue over their own
  // group's page.
  useEffect(() => {
    if (searchParams.get("action") === "create" && !hasGroup) setShowCreate(true);
  }, [searchParams, hasGroup]);

  useEffect(() => {
    if (!hasGroup) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const state = await getGroupState();
        if (cancelled) return;
        if (state.status === "none") {
          setGroupInfo(null);
          setMembersRead(null);
          return;
        }
        const groupId = state.groupId ?? "";
        if (!groupId) {
          // The membership is known and the group is not. Nothing can be read
          // about it, so nothing is claimed about it either.
          setGroupInfo({ id: "", name: state.groupName ?? "", capacity: null });
          setMembersRead(listFailed<Member>());
          return;
        }
        // Members and the group row (for its join_code and its real
        // max_members) in parallel. Each carries its own outcome now, so the
        // `catch { /* keep empty */ }` that used to wrap both — and rendered a
        // roster that could not be read as a group with no members — is gone
        // rather than merely narrowed.
        const [apiMembers, groups] = await Promise.all([
          getGroupMembers(groupId),
          getGroups(),
        ]);
        if (cancelled) return;
        const matched = groups.ok ? groups.items.find((g) => g.id === groupId) ?? null : null;
        setInviteCode(matched?.join_code ?? "");
        setGroupInfo({
          id: groupId,
          // The row's own name first, then the membership state's. Neither is
          // invented: what is gone is the third fallback, DEFAULT_GROUP.name,
          // which printed «الربع القانونية» as the name of a group nobody had
          // named that.
          name: matched?.name || state.groupName || "",
          capacity: typeof matched?.max_members === "number" ? matched.max_members : null,
        });
        setMembersRead(
          apiMembers.ok
            ? listOk(
                apiMembers.items.map((m) => ({
                  id: m.user_id,
                  name: m.profile?.display_name || m.user_id,
                  initials: (m.profile?.display_name || "--").slice(0, 2),
                  role: m.role === "owner" ? ("admin" as const) : ("member" as const),
                })),
              )
            : listFailed<Member>(),
        );
      } catch (err) {
        if (cancelled) return;
        console.error("[my-group] group state read failed:", err);
        setGroupUnreadable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hasGroup, attempt]);

  const retry = useCallback(() => {
    setLoading(true);
    setGroupUnreadable(false);
    setGroupInfo(null);
    setMembersRead(null);
    setAttempt((n) => n + 1);
  }, []);

  // Rotation/payer/billing derivations removed — there is no rotation or billing
  // backend, so those values were pure array-index fiction rendered to real
  // users as "money owed". The billing/rotation UI is gated behind
  // DashboardComingSoon below; only the real membership features remain.
  const membersView = listViewState(loading, membersRead);
  const MEMBERS = itemsOf(membersRead);
  const capacity = groupInfo?.capacity ?? null;
  // `displayGroupName`, not `groupName` — that name belongs to the create
  // modal's input state a few lines above.
  const displayGroupName = groupInfo?.name || membership.groupName || "";
  /**
   * «٣ من ٥ أعضاء», «٣ أعضاء», or null.
   *
   * NULL IS A REAL ANSWER HERE and it is the point of the function. This line
   * used to be `{MEMBERS.length}/{GROUP.maxMembers} أعضاء`, printed in two
   * places, with `maxMembers` coming from a local literal — so a group whose
   * roster could not be read announced «٠/٥ أعضاء»: a membership count of zero
   * and a five-seat plan, neither of which anything had said. The seat half is
   * dropped when the group row could not be read, and the whole line is dropped
   * when the roster could not be.
   */
  const membersLabel = membersView === "ready" || membersView === "empty"
    ? (capacity === null
        ? `${MEMBERS.length.toLocaleString("ar-SA")} أعضاء`
        : `${MEMBERS.length.toLocaleString("ar-SA")}/${capacity.toLocaleString("ar-SA")} أعضاء`)
    : null;
  /**
   * Whether there is provably room for one more member.
   *
   * BOTH halves have to be known. The «أضف عضواً جديداً» slot used to appear
   * whenever `MEMBERS.length < GROUP.maxMembers`, which on an unreadable roster
   * is `0 < 5` — so a full group was offered another seat, and told how many
   * were «متبقي».
   */
  const seatsLeft = (membersView === "ready" || membersView === "empty") && capacity !== null
    ? Math.max(0, capacity - MEMBERS.length)
    : null;

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

  // The membership itself could not be read. NOT the create/join screen below:
  // that screen states «ليست لديك مجموعة» in everything but words — it opens
  // with «أنشئ مجموعة جديدة» — and a client who is in a group would be invited
  // to start a second one.
  if (groupUnreadable) {
    return (
      <div className={`p-6 md:p-10 min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center ${isDark ? "text-white" : "text-zinc-900"}`} dir="rtl">
        <div className={`w-16 h-16 rounded-[1.25rem] flex items-center justify-center ${isDark ? "bg-white/5 border border-white/10" : "bg-rose-50 border border-rose-100"}`}>
          <Warning size={30} weight="duotone" className={isDark ? "text-rose-400" : "text-rose-600"} />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold">تعذّرت قراءة بيانات مجموعتك</h1>
          <p className={`text-sm max-w-sm ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            لم نتمكن من قراءة عضويتك من الخادم، ولا يمكننا تأكيد ما إذا كنت ضمن مجموعة.
          </p>
        </div>
        <motion.button onClick={retry} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={sp}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-[1rem] border text-sm font-bold transition-colors ${isDark ? "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 shadow-sm"}`}>
          <ArrowClockwise size={16} weight="bold" />
          إعادة المحاولة
        </motion.button>
      </div>
    );
  }

  // `!groupInfo` covers BOTH "this account is in no group" answers: the hook's
  // (`hasGroup === false`) and the server's (`getGroupState()` returned
  // `status: "none"` while the hook's cached localStorage state still said
  // otherwise). The server's answer wins, which is what stops a stale browser
  // from rendering a group page for a membership that has ended.
  if (!groupInfo) {
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
                    {/* The discount percentages that used to label these four
                        options — «خصم ٣٠٪», «٢٥٪», «٢٠٪», «١٥٪» — are gone.
                        Nothing in this platform can apply a discount: no
                        payment provider is connected and the note directly
                        below this field already says the billing and rotation
                        system is not active. A percentage off a charge that
                        cannot be made is a price quoted for a transaction that
                        cannot happen. The SIZE is real and is now saved. */}
                    <select
                      value={maxMembers}
                      onChange={(e) => setMaxMembers(Number(e.target.value))}
                      className={`w-full rounded-xl px-4 py-3 border outline-none appearance-none ${isDark ? "bg-zinc-800 border-white/10" : "bg-zinc-50 border-zinc-200"}`}
                    >
                      <option value={5}>٥ أشخاص</option>
                      <option value={4}>٤ أشخاص</option>
                      <option value={3}>٣ أشخاص</option>
                      <option value={2}>شخصان</option>
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
                      await createGroup({ name: groupName.trim() || NEW_GROUP_FALLBACK_NAME, max_members: maxMembers });
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
    const groupId = groupInfo?.id;
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
              {/* The group's own name, or the section's. «الربع القانونية» —
                  the DEFAULT_GROUP literal that used to be the last fallback
                  here — is a plan on /pricing, not the name of this client's
                  group, and printing it as an <h1> named a group nobody named. */}
              <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
                {displayGroupName || "مجموعتي"}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                {/* TWO CLAIMS CAME OFF THIS LINE.
                    «{GROUP.plan}» was DEFAULT_GROUP.plan, the literal string
                    «الربع القانونية», printed as this group's subscription
                    plan — `groups` has no plan column and nothing in this
                    platform grants one.
                    «محامٍ متخصص» was an unconditional gold badge asserting a
                    specialist lawyer is attached to the group. No column, no
                    route and no assignment exists for that either.
                    What is left is the membership line, which is read off the
                    roster and the row's own max_members — and is dropped
                    entirely when either could not be read. */}
                {membersLabel ? (
                  <span className={`text-xs font-medium ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>{membersLabel}</span>
                ) : (
                  <span className={`text-xs font-medium ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>تعذّرت قراءة الأعضاء</span>
                )}
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
            {/* A settings gear with no onClick used to sit here. There are no
                group settings to open — nothing in groupService edits a group
                after creation — so the control is gone rather than left
                inviting a press that does nothing. */}
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
              {/* NO LINK WITHOUT A CODE. `inviteLink` was built as
                  `${origin}/group/join/${inviteCode || ''}`, so whenever the
                  join_code had not been read — which is every time getGroups()
                  failed, and every time this banner was opened from the «أضف
                  عضواً جديداً» slot rather than from «دعوة عضو» — the box
                  displayed a URL ending in a slash and «نسخ» copied it. A
                  client would have sent that to a relative. */}
              {inviteCode ? (
                <div className="flex gap-2">
                  <div className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-mono truncate ${isDark ? "border-white/10 bg-white/5 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>{inviteLink}</div>
                  <motion.button onClick={copyLink} whileTap={{ scale:0.95 }} transition={sp}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${isDark ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20" : "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100"}`}>
                    {copied ? <CheckCircle size={16} weight="fill" /> : <Copy size={16} />}
                    {copied ? "تم" : "نسخ"}
                  </motion.button>
                </div>
              ) : (
                <p className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  لم نتمكن من قراءة كود الدعوة. اضغط «دعوة عضو» أعلاه لإنشائه.
                </p>
              )}
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
            {/* «—», not «٠/٥», when the roster could not be read. A rendered
                zero is the same claim as a rendered 42 — and here it would be
                a claim that a group with members has none. */}
            <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              <UsersThree size={13} />
              <span className={`font-mono font-semibold ${isDark ? "text-white" : "text-zinc-800"}`}>
                {membersLabel ?? "—"}
              </span>
            </div>
          </div>

          {/* The roster itself could not be read. Never an empty list here: a
              group always has at least the member reading this page, so «لا
              يوجد أعضاء» would be false on its face — and the list simply
              rendering nothing is the silent version of the same thing. */}
          {membersView === "unreadable" && (
            <div className={`${card} flex flex-col items-start gap-3 p-4`}>
              <p className={`flex items-center gap-2 text-[13px] font-medium ${isDark ? "text-rose-400" : "text-rose-600"}`}>
                <Warning size={16} weight="fill" className="flex-shrink-0" />
                تعذّرت قراءة قائمة أعضاء المجموعة.
              </p>
              <motion.button onClick={retry} whileTap={{ scale: 0.97 }} transition={sp}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${isDark ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}>
                <ArrowClockwise size={13} weight="bold" />
                إعادة المحاولة
              </motion.button>
            </div>
          )}

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

            {/* Add member slot — offered only when BOTH the roster and the
                group's own max_members were read, and there is provably a seat
                left. The gate used to be `MEMBERS.length < GROUP.maxMembers`,
                which on an unreadable roster reads `0 < 5` off a local literal:
                a full group was invited to add a sixth member and told «متبقي ٥
                مقعد».

                The press now runs handleInvite() rather than opening the banner
                directly, because opening it directly is how the banner came up
                with no join_code in it. */}
            {seatsLeft !== null && seatsLeft > 0 && (
              <motion.button
                initial={{ opacity:0, x:12 }} animate={{ opacity:1, x:0 }}
                transition={{ ...sp, delay: MEMBERS.length * 0.06 }}
                whileHover={{ scale:1.01 }} whileTap={{ scale:0.99 }}
                disabled={inviteLoading}
                onClick={() => { void handleInvite(); }}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl border border-dashed transition-colors group ${isDark ? "border-white/10 bg-transparent hover:border-white/20" : "border-zinc-300 bg-transparent hover:border-emerald-300 hover:bg-emerald-50/50"}`}
              >
                <div className={`w-11 h-11 rounded-full border border-dashed flex items-center justify-center transition-colors flex-shrink-0 ${isDark ? "border-white/10 text-zinc-500 group-hover:border-emerald-500/30 group-hover:text-emerald-400" : "border-zinc-300 text-zinc-400 group-hover:border-emerald-400 group-hover:text-emerald-500"}`}>
                  <Plus size={18} />
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${isDark ? "text-zinc-500 group-hover:text-zinc-300" : "text-zinc-600 group-hover:text-emerald-700"}`}>أضف عضواً جديداً</p>
                  <p className={`text-xs mt-0.5 ${isDark ? "text-zinc-600" : "text-zinc-500"}`}>متبقي {seatsLeft.toLocaleString("ar-SA")} مقعد</p>
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
