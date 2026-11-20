"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUp, ArrowDown, CheckCircle, ChatCircle, SealCheck,
  ArrowRight, Eye, Share, BookmarkSimple,
  PencilSimple, Crown, Warning, Scales, Plus, SpinnerGap, ArrowClockwise, PushPin,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import {
  type StoredCommunityQuestion,
  getCommunityPost,
  addCommunityAnswer,
  voteCommunityPost,
  setCommunityPostSaved,
  setCommunityBestAnswer,
} from "@/lib/services/communityService";
import { mapCommunityAnswer, type CommunityAnswerLike } from "@/lib/services/communityAnswerMap";
import { mapCommunityPost, type CommunityPostLike } from "@/lib/services/communityPostMap";
import { displayWhen } from "../_feedView";
import ReportContentButton from "@/components/community/ReportContentButton";
import Link from "next/link";
import { isDemoMode } from "@/lib/runtimeMode";
import { isSupabaseMode } from "@/lib/services/api";
import { shareOrCopyLink } from "@/lib/community/shareLink";
import { REVIEW_PENDING_AR, REVIEW_REJECTED_AR, VERIFIED_OFFICE_AR, postedNoticeAr } from "@/lib/community/review";
import { useParams } from "next/navigation";

// ─── Types ─────────────────────────────────────────────────────────────────
interface Reply {
  id: number | string;
  author: string; authorEn: string;
  type: "lawyer" | "user" | "guest";
  lawyerSlug?: string; lawyerSpecialty?: string; lawyerSpecialtyEn?: string;
  rating?: number;
  text: string; textEn: string;
  date: string; dateEn: string;
  likes: number; isVerified?: boolean;
  isBest?: boolean;
  /** The reader's own vote on this answer, from the server (0 = none). */
  myVote: -1 | 0 | 1;
  /** Owner ٤٢: «مكتب موثّق». */
  isVerifiedOffice?: boolean;
  /** Owner ٤٢: the reader's own answer under review / rejected. */
  reviewState?: "pending" | "rejected" | null;
  reviewNote?: string | null;
}

/** Reader state the detail route adds to the post (posts/[id]/route.ts). */
interface ViewerFields {
  myVote?: number;
  saved?: boolean;
  isMine?: boolean;
  accepted_answer_id?: string | null;
  /** Owner ٤٢: this question is the reader's own, still under review or rejected. */
  reviewState?: "pending" | "rejected" | null;
  review_note?: string | null;
}

const asVote = (v: unknown): -1 | 0 | 1 => (v === 1 ? 1 : v === -1 ? -1 : 0);

// No mock question or replies here any more. A 404 or a failed read used to
// render a hardcoded labour question with four invented answers (two named
// lawyers with ratings) as if it were the post the visitor had opened —
// including every guest, whom the detail route answered with a 401. The page
// now says what happened instead: not found, or could not be read.

const CATEGORY_LABELS: Record<string, string> = {
  labor: "عمالي",
  commercial: "تجاري",
  civil: "مدني",
  criminal: "جنائي",
  family: "أحوال شخصية",
  "real-estate": "عقاري",
};

/**
 * Item 147 (question half). `question` is typed as the demo-mode
 * `StoredCommunityQuestion`, but in supabase mode it is actually a raw
 * `community_posts` row (real column names — see communityPostMap.ts's own
 * header). Both shapes go through `mapCommunityPost`, which reads whichever
 * fields are present instead of assuming the demo shape and crashing on a
 * real one (the owner's `asker.includes(...)` crash).
 */
function mapStoredQuestion(question: StoredCommunityQuestion) {
  const tag = CATEGORY_LABELS[question.category] ?? "قانوني";
  const mapped = mapCommunityPost(question as unknown as CommunityPostLike);
  return {
    id: question.id,
    category: question.category,
    tag,
    tagEn: tag,
    title: question.title,
    titleEn: question.title,
    body: question.body ?? "لم يضف صاحب السؤال تفاصيل إضافية.",
    bodyEn: question.body ?? "No additional details were provided.",
    asker: mapped.asker,
    askerType: mapped.askerType,
    isAnon: mapped.isAnon,
    views: mapped.views,
    votes: mapped.votes,
    // A real row's `created_at` is an ISO string; print it as a date.
    ago: displayWhen(mapped.ago),
    agoEn: displayWhen(mapped.ago),
    tags: question.tags?.length ? question.tags : [tag],
  };
}

/**
 * Item 147. `answer` is typed as the demo-mode `StoredCommunityAnswer`, but
 * in supabase mode it is actually a raw `community_answers` row (real column
 * names, plus `lawyerSlug` — see the route's own note). Both shapes go
 * through `mapCommunityAnswer`, which reads whichever fields are present and
 * — the point of this item — takes `type`/`isVerified` from the server
 * column `is_lawyer_verified` whenever the row carries one, never from a
 * client-sent `authorType`.
 */
function mapStoredReply(
  answer: StoredCommunityQuestion["answers"][number],
  acceptedAnswerId?: string | number | null,
): Reply {
  const mapped = mapCommunityAnswer(answer as unknown as CommunityAnswerLike, acceptedAnswerId);
  return {
    id: answer.id,
    type: mapped.type,
    author: mapped.author,
    authorEn: mapped.author,
    lawyerSlug: mapped.lawyerSlug,
    text: mapped.text,
    textEn: mapped.text,
    date: displayWhen(mapped.date),
    dateEn: displayWhen(mapped.date),
    likes: mapped.likes,
    isVerified: mapped.isVerified,
    isBest: mapped.isBest,
    rating: mapped.rating,
    myVote: asVote((answer as unknown as { myVote?: unknown }).myVote),
    isVerifiedOffice: mapped.isVerifiedOffice,
    reviewState: mapped.reviewState,
    reviewNote: mapped.reviewNote,
  };
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function QuestionDetailPage() {
  const { isRTL, isDark } = useTheme();
  const params = useParams<{ id: string }>();
  const user = useUser();
  const [votes, setVotes] = useState(0);
  const [userVote, setUserVote] = useState<"up" | "down" | null>(null);
  const [saved, setSaved] = useState(false);
  const [isMine, setIsMine] = useState(false);
  // Owner ٤٢: the reader's own question, still under review or rejected.
  const [questionReview, setQuestionReview] = useState<{ state: "pending" | "rejected"; note: string | null } | null>(null);
  // The question's best answer (accepted_answer_id). `undefined` in demo mode,
  // where each demo answer carries its own `isAccepted`.
  const [bestId, setBestId] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; login?: boolean } | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareDone, setShareDone] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isAnon, setIsAnon] = useState(false);
  const [replies, setReplies] = useState<Reply[]>([]);
  // The server's answer to this reader's last vote on an answer.
  const [replyVotes, setReplyVotes] = useState<Record<string, { myVote: -1 | 0 | 1; votes: number }>>({});
  const [storedQuestion, setStoredQuestion] = useState<StoredCommunityQuestion | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [loadSeq, setLoadSeq] = useState(0);
  const [posting, setPosting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const loadQuestion = async () => {
      // A real community_posts id is a uuid (community_posts.id uuid primary
      // key, 20260603_phase1_004_community_features.sql:34) — `Number(id)`
      // on one is always `NaN`, so this used to bail out before ever
      // fetching and every real post silently rendered the mock REPLIES.
      // Demo-mode ids stay numeric (communityStore's `Date.now()`) and
      // `getCommunityPost` already accepts either as `number | string`.
      const id = params?.id;
      if (!id) { setLoadState("missing"); setMounted(true); return; }
      setLoadState("loading");
      try {
        const savedQuestion = await getCommunityPost(id);
        setStoredQuestion(savedQuestion);
        if (savedQuestion) {
          // `accepted_answer_id` lives on the post, not on `StoredCommunityQuestion`
          // (a supabase-mode-only field the wire carries but the demo type
          // doesn't declare) — see mapCommunityAnswer's isBest fallback.
          const acceptedAnswerId = (savedQuestion as unknown as { accepted_answer_id?: string | null })
            .accepted_answer_id;
          // Same real-row-has-no-`votes`-field gap `mapStoredQuestion` fixes
          // below — read it through the same mapper so the vote counter and
          // `handleVote`'s arithmetic don't seed themselves from `undefined`.
          setVotes(mapCommunityPost(savedQuestion as unknown as CommunityPostLike).votes);
          setReplies((savedQuestion.answers ?? []).map((a) => mapStoredReply(a, acceptedAnswerId)));
          // Reader state (supabase mode): own vote, saved, «am I the asker».
          const viewer = savedQuestion as unknown as ViewerFields;
          const mine = asVote(viewer.myVote);
          setUserVote(mine === 1 ? "up" : mine === -1 ? "down" : null);
          setSaved(viewer.saved === true);
          setIsMine(isSupabaseMode && viewer.isMine === true);
          setQuestionReview(
            viewer.reviewState === "pending" || viewer.reviewState === "rejected"
              ? { state: viewer.reviewState, note: typeof viewer.review_note === "string" ? viewer.review_note : null }
              : null,
          );
          setBestId(isSupabaseMode ? (typeof acceptedAnswerId === "string" ? acceptedAnswerId : null) : undefined);
          setReplyVotes({});
          setLoadState("ready");
        } else {
          // The server said 404 — the question is not there (or not visible to
          // this reader). Nothing is put on screen in its place.
          setLoadState("missing");
        }
      } catch {
        // A read that did not happen is not a missing question — say so.
        setLoadState("error");
      }
      setMounted(true);
    };
    loadQuestion();
  }, [params?.id, loadSeq]);
  if (!mounted) return null;

  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;

  const isGuest = !user.isLoggedIn;

  if (loadState !== "ready" || !storedQuestion) {
    const missing = loadState === "missing";
    return (
      <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir="rtl">
        <Navbar />
        <div className="flex-1 max-w-3xl mx-auto w-full px-4 pt-32 pb-10">
          <div className={`${card} p-10 text-center flex flex-col items-center`}>
            {loadState === "loading" ? (
              <>
                <SpinnerGap size={32} className="animate-spin text-[#C8A762] mb-4" />
                <p className={`text-sm ${muted}`}>جارٍ تحميل السؤال…</p>
              </>
            ) : (
              <>
                {missing
                  ? <Scales size={40} color="#C8A762" weight="duotone" className="mb-4" />
                  : <Warning size={40} weight="fill" className="text-amber-500 mb-4" />}
                <p className={`text-lg font-black mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  {missing ? "هذا السؤال غير موجود" : "تعذّرت قراءة السؤال"}
                </p>
                <p className={`text-sm mb-6 max-w-md ${muted}`}>
                  {missing
                    ? "قد يكون حُذف، أو أنه غير متاح لحسابك."
                    : "لم نتمكّن من تحميل السؤال الآن — هذا لا يعني أنه غير موجود."}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {!missing && (
                    <button
                      type="button"
                      onClick={() => setLoadSeq((n) => n + 1)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl hover:bg-[#0a3328] transition"
                    >
                      <ArrowClockwise size={14} weight="bold" /> إعادة المحاولة
                    </button>
                  )}
                  <Link href="/community" className={`px-5 py-2.5 rounded-xl text-sm font-semibold border ${isDark ? "border-[#2d3748] text-gray-300" : "border-gray-200 text-gray-600"}`}>
                    العودة إلى المجتمع
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const question = mapStoredQuestion(storedQuestion);
  const postId = String(params?.id ?? question.id);

  // «أفضل إجابة» (N05-C7): in supabase mode the post's accepted_answer_id
  // decides; demo answers carry their own flag.
  const isBestReply = (r: Reply) => (bestId === undefined ? r.isBest === true : bestId !== null && String(r.id) === bestId);
  const replyVoteCount = (r: Reply) => replyVotes[String(r.id)]?.votes ?? r.likes;
  const replyMyVote = (r: Reply) => replyVotes[String(r.id)]?.myVote ?? r.myVote;

  // The best answer is pinned above both sections; the rest split: محامون أولاً ثم أفراد
  const bestReply = replies.find(isBestReply) ?? null;
  const lawyerReplies = replies
    .filter(r => r.type === "lawyer" && r !== bestReply)
    .sort((a, b) => replyVoteCount(b) - replyVoteCount(a));
  const userReplies = replies.filter(r => r.type !== "lawyer" && r !== bestReply);
  const lawyerAnswerCount = replies.filter(r => r.type === "lawyer").length;

  const signInNotice = (text: string) => setNotice({ text, login: true });
  const loginHref = `/login?from=${encodeURIComponent(`/community/${postId}`)}`;

  /**
   * Votes are saved on the server (N05-C4): one per member per question or
   * answer; the same arrow again takes it back. The number shown is the one
   * the server returns. Demo mode keeps its local toggle (no persistence).
   */
  const handleVote = async (dir: "up" | "down") => {
    if (!isSupabaseMode) {
      if (userVote === dir) { setVotes(question.votes); setUserVote(null); return; }
      setVotes(question.votes + (dir === "up" ? 1 : -1));
      setUserVote(dir);
      return;
    }
    if (isGuest) { signInNotice("سجّل الدخول للتصويت — يُحفظ صوت واحد لكل عضو."); return; }
    if (busy) return;
    setBusy("vote:post");
    setNotice(null);
    try {
      const result = await voteCommunityPost(postId, "post", postId, userVote === dir ? 0 : dir === "up" ? 1 : -1);
      if (result) {
        setVotes(result.votes);
        setUserVote(result.myVote === 1 ? "up" : result.myVote === -1 ? "down" : null);
      }
    } catch (err) {
      setNotice({ text: err instanceof Error && err.message ? err.message : "تعذّر حفظ تصويتك — لم يُحتسب." });
    } finally {
      setBusy(null);
    }
  };

  const handleReplyVote = async (reply: Reply, dir: "up" | "down") => {
    if (!isSupabaseMode) return;
    if (isGuest) { signInNotice("سجّل الدخول للتصويت على الإجابات."); return; }
    if (busy) return;
    const current = replyMyVote(reply);
    const next: 1 | -1 | 0 = (dir === "up" && current === 1) || (dir === "down" && current === -1) ? 0 : dir === "up" ? 1 : -1;
    setBusy(`vote:${reply.id}`);
    setNotice(null);
    try {
      const result = await voteCommunityPost(postId, "answer", String(reply.id), next);
      if (result) setReplyVotes(prev => ({ ...prev, [String(reply.id)]: result }));
    } catch (err) {
      setNotice({ text: err instanceof Error && err.message ? err.message : "تعذّر حفظ تصويتك — لم يُحتسب." });
    } finally {
      setBusy(null);
    }
  };

  /** «حفظ» (N05-C5): saved on the server, listed at /community/me. */
  const handleSave = async () => {
    if (!isSupabaseMode) { setNotice({ text: "الحفظ غير متاح في وضع العرض التجريبي." }); return; }
    if (isGuest) { signInNotice("سجّل الدخول لحفظ السؤال والرجوع إليه لاحقاً."); return; }
    if (busy) return;
    setBusy("save");
    setNotice(null);
    try {
      setSaved(await setCommunityPostSaved(postId, !saved));
    } catch (err) {
      setNotice({ text: err instanceof Error && err.message ? err.message : "تعذّر الحفظ — لم يتغيّر شيء." });
    } finally {
      setBusy(null);
    }
  };

  /** «مشاركة» (N05-C6): the system share sheet when there is one, else copy the link. */
  const handleShare = async () => {
    setShareDone(false);
    setShareLink(null);
    const url = `${window.location.origin}/community/${encodeURIComponent(postId)}`;
    const outcome = await shareOrCopyLink(url, question.title);
    if (outcome === "copied") setShareDone(true);
    else if (outcome === "manual") setShareLink(url);
  };

  /** «أفضل إجابة» (N05-C7): the asker only — the database checks it again. */
  const handleBest = async (reply: Reply | null) => {
    if (!isMine || busy) return;
    setBusy("best");
    setNotice(null);
    try {
      setBestId(await setCommunityBestAnswer(postId, reply ? String(reply.id) : null));
    } catch (err) {
      setNotice({ text: err instanceof Error && err.message ? err.message : "تعذّر حفظ أفضل إجابة." });
    } finally {
      setBusy(null);
    }
  };

  /**
   * Only a reply the server confirmed is shown. The old catch («Fallback:
   * still add locally») put the text on screen as posted when nothing had
   * been saved — a guest's 401, a refused phone number, a dropped request.
   */
  const handleSubmitReply = async () => {
    if (replyText.trim().length < 10 || posting) return;
    const author = isAnon ? "مستخدم مجهول" : user.name || "أنت";
    setPosting(true);
    setReplyError(null);
    try {
      const savedAnswer = await addCommunityAnswer(storedQuestion.id, {
        author,
        authorType: user.userType === "lawyer" ? "lawyer" : "user",
        authorRating: user.userType === "lawyer" ? 1 : 0,
        content: replyText,
      });
      const reply = mapStoredReply(savedAnswer);
      setReplies(prev => [...prev, reply]);
      setReplyText("");
      // Owner ٤٢: say plainly when the answer waits for review. S5-3: and
      // what the server hid from it (phone, e-mail, ID…) before storing it.
      const notices = [
        reply.reviewState === "pending" ? postedNoticeAr("answer", true) : null,
        savedAnswer.maskedNotice ?? null,
      ].filter((t): t is string => !!t);
      if (notices.length > 0) setNotice({ text: notices.join(" ") });
    } catch (err) {
      setReplyError(err instanceof Error && err.message ? err.message : "تعذّر نشر تعليقك — لم يُحفظ.");
    } finally {
      setPosting(false);
    }
  };

  // ── Reply Card (shared renderer) ──
  const ReplyCard = ({ reply }: { reply: Reply }) => {
    const isLawyer = reply.type === "lawyer";
    const isBest = isBestReply(reply);
    const voteCount = replyVoteCount(reply);
    const myVote = replyMyVote(reply);

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border p-5 ${
          isBest
            ? isDark ? "bg-emerald-900/15 border-emerald-700/40" : "bg-emerald-50/80 border-emerald-300/70"
            : isLawyer
            ? isDark ? "bg-[#0B3D2E]/20 border-[#0B3D2E]/50" : "bg-[#0B3D2E]/5 border-[#0B3D2E]/30"
            : isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"
        }`}
      >
        {/* Best Answer badge */}
        {isBest && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-3">
            <CheckCircle size={14} weight="fill" />
            {isRTL ? "أفضل إجابة — اختارها صاحب السؤال" : "Best Answer — chosen by the asker"}
          </div>
        )}

        {/* Author row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${isLawyer ? "bg-[#0B3D2E] text-white" : isDark ? "bg-white/10 text-gray-300" : "bg-gray-200 text-gray-600"}`}>
              {((isRTL ? reply.author : reply.authorEn) || "؟").charAt(0)}
            </div>
            <div>
              {isLawyer ? (
                // Owner ٤٢ (18 Nov 2026): names are hidden — the writer's name
                // and profile link are not sent; the badge says what he is.
                <div>
                  <p className={`text-sm font-bold flex flex-wrap items-center gap-1.5 ${isDark ? "text-zinc-100" : "text-gray-800"}`}>
                    {isRTL ? reply.author : reply.authorEn}
                    <SealCheck size={14} color="#C8A762" weight="fill" />
                    <span className="text-xs font-normal px-1.5 py-0.5 rounded-full bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#C8A762]/10 dark:text-[#C8A762]">
                      {isRTL ? "محامٍ موثّق" : "Verified lawyer"}
                    </span>
                    {reply.isVerifiedOffice && (
                      <span className="text-xs font-normal px-1.5 py-0.5 rounded-full bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#C8A762]/10 dark:text-[#C8A762]">
                        {VERIFIED_OFFICE_AR}
                      </span>
                    )}
                  </p>
                  <p className={`text-xs ${muted}`}>{isRTL ? reply.date : reply.dateEn}</p>
                </div>
              ) : (
                <div>
                  <p className={`text-sm font-semibold ${isDark ? "text-zinc-200" : "text-gray-700"}`}>
                    {isRTL ? reply.author : reply.authorEn}
                    {reply.type === "guest" && (
                      <span className={`ms-2 text-xs font-normal ${muted}`}>{isRTL ? "(زائر)" : "(Guest)"}</span>
                    )}
                    {reply.isVerifiedOffice && (
                      <span className="ms-2 text-xs font-normal px-1.5 py-0.5 rounded-full bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#C8A762]/10 dark:text-[#C8A762]">
                        {VERIFIED_OFFICE_AR}
                      </span>
                    )}
                  </p>
                  <p className={`text-xs ${muted}`}>{isRTL ? reply.date : reply.dateEn}</p>
                </div>
              )}
            </div>
          </div>

          {/* Votes (saved on the server) + Report */}
          <div className="flex items-center gap-1.5">
            <div className={`flex items-center gap-0.5 rounded-xl border px-1 py-0.5 ${isDark ? "border-[#2d3748]" : "border-gray-200"}`}>
              <button
                onClick={() => { void handleReplyVote(reply, "up"); }}
                disabled={!isSupabaseMode || busy === `vote:${reply.id}`}
                aria-label={isRTL ? "تصويت مؤيد للإجابة" : "Upvote answer"}
                aria-pressed={myVote === 1}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition disabled:opacity-50 ${myVote === 1 ? "bg-[#0B3D2E] text-white" : isDark ? "text-gray-400 hover:bg-white/5" : "text-gray-500 hover:bg-gray-50"}`}
              >
                <ArrowUp size={12} weight={myVote === 1 ? "bold" : "regular"} />
              </button>
              <span className={`min-w-[1.5rem] text-center text-xs font-bold font-mono ${isDark ? "text-gray-300" : "text-gray-600"}`}>{voteCount}</span>
              <button
                onClick={() => { void handleReplyVote(reply, "down"); }}
                disabled={!isSupabaseMode || busy === `vote:${reply.id}`}
                aria-label={isRTL ? "تصويت معارض للإجابة" : "Downvote answer"}
                aria-pressed={myVote === -1}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition disabled:opacity-50 ${myVote === -1 ? "bg-red-500/15 text-red-500" : isDark ? "text-gray-400 hover:bg-white/5" : "text-gray-500 hover:bg-gray-50"}`}
              >
                <ArrowDown size={12} weight={myVote === -1 ? "bold" : "regular"} />
              </button>
            </div>
            <ReportContentButton
              targetType="answer"
              targetId={String(reply.id)}
              isGuest={isGuest}
              variant="icon"
              className={`flex items-center justify-center w-8 h-8 rounded-xl border transition ${isDark ? "border-[#2d3748] text-gray-500 hover:text-red-400 hover:bg-white/5" : "border-gray-200 text-gray-400 hover:text-red-600 hover:bg-gray-50"}`}
            />
          </div>
        </div>

        {/* Owner ٤٢: the reader's own answer, not public yet */}
        {reply.reviewState && (
          <p role="status" className={`mb-3 text-xs font-semibold rounded-xl px-3 py-2 ${reply.reviewState === "pending" ? isDark ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-800" : isDark ? "bg-red-500/10 text-red-300" : "bg-red-50 text-red-700"}`}>
            {reply.reviewState === "pending"
              ? `${REVIEW_PENDING_AR} — إجابتك لا تظهر لغيرك قبل موافقة فريق المراجعة.`
              : `${REVIEW_REJECTED_AR}${reply.reviewNote ? ` — السبب: ${reply.reviewNote}` : ""}`}
          </p>
        )}

        {/* Text */}
        <p className={`text-sm leading-relaxed ${isLawyer ? isDark ? "text-zinc-200" : "text-gray-700" : muted}`}>
          {(isRTL ? reply.text : reply.textEn).replace(/\*\*(.+?)\*\*/g, "«$1»")}
        </p>

        {/* «أفضل إجابة» — only the question's author sees this (isMine is computed on the server). */}
        {isMine && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => { void handleBest(isBest ? null : reply); }}
              disabled={busy === "best"}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition disabled:opacity-50 ${isBest ? isDark ? "border-emerald-700/50 text-emerald-400 hover:bg-white/5" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : isDark ? "border-[#2d3748] text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              <CheckCircle size={13} weight={isBest ? "fill" : "regular"} />
              {isBest ? (isRTL ? "إلغاء اختيار أفضل إجابة" : "Unmark best answer") : (isRTL ? "اختر كأفضل إجابة" : "Mark as best answer")}
            </button>
          </div>
        )}

      </motion.div>
    );
  };

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      {/* pt-32 clears the fixed z-50 Navbar — same convention as /laws. */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 pt-32 pb-10">

        {/* Breadcrumb */}
        <div className={`flex items-center gap-2 text-xs mb-6 ${muted}`}>
          <Link href="/community" className="hover:text-[#0B3D2E] dark:hover:text-[#C8A762] transition">{isRTL ? "المجتمع" : "Community"}</Link>
          <ArrowRight size={10} className={isRTL ? "rotate-180" : ""} />
          <span className={`px-2 py-0.5 rounded-full ${isDark ? "bg-[#0B3D2E]/20 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"} font-medium`}>{isRTL ? question.tag : question.tagEn}</span>
        </div>

        <div className="flex gap-8">
          {/* ── Main ── */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Owner ٤٢: the reader's own question, not public yet */}
            {questionReview && (
              <div role="status" className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${questionReview.state === "pending" ? isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800" : isDark ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-700"}`}>
                {questionReview.state === "pending"
                  ? `${REVIEW_PENDING_AR} — سؤالك لا يظهر لغيرك قبل موافقة فريق المراجعة، ولا يمكن الإجابة عليه قبلها.`
                  : `${REVIEW_REJECTED_AR}${questionReview.note ? ` — السبب: ${questionReview.note}` : ""}. يمكنك تعديله ليعود إلى المراجعة.`}
              </div>
            )}

            {/* Question card */}
            <div className={`${card} p-6 relative overflow-hidden`}>
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#0B3D2E] via-[#C8A762] to-[#0B3D2E]" />

              <div className="flex gap-4">
                {/* Vote column */}
                <div className="flex flex-col items-center gap-1.5 pt-1 flex-shrink-0">
                  <button onClick={() => { void handleVote("up"); }} disabled={busy === "vote:post"} aria-label={isRTL ? "تصويت مؤيد" : "Upvote"} aria-pressed={userVote === "up"} className={`w-8 h-8 rounded-xl disabled:opacity-50 flex items-center justify-center transition ${userVote === "up" ? "bg-[#0B3D2E] text-white" : isDark ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
                    <ArrowUp size={16} weight={userVote === "up" ? "fill" : "regular"} />
                  </button>
                  <span className={`text-base font-black ${isDark ? "text-white" : "text-gray-800"}`}>{votes}</span>
                  <button onClick={() => { void handleVote("down"); }} disabled={busy === "vote:post"} aria-label={isRTL ? "تصويت معارض" : "Downvote"} aria-pressed={userVote === "down"} className={`w-8 h-8 rounded-xl disabled:opacity-50 flex items-center justify-center transition ${userVote === "down" ? "bg-red-500/20 text-red-500" : isDark ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
                    <ArrowDown size={16} weight={userVote === "down" ? "fill" : "regular"} />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {question.tags.map((t, i) => (
                      <span key={i} className={`text-xs px-2.5 py-1 rounded-full font-medium ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{t}</span>
                    ))}
                  </div>
                  <h1 className={`text-xl font-black leading-snug mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
                    {isRTL ? question.title : question.titleEn}
                  </h1>
                  <p className={`text-sm leading-relaxed mb-5 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    {isRTL ? question.body : question.bodyEn}
                  </p>
                  <div className={`flex flex-wrap items-center gap-3 text-xs ${muted}`}>
                    <span>{isRTL ? question.asker : question.asker} {question.isAnon ? <span>(مجهول)</span> : ""}</span>
                    <span>· {isRTL ? question.ago : question.agoEn}</span>
                    <span className="flex items-center gap-1"><Eye size={11} />{question.views}</span>
                    <span className="flex items-center gap-1"><ChatCircle size={11} />{replies.length} {isRTL ? "رد" : "replies"}</span>

                    <button onClick={() => { void handleSave(); }} disabled={busy === "save"} aria-pressed={saved} className={`ms-auto flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition disabled:opacity-50 ${saved ? "border-amber-400/30 bg-amber-400/10 text-amber-600 dark:text-amber-400" : isDark ? "border-[#2d3748] text-gray-400" : "border-gray-200 text-gray-500"}`}>
                      <BookmarkSimple size={12} weight={saved ? "fill" : "regular"} />
                      {isRTL ? (saved ? "محفوظ" : "حفظ") : (saved ? "Saved" : "Save")}
                    </button>
                    <button type="button" onClick={() => { void handleShare(); }} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs ${isDark ? "border-[#2d3748] text-gray-400" : "border-gray-200 text-gray-500"}`}>
                      <Share size={12} /> {shareDone ? (isRTL ? "نُسخ الرابط" : "Link copied") : (isRTL ? "مشاركة" : "Share")}
                    </button>
                    {/* `params.id` is the real community_posts.id (uuid) this
                        page was navigated to. */}
                    <ReportContentButton targetType="post" targetId={String(params?.id ?? question.id)} isGuest={isGuest} />
                  </div>
                  {shareLink && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className={muted}>{isRTL ? "انسخ الرابط:" : "Copy the link:"}</span>
                      <input
                        readOnly
                        value={shareLink}
                        onFocus={(e) => e.currentTarget.select()}
                        dir="ltr"
                        className={`flex-1 min-w-0 rounded-lg border px-2 py-1 font-mono ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-300" : "bg-white border-gray-200 text-gray-700"}`}
                      />
                    </div>
                  )}
                  {notice && (
                    <p role="status" className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-400 flex flex-wrap items-center gap-1.5">
                      <Warning size={13} weight="fill" className="shrink-0" /> {notice.text}
                      {notice.login && <Link href={loginHref} className="underline font-bold">{isRTL ? "تسجيل الدخول" : "Sign in"}</Link>}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ─── BEST ANSWER (pinned on top) ────────────── */}
            {bestReply && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold">
                    <PushPin size={13} weight="fill" />
                    {isRTL ? "أفضل إجابة" : "Best Answer"}
                  </div>
                  <div className={`h-px flex-1 ${isDark ? "bg-white/10" : "bg-gray-200"}`} />
                </div>
                <ReplyCard key={bestReply.id} reply={bestReply} />
              </section>
            )}

            {/* ─── LAWYER ANSWERS ─────────────────────────── */}
            {lawyerReplies.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0B3D2E] text-white text-xs font-bold">
                    <SealCheck size={13} weight="fill" />
                    {isRTL ? `إجابات المحامين (${lawyerReplies.length})` : `Lawyer Answers (${lawyerReplies.length})`}
                  </div>
                  <div className={`h-px flex-1 ${isDark ? "bg-white/10" : "bg-gray-200"}`} />
                </div>
                <div className="space-y-4">
                  {lawyerReplies.map(r => <ReplyCard key={r.id} reply={r} />)}
                </div>
              </section>
            )}

            {/* ─── USER COMMENTS ──────────────────────────── */}
            {userReplies.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isDark ? "bg-white/10 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                    <ChatCircle size={13} />
                    {isRTL ? `تعليقات المجتمع (${userReplies.length})` : `Community Comments (${userReplies.length})`}
                  </div>
                  <div className={`h-px flex-1 ${isDark ? "bg-white/10" : "bg-gray-200"}`} />
                </div>
                <div className="space-y-3">
                  {userReplies.map(r => <ReplyCard key={r.id} reply={r} />)}
                </div>
              </section>
            )}

            {/* ─── REPLY BOX ──────────────────────────────── */}
            <section id="reply" className={`${card} p-5`}>
              <h3 className={`text-base font-bold mb-4 ${isDark ? "text-white" : "text-gray-800"}`}>
                {isRTL ? "شاركنا رأيك أو تجربتك" : "Share your opinion or experience"}
              </h3>

              {/* Lawyer notice */}
              <div className={`flex items-start gap-3 rounded-xl p-3 mb-4 text-xs ${isDark ? "bg-[#0B3D2E]/15 border border-[#0B3D2E]/30" : "bg-[#0B3D2E]/5 border border-[#0B3D2E]/20"}`}>
                <SealCheck size={16} color="#C8A762" weight="fill" className="flex-shrink-0 mt-0.5" />
                <p className={isDark ? "text-gray-300" : "text-gray-600"}>
                  {isRTL
                    ? "هل أنت محامٍ؟ إجابتك ستظهر مميزةً في المقدمة. سجّل كمحامٍ للحصول على هذا التمييز."
                    : "Are you a lawyer? Your answer will appear prominently at the top. Register as a lawyer to get this distinction."}
                  {" "}<Link href="/register?type=lawyer" className="font-bold text-[#0B3D2E] dark:text-[#C8A762] hover:underline">{isRTL ? "سجّل كمحامٍ" : "Register as Lawyer"}</Link>
                </p>
              </div>

              {replyError && (
                <p role="alert" className="mb-3 text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <Warning size={14} weight="fill" className="shrink-0" /> {replyError}
                </p>
              )}
              <textarea
                ref={replyRef}
                value={replyText}
                onChange={e => { setReplyText(e.target.value); if (replyError) setReplyError(null); }}
                placeholder={isRTL ? "شاركنا تجربتك أو سؤالاً إضافياً... (١٠ أحرف على الأقل)" : "Share your experience or a follow-up question... (min 10 chars)"}
                rows={4}
                className={`w-full rounded-xl border px-4 py-3 text-sm resize-none outline-none transition focus:border-[#0B3D2E] mb-4 ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-white placeholder-gray-600" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"}`}
              />

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                {/* Anon toggle — demo only (N05-C3): real answers never carry a name. */}
                {isDemoMode && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsAnon(v => !v)} className={`relative w-10 h-5 rounded-full transition-colors ${isAnon ? "bg-[#0B3D2E]" : isDark ? "bg-[#2d3748]" : "bg-gray-300"}`}>
                    <motion.span animate={{ x: isAnon ? (isRTL ? -20 : 20) : 2 }} initial={false} transition={{ type: "spring", stiffness: 600, damping: 35 }} className="absolute top-0.5 start-0.5 w-4 h-4 rounded-full bg-white shadow" />
                  </button>
                  <span className={`text-xs ${muted}`}>{isRTL ? "نشر كمجهول" : "Post anonymously"}</span>
                </div>
                )}

                {isGuest && (
                  <p className={`text-xs ${muted}`}>
                    <Link href="/register" className="text-[#0B3D2E] dark:text-[#C8A762] font-semibold hover:underline">{isRTL ? "سجّل" : "Register"}</Link>
                    {isRTL ? " للحصول على إشعارات عند الرد عليك" : " to get notified when someone replies to you"}
                  </p>
                )}

                <motion.button
                  onClick={handleSubmitReply}
                  disabled={replyText.trim().length < 10 || posting}
                  whileHover={replyText.trim().length >= 10 ? { scale: 1.02 } : {}}
                  whileTap={replyText.trim().length >= 10 ? { scale: 0.98 } : {}}
                  className={`ms-auto flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${replyText.trim().length >= 10 ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328]" : isDark ? "bg-white/5 text-gray-600 cursor-not-allowed" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                >
                  <PencilSimple size={15} weight="bold" />
                  {isRTL ? "أرسل تعليقك" : "Post Comment"}
                </motion.button>
              </div>
            </section>

          </div>

          {/* ── Sidebar ── */}
          <aside className="hidden lg:flex flex-col gap-5 w-60 shrink-0">
            {/* Ask button */}
            <Link href="/community/ask" className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0B3D2E] text-white text-sm font-bold rounded-2xl hover:bg-[#0a3328] transition">
              <PencilSimple size={16} weight="bold" />
              {isRTL ? "اطرح سؤالاً" : "Ask a Question"}
            </Link>

            {/* Stats */}
            <div className={`${card} p-4`}>
              <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${muted}`}>{isRTL ? "إحصاءات السؤال" : "Question Stats"}</p>
              {[
                { icon: Eye, label: isRTL ? "مشاهدة" : "Views", value: question.views },
                { icon: ArrowUp, label: isRTL ? "تصويت" : "Votes", value: votes },
                { icon: ChatCircle, label: isRTL ? "رد" : "Replies", value: replies.length },
                { icon: SealCheck, label: isRTL ? "إجابة محامٍ" : "Lawyer Answers", value: lawyerAnswerCount },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i} className={`flex items-center justify-between py-2 border-b last:border-0 ${isDark ? "border-white/5" : "border-gray-100"}`}>
                    <span className={`flex items-center gap-2 text-xs ${muted}`}><Icon size={13} />{s.label}</span>
                    <span className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-800"}`}>{s.value}</span>
                  </div>
                );
              })}
            </div>

            {/* Upgrade to lawyer CTA */}
            <div className={`rounded-2xl border p-4 text-center ${isDark ? "bg-[#C8A762]/5 border-[#C8A762]/20" : "bg-amber-50 border-amber-200"}`}>
              <Crown size={28} color="#C8A762" weight="duotone" className="mx-auto mb-2" />
              <p className={`text-xs font-bold mb-1 ${isDark ? "text-[#C8A762]" : "text-amber-800"}`}>{isRTL ? "هل أنت محامٍ؟" : "Are you a lawyer?"}</p>
              <p className={`text-xs mb-3 ${muted}`}>{isRTL ? "إجابات المحامين الموثّقين تظهر أولاً" : "Verified lawyers' answers appear first"}</p>
              <Link href="/register?type=lawyer" className="block px-3 py-2 bg-[#C8A762] text-[#0B3D2E] text-xs font-black rounded-xl hover:opacity-90 transition">
                {isRTL ? "سجّل كمحامٍ مجاناً" : "Register as Lawyer Free"}
              </Link>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
      
      {/* ── Floating Action Button (Add Question) ── */}
      <Link
        href="/community/ask"
        className={`fixed bottom-24 left-4 md:bottom-8 md:left-8 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-[0_8px_25px_rgba(11,61,46,0.35)] transition-all duration-300 hover:scale-110 active:scale-95 group
          ${isDark ? "bg-[#C8A762] text-zinc-900 shadow-[0_8px_25px_rgba(200,167,98,0.25)]" : "bg-[#0B3D2E] text-white"}
        `}
        aria-label="إضافة سؤال جديد"
      >
        <Plus size={28} weight="bold" className="transition-transform group-hover:rotate-90" />
        {/* Tooltip */}
        <span className={`absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${isDark ? "bg-zinc-800 text-white" : "bg-white text-zinc-800"}`}>
          إضافة استفسار
        </span>
      </Link>
    </div>
  );
}
