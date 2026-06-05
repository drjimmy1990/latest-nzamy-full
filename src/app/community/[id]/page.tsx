"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUp, ArrowDown, CheckCircle, ChatCircle, SealCheck,
  ArrowRight, Clock, Eye, BookOpen, Share, BookmarkSimple,
  PencilSimple, Crown, Warning, ThumbsUp, Scales, Plus,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import {
  type StoredCommunityQuestion,
  getCommunityPost,
  addCommunityAnswer,
} from "@/lib/services/communityService";
import Link from "next/link";
import { useParams } from "next/navigation";

// ─── Types ─────────────────────────────────────────────────────────────────
interface Reply {
  id: number;
  author: string; authorEn: string;
  type: "lawyer" | "user" | "guest";
  lawyerSlug?: string; lawyerSpecialty?: string; lawyerSpecialtyEn?: string;
  rating?: number;
  text: string; textEn: string;
  date: string; dateEn: string;
  likes: number; isVerified?: boolean;
  isBest?: boolean;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────
const QUESTION = {
  id: 1,
  category: "labor", tag: "عمالي", tagEn: "Labor",
  title: "هل يحق لصاحب العمل خصم من الراتب بسبب التأخر عن الدوام؟",
  titleEn: "Can an employer deduct from salary for being late to work?",
  body: "أعمل في شركة خاصة منذ ٣ سنوات، وفي الشهر الأخير بدأ مدير الموارد البشرية يخصم ١٠٠ ريال عن كل مرة أتأخر فيها حتى لو بدقائق. لم يُبلَّغ بهذه السياسة رسمياً ولم تكن موجودة في عقدي. هل هذا قانوني؟",
  bodyEn: "I have been working in a private company for 3 years. Last month, the HR manager started deducting SAR 100 every time I'm late, even by minutes. I was not officially notified of this policy and it was not in my contract. Is this legal?",
  asker: "زائر-3471", askerType: "guest", isAnon: true,
  views: 312, votes: 24,
  ago: "منذ ٣ ساعات", agoEn: "3 hours ago",
  tags: ["عقود عمل", "خصم راتب", "حقوق العمال"],
};

const REPLIES: Reply[] = [
  // ── المحامون أولاً ──────────────────────────────────────────────────────
  {
    id: 1, type: "lawyer", isBest: true,
    author: "أ. أحمد محمد الغامدي", authorEn: "Ahmed Al-Ghamdi",
    lawyerSlug: "ahmed-alghamdi", lawyerSpecialty: "قانون عمالي", lawyerSpecialtyEn: "Labor Law",
    rating: 4.9, isVerified: true,
    text: "وفقاً للمادة ٦٩ من نظام العمل السعودي، لا يجوز لصاحب العمل توقيع أي جزاء مالي على العامل إلا إذا كانت هذه الجزاءات منصوصاً عليها في لائحة تنظيم العمل المعتمدة والمُعلَنَة. وبما أنك لم تُبلَّغ بهذه السياسة رسمياً ولم تكن في عقدك، فهذا الخصم **غير قانوني** ويحق لك المطالبة باسترداد المبالغ المخصومة عبر مكتب العمل.",
    textEn: "According to Article 69 of Saudi Labor Law, employers cannot impose financial penalties on employees unless these penalties are stated in an approved and announced work regulations. Since you were not officially notified and it was not in your contract, this deduction is **illegal** and you have the right to claim a refund through the Labor Office.",
    date: "منذ ساعتين", dateEn: "2 hours ago", likes: 47,
  },
  {
    id: 2, type: "lawyer",
    author: "أ. سارة العتيبي", authorEn: "Sara Al-Otaibi",
    lawyerSlug: "sara-alotaibi", lawyerSpecialty: "قانون مدني", lawyerSpecialtyEn: "Civil Law",
    rating: 4.8, isVerified: true,
    text: "أضيف إلى ما ذكره الزميل: يجب أن تبادر بتوثيق جميع حالات الخصم كتابياً (طلب كشف حساب رسمي من الموارد البشرية أو قسم الرواتب) قبل التقدم بشكوى لمكتب العمل. كذلك تأكد من الاحتفاظ بنسخة من عقد عملك الأصلي كدليل.",
    textEn: "To add to what my colleague mentioned: you should document all deduction cases in writing (request an official payslip from HR or payroll department) before filing a complaint with the Labor Office. Also, make sure to keep a copy of your original employment contract as evidence.",
    date: "منذ ساعة", dateEn: "1 hour ago", likes: 28,
  },
  // ── تعليقات الأفراد لاحقاً ──────────────────────────────────────────────
  {
    id: 3, type: "user",
    author: "محمد العنزي", authorEn: "Mohammed Al-Anzi",
    text: "واجهت نفس الوضع قبل سنة وفعلاً رفعت شكوى لمكتب العمل وحصلت على حقي كاملاً في أسبوعين فقط. لا تتردد!",
    textEn: "I faced the same situation a year ago and I actually filed a complaint with the Labor Office and got my full rights within just two weeks. Don't hesitate!",
    date: "منذ ٤٠ دقيقة", dateEn: "40 min ago", likes: 15,
  },
  {
    id: 4, type: "guest",
    author: "زائر-7821", authorEn: "Guest-7821",
    text: "هل يحق لهم فصلك لو رفعت شكوى ضدهم؟",
    textEn: "Can they fire you if you file a complaint against them?",
    date: "منذ ٢٠ دقيقة", dateEn: "20 min ago", likes: 3,
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  labor: "عمالي",
  commercial: "تجاري",
  civil: "مدني",
  criminal: "جنائي",
  family: "أحوال شخصية",
  "real-estate": "عقاري",
};

function mapStoredQuestion(question: StoredCommunityQuestion) {
  const tag = CATEGORY_LABELS[question.category] ?? "قانوني";
  return {
    id: question.id,
    category: question.category,
    tag,
    tagEn: tag,
    title: question.title,
    titleEn: question.title,
    body: question.body ?? "لم يضف صاحب السؤال تفاصيل إضافية.",
    bodyEn: question.body ?? "No additional details were provided.",
    asker: question.asker,
    askerType: question.askerType,
    isAnon: question.asker.includes("مجهول") || question.askerType === "guest",
    views: question.views,
    votes: question.votes,
    ago: question.ago,
    agoEn: question.ago,
    tags: question.tags.length ? question.tags : [tag],
  };
}

function mapStoredReply(answer: StoredCommunityQuestion["answers"][number]): Reply {
  return {
    id: answer.id,
    type: answer.authorType,
    author: answer.author,
    authorEn: answer.author,
    text: answer.content,
    textEn: answer.content,
    date: answer.ago,
    dateEn: answer.ago,
    likes: answer.votes,
    isBest: answer.isAccepted,
    rating: answer.authorRating,
  };
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function QuestionDetailPage() {
  const { isRTL, isDark } = useTheme();
  const params = useParams<{ id: string }>();
  const user = useUser();
  const [votes, setVotes] = useState(QUESTION.votes);
  const [userVote, setUserVote] = useState<"up" | "down" | null>(null);
  const [saved, setSaved] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isAnon, setIsAnon] = useState(false);
  const [replies, setReplies] = useState<Reply[]>(REPLIES);
  const [replyLikes, setReplyLikes] = useState<Record<number, number>>({});
  const [storedQuestion, setStoredQuestion] = useState<StoredCommunityQuestion | null>(null);
  const [mounted, setMounted] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const loadQuestion = async () => {
      const id = Number(params?.id);
      if (!Number.isFinite(id)) { setMounted(true); return; }
      try {
        const savedQuestion = await getCommunityPost(id);
        setStoredQuestion(savedQuestion);
        if (savedQuestion) {
          setVotes(savedQuestion.votes);
          setReplies(savedQuestion.answers.map(mapStoredReply));
        } else {
          setVotes(QUESTION.votes);
          setReplies(REPLIES);
        }
      } catch {
        // Fallback to static data
        setVotes(QUESTION.votes);
        setReplies(REPLIES);
      }
      setMounted(true);
    };
    loadQuestion();
  }, [params?.id]);
  if (!mounted) return null;

  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;

  const question = storedQuestion ? mapStoredQuestion(storedQuestion) : QUESTION;
  const isGuest = !user.isLoggedIn;

  // Split: محامون أولاً ثم أفراد
  const lawyerReplies = replies.filter(r => r.type === "lawyer").sort((a, b) => {
    if (a.isBest && !b.isBest) return -1;
    if (!a.isBest && b.isBest) return 1;
    return b.likes - a.likes;
  });
  const userReplies = replies.filter(r => r.type !== "lawyer");

  const handleVote = (dir: "up" | "down") => {
    if (userVote === dir) { setVotes(question.votes); setUserVote(null); return; }
    setVotes(question.votes + (dir === "up" ? 1 : -1));
    setUserVote(dir);
  };

  const handleLike = (id: number, base: number) => {
    setReplyLikes(prev => ({ ...prev, [id]: (prev[id] ?? base) + (prev[id] !== undefined ? 0 : 1) }));
  };

  const handleSubmitReply = async () => {
    if (replyText.trim().length < 10) return;
    const newReply: Reply = {
      id: Date.now(),
      type: user.userType === "lawyer" ? "lawyer" : "user",
      author: isAnon ? "مستخدم مجهول" : user.name || "أنت",
      authorEn: isAnon ? "Anonymous User" : user.name || "You",
      text: replyText,
      textEn: replyText,
      date: "الآن",
      dateEn: "Just now",
      likes: 0,
    };
    if (storedQuestion) {
      try {
        await addCommunityAnswer(storedQuestion.id, {
          author: newReply.author,
          authorType: newReply.type === "lawyer" ? "lawyer" : "user",
          authorRating: user.userType === "lawyer" ? 1 : 0,
          content: replyText,
        });
      } catch {
        // Fallback: still add locally
      }
    }
    setReplies(prev => [...prev, newReply]);
    setReplyText("");
  };

  // ── Reply Card (shared renderer) ──
  const ReplyCard = ({ reply }: { reply: Reply }) => {
    const isLawyer = reply.type === "lawyer";
    const likes = replyLikes[reply.id] ?? reply.likes;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border p-5 ${
          isLawyer
            ? reply.isBest
              ? isDark ? "bg-[#0B3D2E]/20 border-[#0B3D2E]/50" : "bg-[#0B3D2E]/5 border-[#0B3D2E]/30"
              : isDark ? "bg-[#0B3D2E]/10 border-[#0B3D2E]/30" : "bg-emerald-50/60 border-emerald-200/80"
            : isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"
        }`}
      >
        {/* Best Answer badge */}
        {reply.isBest && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-3">
            <CheckCircle size={14} weight="fill" />
            {isRTL ? "أفضل إجابة ✓" : "Best Answer ✓"}
          </div>
        )}

        {/* Author row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${isLawyer ? "bg-[#0B3D2E] text-white" : isDark ? "bg-white/10 text-gray-300" : "bg-gray-200 text-gray-600"}`}>
              {(isRTL ? reply.author : reply.authorEn).charAt(0)}
            </div>
            <div>
              {isLawyer ? (
                <Link href={`/lawyers/${reply.lawyerSlug}`} className="group">
                  <p className={`text-sm font-bold flex items-center gap-1.5 group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                    {isRTL ? reply.author : reply.authorEn}
                    <SealCheck size={14} color="#C8A762" weight="fill" />
                    <span className="text-xs font-normal px-1.5 py-0.5 rounded-full bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#C8A762]/10 dark:text-[#C8A762]">
                      ⚖️ {isRTL ? reply.lawyerSpecialty : reply.lawyerSpecialtyEn}
                    </span>
                  </p>
                  <p className={`text-xs ${muted}`}>⭐ {reply.rating} · {isRTL ? reply.date : reply.dateEn}</p>
                </Link>
              ) : (
                <div>
                  <p className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                    {isRTL ? reply.author : reply.authorEn}
                    {reply.type === "guest" && (
                      <span className={`ms-2 text-xs font-normal ${muted}`}>{isRTL ? "(زائر)" : "(Guest)"}</span>
                    )}
                  </p>
                  <p className={`text-xs ${muted}`}>{isRTL ? reply.date : reply.dateEn}</p>
                </div>
              )}
            </div>
          </div>

          {/* Like */}
          <button
            onClick={() => handleLike(reply.id, reply.likes)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
              replyLikes[reply.id] !== undefined
                ? "bg-[#0B3D2E]/10 border-[#0B3D2E]/30 text-[#0B3D2E] dark:text-[#C8A762]"
                : isDark ? "border-[#2d3748] text-gray-400 hover:bg-white/5" : "border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            <ThumbsUp size={12} weight={replyLikes[reply.id] !== undefined ? "fill" : "regular"} />
            {likes}
          </button>
        </div>

        {/* Text */}
        <p className={`text-sm leading-relaxed ${isLawyer ? isDark ? "text-gray-200" : "text-gray-700" : muted}`}>
          {(isRTL ? reply.text : reply.textEn).replace(/\*\*(.+?)\*\*/g, "«$1»")}
        </p>

        {/* Lawyer: book CTA */}
        {isLawyer && (
          <div className="mt-4 pt-3 border-t border-current/10 flex items-center justify-between gap-3">
            <Link
              href={`/lawyers/${reply.lawyerSlug}`}
              className="text-xs font-bold text-[#0B3D2E] dark:text-[#C8A762] hover:underline flex items-center gap-1"
            >
              {isRTL ? "عرض بروفايل المحامي" : "View Lawyer Profile"}
              <ArrowRight size={11} className={isRTL ? "rotate-180" : ""} />
            </Link>
            <Link
              href={`/lawyers/${reply.lawyerSlug}#consult`}
              className="px-4 py-1.5 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl hover:bg-[#0a3328] transition"
            >
              {isRTL ? "احجز استشارة" : "Book Consultation"}
            </Link>
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-10">

        {/* Breadcrumb */}
        <div className={`flex items-center gap-2 text-xs mb-6 ${muted}`}>
          <Link href="/community" className="hover:text-[#0B3D2E] dark:hover:text-[#C8A762] transition">{isRTL ? "المجتمع" : "Community"}</Link>
          <ArrowRight size={10} className={isRTL ? "rotate-180" : ""} />
          <span className={`px-2 py-0.5 rounded-full ${isDark ? "bg-[#0B3D2E]/20 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"} font-medium`}>{isRTL ? question.tag : question.tagEn}</span>
        </div>

        <div className="flex gap-8">
          {/* ── Main ── */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Question card */}
            <div className={`${card} p-6 relative overflow-hidden`}>
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#0B3D2E] via-[#C8A762] to-[#0B3D2E]" />

              <div className="flex gap-4">
                {/* Vote column */}
                <div className="flex flex-col items-center gap-1.5 pt-1 flex-shrink-0">
                  <button onClick={() => handleVote("up")} className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${userVote === "up" ? "bg-[#0B3D2E] text-white" : isDark ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
                    <ArrowUp size={16} weight={userVote === "up" ? "fill" : "regular"} />
                  </button>
                  <span className={`text-base font-black ${isDark ? "text-white" : "text-gray-800"}`}>{votes}</span>
                  <button onClick={() => handleVote("down")} className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${userVote === "down" ? "bg-red-500/20 text-red-500" : isDark ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
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

                    <button onClick={() => setSaved(v => !v)} className={`ms-auto flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition ${saved ? "border-amber-400/30 bg-amber-400/10 text-amber-600 dark:text-amber-400" : isDark ? "border-[#2d3748] text-gray-400" : "border-gray-200 text-gray-500"}`}>
                      <BookmarkSimple size={12} weight={saved ? "fill" : "regular"} />
                      {isRTL ? (saved ? "محفوظ" : "حفظ") : (saved ? "Saved" : "Save")}
                    </button>
                    <button className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs ${isDark ? "border-[#2d3748] text-gray-400" : "border-gray-200 text-gray-500"}`}>
                      <Share size={12} /> {isRTL ? "شارك" : "Share"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

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

              <textarea
                ref={replyRef}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={isRTL ? "شاركنا تجربتك أو سؤالاً إضافياً... (١٠ أحرف على الأقل)" : "Share your experience or a follow-up question... (min 10 chars)"}
                rows={4}
                className={`w-full rounded-xl border px-4 py-3 text-sm resize-none outline-none transition focus:border-[#0B3D2E] mb-4 ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-white placeholder-gray-600" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"}`}
              />

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                {/* Anon toggle */}
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsAnon(v => !v)} className={`relative w-10 h-5 rounded-full transition-colors ${isAnon ? "bg-[#0B3D2E]" : isDark ? "bg-[#2d3748]" : "bg-gray-300"}`}>
                    <motion.span animate={{ x: isAnon ? (isRTL ? -20 : 20) : 2 }} initial={false} transition={{ type: "spring", stiffness: 600, damping: 35 }} className="absolute top-0.5 start-0.5 w-4 h-4 rounded-full bg-white shadow" />
                  </button>
                  <span className={`text-xs ${muted}`}>{isRTL ? "نشر كمجهول" : "Post anonymously"}</span>
                </div>

                {isGuest && (
                  <p className={`text-xs ${muted}`}>
                    <Link href="/register" className="text-[#0B3D2E] dark:text-[#C8A762] font-semibold hover:underline">{isRTL ? "سجّل" : "Register"}</Link>
                    {isRTL ? " للحصول على إشعارات عند الرد عليك" : " to get notified when someone replies to you"}
                  </p>
                )}

                <motion.button
                  onClick={handleSubmitReply}
                  disabled={replyText.trim().length < 10}
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
                { icon: SealCheck, label: isRTL ? "إجابة محامٍ" : "Lawyer Answers", value: lawyerReplies.length },
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
              <p className={`text-xs mb-3 ${muted}`}>{isRTL ? "إجابتك تظهر أولاً وتُعرِّف بك أمام آلاف الباحثين" : "Your answer appears first and introduces you to thousands of users"}</p>
              <Link href="/register?type=lawyer" className="block px-3 py-2 bg-[#C8A762] text-[#0B3D2E] text-xs font-black rounded-xl hover:opacity-90 transition">
                {isRTL ? "سجّل كمحامٍ مجاناً" : "Register as Lawyer Free"}
              </Link>
            </div>
          </aside>
        </div>
      </main>

      <Footer />
      <FloatingButtons />

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
