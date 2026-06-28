"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight, PaperPlaneTilt, Microphone, MicrophoneSlash,
  Paperclip, Robot, Clock, Phone, Video,
  FileText, Star, CheckCircle, DotsThree,
  Download, Warning, X, SealCheck, Copy, FileArrowUp,
  Scales, ShieldCheck, CaretUp, CaretDown, CalendarBlank,
  Sparkle
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import SessionChatPane from "@/components/dashboard/SessionChatPane";
import { listClientWorkflowRequests } from "@/lib/clientWorkflowRepository";
import type { WorkflowRequest } from "@/lib/workflowStore";
import {
  getChatRooms,
  createChatRoom,
  getChatMessages,
  sendChatMessage,
  type ChatMessage,
} from "@/lib/services/chatService";

// ─── Types & Configurations ──────────────────────────────────────────────────

type ConsultType   = "in-person" | "video" | "ai";
type ConsultStatus = "upcoming" | "active" | "completed" | "cancelled";

interface Consultation {
  id: string;
  type: ConsultType;
  status: ConsultStatus;
  lawyerName: string;
  lawyerSpecialty: string;
  lawyerInitial: string;
  lawyerColor: string;
  topic: string;
  date: string;
  time: string;
  duration: string;
  price: number;
  rating?: number;
  hasPdf?: boolean;
  pdfName?: string;
  caseId?: string;
  notes?: string;
  questionText?: string;
}

interface Message {
  id: string;
  sender: "client" | "lawyer" | "ai";
  text: string;
  time: string;
  isVoice?: boolean;
  voiceDuration?: string;
  attachment?: { name: string; size: string };
  isRead?: boolean;
}

// Map a chatService ChatMessage (server row, column `body` → `content`) onto the
// local Message shape used by SessionChatPane. No fabricated content — only
// real persisted messages are rendered.
function mapChatMessage(
  cm: ChatMessage,
  currentUserId: string | undefined,
  consultType: ConsultType,
): Message {
  const isSelf = cm.sender_id === currentUserId;
  const sender: Message["sender"] = isSelf ? "client" : consultType === "ai" ? "ai" : "lawyer";
  const d = new Date(cm.created_at);
  const timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return {
    id: cm.id,
    sender,
    text: cm.content,
    time: timeStr,
    isRead: isSelf,
  };
}

const STATUS_CONFIG: Record<ConsultStatus, { label: string; badge: string }> = {
  upcoming:  { label: "قادمة",    badge: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
  active:    { label: "نشطة الآن", badge: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20 animate-pulse" },
  completed: { label: "مكتملة",   badge: "text-zinc-400 bg-white/5 border-white/10" },
  cancelled: { label: "ملغية",    badge: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
};



// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConsultationRoomPage() {
  const params = useParams();
  const id = params?.id as string;
  const user = useUser();
  const { isDark } = useTheme();

  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  // Assigned lawyer's user id (used to find/create the chat room). Null until the
  // workflow request resolves; stays null for ai_workspace or unassigned requests.
  const [lawyerUserId, setLawyerUserId] = useState<string | null>(null);

  // Chat panel states
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  // Real chat room id for this consultation (looked up / created via chatService).
  const [chatRoomId, setChatRoomId] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  // Honest, user-facing chat banner (no fabricated lawyer/AI messages).
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  // NOTE: a real session countdown requires a session-clock API (not built yet).
  // Showing a frozen "٤٧:١٣" fakes a live timer — use an honest static label.
  const [sessionTimeLeft] = useState("جارية");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Expandable statutes and roadmaps states
  const [expandedStatutes, setExpandedStatutes] = useState<Record<string, boolean>>({});
  const [completedRoadmapSteps, setCompletedRoadmapSteps] = useState<number[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    // Fetch the consultation from the dynamic workflow repository (real data only).
    // No mock fallback: an unknown id leaves consultation null and the not-found UI
    // renders honestly.
    listClientWorkflowRequests({ requesterUserId: user.userId })
      .then((requests) => {
        const found = requests.find(r => r.id === id);
        if (found) {
          const type = found.receiver === "ai_workspace" ? "ai" : (found.metadata?.mode as ConsultType) || "video";
          setLawyerUserId(found.assignedTo ?? null);
          setConsultation({
            id: found.id,
            type,
            status: found.status === "completed" ? "completed" : found.status === "pending_payment" ? "upcoming" : "upcoming",
            lawyerName: found.receiver === "ai_workspace" ? "نظامي AI" : String(found.metadata?.lawyer ?? "بانتظار تأكيد المحامي"),
            lawyerSpecialty: found.receiver === "ai_workspace" ? "مساعد قانوني ذكي" : String(found.metadata?.specialty ?? "استشارة قانونية"),
            lawyerInitial: found.receiver === "ai_workspace" ? "AI" : "ن",
            lawyerColor: found.receiver === "ai_workspace" ? "bg-[#0B3D2E]" : "bg-emerald-600",
            topic: found.description,
            date: String(found.metadata?.day ?? "محفوظ الآن"),
            time: String(found.metadata?.time ?? "قيد الجدولة"),
            duration: found.receiver === "ai_workspace" ? "فوري" : "60 دق",
            price: found.payment.amount,
            notes: `رقم الطلب: ${found.id}`,
            questionText: found.metadata?.question as string,
          });
        } else {
          setConsultation(null);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [id, user.userId]);

  // Wire the real chat room for this consultation (lawyer consultations only —
  // the AI branch renders its own panel and never reaches SessionChatPane).
  useEffect(() => {
    if (!consultation || consultation.type === "ai") return;
    if (!user.userId) return;
    let cancelled = false;
    (async () => {
      setChatLoading(true);
      setChatNotice(null);
      try {
        const rooms = await getChatRooms();
        if (cancelled) return;
        const existing = rooms.find(r => r.related_id === consultation.id);
        let roomId = existing?.id ?? null;
        if (!roomId && lawyerUserId) {
          try {
            const created = await createChatRoom({
              participant_ids: [user.userId as string, lawyerUserId],
              type: "direct",
              related_id: consultation.id,
              name: `استشارة ${consultation.id}`,
            });
            roomId = created?.id ?? null;
          } catch {
            roomId = null;
          }
        }
        if (cancelled) return;
        setChatRoomId(roomId);
        if (roomId) {
          const history = await getChatMessages(roomId);
          if (cancelled) return;
          setMessages(history.map(cm => mapChatMessage(cm, user.userId, consultation.type)));
        } else {
          setMessages([]);
          setChatNotice(
            lawyerUserId
              ? "تعذّر إنشاء غرفة المحادثة الآن. حاول مرة أخرى لاحقاً."
              : "سيتم تفعيل المحادثة المباشرة قريباً بمجرد تأكيد تعيين المحامي."
          );
        }
      } catch {
        if (!cancelled) {
          setChatRoomId(null);
          setMessages([]);
          setChatNotice("تعذّر تحميل المحادثة الآن. حاول مرة أخرى لاحقاً.");
        }
      } finally {
        if (!cancelled) setChatLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [consultation, lawyerUserId, user.userId]);

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    const localId = `local-${Date.now()}`;
    // Append only the client's own message (optimistic). No fabricated reply.
    setMessages(prev => [...prev, {
      id: localId,
      sender: "client",
      text,
      time: timeStr,
      isRead: false,
    }]);
    setInput("");
    if (chatRoomId) {
      try {
        const saved = await sendChatMessage(chatRoomId, text);
        setMessages(prev => prev.map(m =>
          m.id === localId ? mapChatMessage(saved, user.userId, consultation?.type ?? "video") : m
        ));
      } catch {
        setChatNotice("تعذّر إرسال الرسالة. حاول مرة أخرى.");
      }
    } else {
      setChatNotice(
        lawyerUserId
          ? "تعذّر إرسال الرسالة الآن. حاول مرة أخرى لاحقاً."
          : "سيتم تفعيل المحادثة المباشرة قريباً بمجرد تأكيد تعيين المحامي. تم تسجيل رسالتك."
      );
    }
  }

  // ─── Native Copy & Branded PDF Creators ─────────────────────────────────────

  const handleCopyReport = () => {
    if (!consultation) return;

    let reportText = `⚖️ تقرير استشارة وتشخيص قانوني - نظامي AI ⚖️\n`;
    reportText += `رقم الاستشارة: ${consultation.id}\n`;
    reportText += `تاريخ الاستشارة: ${consultation.date}\n`;
    reportText += `=========================================\n\n`;

    reportText += `📌 [أولاً: موجز الاستخلاص والوقائع]\n`;
    reportText += `• موضوع المسألة: ${consultation.lawyerSpecialty}\n`;
    reportText += `• الوقائع المستخلصة: ${consultation.questionText || "تأصيل الوقائع المحددة من الاستبيان"}\n\n`;

    reportText += `🔍 [ثانياً: التشخيص القانوني المباشر]\n`;
    reportText += `${consultation.topic}\n\n`;

    reportText += `-----------------------------------------\n`;
    reportText += `تنبيه: هذا التقرير تم توليده بواسطة محرك نظامي AI لأغراض استرشادية ولا يُعد استشارة قانونية رسمية.`;

    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPDF = () => {
    if (!consultation) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // Detect category to print relevant statutes
    const low = (consultation.topic + " " + (consultation.questionText || "")).toLowerCase();
    const isLabor = /عمال|موظف|راتب|فصل/.test(low);
    const isRealEstate = /عقار|أرض|شقة|إيجار/.test(low);

    const statutesHtml = isLabor ? `
      <div class="section">
        <div class="section-title">السند القانوني والمواد النظامية المعول عليها</div>
        <div class="statute-box">
          <div class="statute-header"><strong>المادة 77 - نظام العمل السعودي</strong> - <span style="color:#C8A762">تعويضات إنهاء العقد لسبب غير مشروع</span></div>
          <div class="statute-body">إذا أنهي العقد لسبب غير مشروع، يستحق الطرف المتضرر تعويضاً عادلاً تقدره المحكمة العمالية، أو تعويضاً تعاقدياً محدداً، وفي حال غيابه يستحق أجر 15 يوماً عن كل سنة خدمة للعقد غير محدد المدة، أو أجر المدة المتبقية للعقد محدد المدة.</div>
        </div>
        <div class="statute-box">
          <div class="statute-header"><strong>المادة 84 - تسوية مستحقات الخدمة</strong> - <span style="color:#C8A762">احتساب مكافأة نهاية الخدمة</span></div>
          <div class="statute-body">يستحق العامل عند انتهاء العلاقة العمالية مكافأة نهاية خدمة تحسب بواقع أجر نصف شهر عن كل سنة من السنوات الخمس الأولى، وأجر شهر كامل عن كل سنة تالية.</div>
        </div>
      </div>
    ` : isRealEstate ? `
      <div class="section">
        <div class="section-title">السند القانوني والمواد النظامية المعول عليها</div>
        <div class="statute-box">
          <div class="statute-header"><strong>المادة 105 - التزامات المؤجر الصيانة</strong> - <span style="color:#C8A762">أعمال الصيانة الهيكلية والضرورية</span></div>
          <div class="statute-body">يلتزم المؤجر بترميم العين المؤجرة وإجراء الصيانة الضرورية لتمكين المستأجر من استيفاء المنفعة كاملة دون عوائق هيكلية.</div>
        </div>
        <div class="statute-box">
          <div class="statute-header"><strong>المادة 112 - حقوق الفسخ والخصم</strong> - <span style="color:#C8A762">حقوق المستأجر عند تقاعس المؤجر</span></div>
          <div class="statute-body">للمستأجر عند تقاعس المؤجر عن الصيانة إخطاره رسمياً، فإذا لم يستجب يحق له إجراء الصيانة بخصمها من الأجرة أو اللجوء للفسخ.</div>
        </div>
      </div>
    ` : `
      <div class="section">
        <div class="section-title">السند القانوني والمواد النظامية المعول عليها</div>
        <div class="statute-box">
          <div class="statute-header"><strong>المادة 140 - نظام المعاملات المدنية</strong> - <span style="color:#C8A762">الالتزام بتنفيذ بنود العقد المتفق عليها</span></div>
          <div class="statute-body">العقد شريعة المتعاقدين، ويلتزم كل طرف بتنفيذ ما تم التراضي عليه بما يوافق مبادئ حسن النية والعدالة التعاقدية.</div>
        </div>
        <div class="statute-box">
          <div class="statute-header"><strong>المادة 178 - الشرط الجزائي والتعويض</strong> - <span style="color:#C8A762">احتساب غرامات التأخير التعاقدية</span></div>
          <div class="statute-body">يجوز للمتعاقدين تحديد قيمة التعويض مسبقاً في العقد عن التأخير أو عدم التنفيذ، ولا تلغيه المحكمة إلا إذا ثبت مبالغته الكبيرة.</div>
        </div>
      </div>
    `;

    const roadmapHtml = `
      <div class="section">
        <div class="section-title">خريطة الطريق والخطوات التنفيذية</div>
        <ul class="roadmap-list">
          <li><strong>الخطوة 1: توجيه إنذار رسمي كتابي</strong><p>إرسال خطاب إنذار بالوفاء يمنح الطرف الآخر مهلة نهائية وموثقة قانونياً لإثبات الوقائع ومحاولة الحل الودي.</p></li>
          <li><strong>الخطوة 2: الشكوى والتسوية الودية</strong><p>تقديم طلب تسوية عبر المنصات الإلكترونية المعتمدة (قوى / إيجار / مركز التحكيم) لتوثيق تعذر الصلح.</p></li>
          <li><strong>الخطوة 3: قيد صحيفة الدعوى القضائية</strong><p>إحالة ملف المنازعة وتوجيه صحيفة ادعاء واضحة للدوائر القضائية المختصة للمطالبة بالأصل والتعويضات.</p></li>
        </ul>
      </div>
    `;

    printWindow.document.write(`
      <html dir="rtl" lang="ar">
      <head>
        <title>تقرير استشارة وتشخيص قانوني - نظامي AI</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">
        <style>
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: 'Tajawal', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #ffffff;
            color: #1f2937;
            margin: 40px;
            line-height: 1.6;
            direction: rtl;
          }
          .header {
            border-bottom: 3px solid #0B3D2E;
            padding-bottom: 20px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .logo-title {
            font-size: 22px;
            font-weight: 900;
            color: #0B3D2E;
          }
          .date {
            font-size: 12px;
            color: #6b7280;
          }
          .title {
            font-size: 20px;
            font-weight: 900;
            color: #111827;
            margin-bottom: 30px;
            text-align: center;
          }
          .section {
            margin-bottom: 30px;
            page-break-inside: avoid;
          }
          .section-title {
            font-size: 15px;
            font-weight: 700;
            color: #0B3D2E;
            border-right: 4px solid #C8A762;
            padding-right: 10px;
            margin-bottom: 15px;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .table th, .table td {
            border: 1px solid #e5e7eb;
            padding: 12px;
            text-align: right;
            font-size: 13px;
          }
          .table th {
            background-color: #f9fafb !important;
            width: 30%;
            font-weight: 700;
          }
          .answer {
            background-color: #f9fafb !important;
            border: 1px solid #e5e7eb;
            border-right: 4px solid #10b981;
            padding: 20px;
            border-radius: 12px;
            white-space: pre-wrap;
            font-size: 13.5px;
            line-height: 1.7;
          }
          .statute-box {
            border: 1px solid #e5e7eb;
            padding: 15px;
            border-radius: 12px;
            margin-bottom: 15px;
            background-color: #ffffff;
            page-break-inside: avoid;
          }
          .statute-header {
            font-size: 13px;
            margin-bottom: 8px;
            border-bottom: 1px solid #f3f4f6;
            padding-bottom: 8px;
          }
          .statute-body {
            font-size: 12px;
            color: #4b5563;
          }
          .roadmap-list {
            list-style: none;
            padding: 0;
          }
          .roadmap-list li {
            margin-bottom: 15px;
            padding-right: 25px;
            position: relative;
            page-break-inside: avoid;
          }
          .roadmap-list li::before {
            content: "•";
            color: #C8A762;
            font-size: 24px;
            position: absolute;
            right: 0;
            top: -6px;
          }
          .footer {
            border-top: 1px solid #e5e7eb;
            padding-top: 15px;
            margin-top: 50px;
            text-align: center;
            font-size: 11px;
            color: #9ca3af;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-title">نظامي AI • المستشار القانوني الذكي</div>
          <div class="date">رقم الاستشارة: ${consultation.id} | التاريخ: ${consultation.date}</div>
        </div>
        
        <div class="title">تقرير استشارة وتشخيص قانوني رسمي للعميل</div>
        
        <div class="section">
          <div class="section-title">موجز الوقائع والاستخلاص الأولي</div>
          <table class="table">
            <tr>
              <th>تصنيف القضية</th>
              <td>${consultation.lawyerSpecialty}</td>
            </tr>
            <tr>
              <th>الوقائع المستخلصة</th>
              <td>${consultation.questionText || "تأصيل الوقائع المحددة من الاستبيان التشخيصي"}</td>
            </tr>
            <tr>
              <th>القيمة المالية المقدرة</th>
              <td>${consultation.price.toLocaleString("ar-SA")} ر.س</td>
            </tr>
          </table>
        </div>
        
        <div class="section">
          <div class="section-title">التشخيص والإجابة القانونية المباشرة</div>
          <div class="answer">${consultation.topic}</div>
        </div>
        
        ${statutesHtml}
        
        ${roadmapHtml}
        
        <div class="footer">
          تنبيه: هذا التقرير تم توليده بواسطة محرك نظامي AI لأغراض استرشادية فقط ولا يحل محل التوكيل القضائي أو الاستشارة الرسمية المعتمدة.
        </div>
        
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const toggleStatuteExpand = (key: string) => {
    setExpandedStatutes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleRoadmapStep = (stepNum: number) => {
    setCompletedRoadmapSteps(prev => 
      prev.includes(stepNum) ? prev.filter(s => s !== stepNum) : [...prev, stepNum]
    );
  };

  // ─── Loading or Error State ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#C8A762]/30 border-t-[#C8A762] rounded-full animate-spin" />
          <p className="text-sm font-semibold">جارٍ تحميل بيانات الاستشارة...</p>
        </div>
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 gap-4" dir="rtl">
        <Warning size={40} className="text-amber-500" />
        <h3 className="text-lg font-black">الاستشارة غير موجودة</h3>
        <p className="text-xs text-zinc-500">لم نتمكن من العثور على سجل هذه الاستشارة في حسابك.</p>
        <Link href="/dashboard/client/consultation">
          <button className="px-5 py-2.5 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl">
            الرجوع لاستشاراتي
          </button>
        </Link>
      </div>
    );
  }

  // ─── 1. AI REVIEW PANEL RENDER ──────────────────────────────────────────────

  if (consultation.type === "ai") {
    // Determine dynamic statutes based on topic
    const low = (consultation.topic + " " + (consultation.questionText || "")).toLowerCase();
    const isLabor = /عمال|موظف|راتب|فصل/.test(low);
    const isRealEstate = /عقار|أرض|شقة|إيجار/.test(low);

    const dynamicStatutes = isLabor ? [
      {
        title: "المادة 77 - نظام العمل السعودي",
        subtitle: "إنهاء العقد لسبب غير مشروع",
        text: "إذا أنهي العقد لسبب غير مشروع، يستحق الطرف المتضرر تعويضاً عادلاً تقدره المحكمة العمالية، أو تعويضاً تعاقدياً محدداً، وفي حال غيابه يستحق أجر 15 يوماً عن كل سنة خدمة للعقد غير محدد المدة، أو أجر المدة المتبقية للعقد محدد المدة."
      },
      {
        title: "المادة 84 - تسوية مستحقات الخدمة",
        subtitle: "احتساب مكافأة نهاية الخدمة",
        text: "يستحق العامل عند انتهاء العلاقة العمالية مكافأة نهاية خدمة تحسب بواقع أجر نصف شهر عن كل سنة من السنوات الخمس الأولى، وأجر شهر كامل عن كل سنة تالية."
      }
    ] : isRealEstate ? [
      {
        title: "المادة 105 - التزامات المؤجر الصيانة",
        subtitle: "أعمال الصيانة الهيكلية والضرورية",
        text: "يلتزم المؤجر بترميم العين المؤجرة وإجراء الصيانة الضرورية لتمكين المستأجر من استيفاء المنفعة كاملة دون عوائق هيكلية."
      },
      {
        title: "المادة 112 - حقوق الفسخ والخصم",
        subtitle: "حقوق المستأجر عند تقاعس المؤجر",
        text: "للمستأجر عند تقاعس المؤجر عن الصيانة إخطاره رسمياً، فإذا لم يستجب يحق له إجراء الصيانة بخصمها من الأجرة أو اللجوء للفسخ."
      }
    ] : [
      {
        title: "المادة 140 - نظام المعاملات المدنية",
        subtitle: "الالتزام بتنفيذ بنود العقد المتفق عليها",
        text: "العقد شريعة المتعاقدين، ويلتزم كل طرف بتنفيذ ما تم التراضي عليه بما يوافق مبادئ حسن النية والعدالة التعاقدية."
      },
      {
        title: "المادة 178 - الشرط الجزائي والتعويض",
        subtitle: "احتساب غرامات التأخير التعاقدية",
        text: "يجوز للمتعاقدين تحديد قيمة التعويض مسبقاً في العقد عن التأخير أو عدم التنفيذ، ولا تلغيه المحكمة إلا إذا ثبت مبالغته الكبيرة."
      }
    ];

    const roadmapSteps = [
      { step: 1, title: "توجيه إخطار رسمي كتابي", desc: "إرسال خطاب إنذار بالوفاء يمنح الطرف الآخر مهلة نهائية وموثقة قانونياً لإثبات الوقائع." },
      { step: 2, title: "الشكوى والتسوية الودية", desc: "تقديم طلب تسوية عبر المنصات الإلكترونية المعتمدة (قوى / إيجار / مركز التحكيم) لتوثيق النزاع." },
      { step: 3, title: "قيد صحيفة الدعوى القضائية", desc: "إحالة ملف المنازعة وتوجيه صحيفة ادعاء واضحة للدوائر القضائية المختصة للمطالبة بالأصل والتعويضات." }
    ];

    const bg = isDark ? "bg-[#111418]" : "bg-zinc-50/50";
    const cardBg = isDark ? "bg-zinc-900/60 backdrop-blur-md border-white/10" : "bg-white border-zinc-200/60";

    return (
      <div className={`flex flex-col h-[100dvh] overflow-hidden ${bg}`} dir="rtl">
        {/* Header */}
        <header className={`flex-shrink-0 flex items-center justify-between px-6 py-4 border-b backdrop-blur-md ${
          isDark ? "bg-zinc-900/50 border-white/10" : "bg-white border-zinc-200 shadow-sm"
        }`}>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/client/consultation">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-white/[0.06] hover:bg-white/[0.1] text-zinc-400" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"}`}>
                <ArrowRight size={17} />
              </motion.button>
            </Link>
            <div>
              <h1 className={`text-[16px] font-black tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`} style={{ fontFamily: 'var(--font-brand)' }}>
                تفاصيل وسجل الاستشارة الذكية AI
              </h1>
              <p className={`text-[11px] font-semibold mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                رقم الطلب: {consultation.id} · تم الحفظ في {consultation.date}
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-black px-3 py-1 rounded-full border ${STATUS_CONFIG[consultation.status].badge}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            {STATUS_CONFIG[consultation.status].label}
          </span>
        </header>

        {/* Content Workspace */}
        <main className="flex-1 overflow-y-auto custom-scrollbar px-6 py-8">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* Title & Info Bento Card */}
            <div className={`p-6 rounded-[2rem] border relative space-y-4 ${cardBg}`}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#0B3D2E] flex items-center justify-center shadow-md">
                  <Robot size={26} weight="duotone" className="text-[#C8A762]" />
                </div>
                <div>
                  <h2 className="text-base font-black text-gray-900 dark:text-white" style={{ fontFamily: 'var(--font-brand)' }}>
                    التكييف الهيكلي والاستخلاص الأولي
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">موجز الوقائع التي تم مطابقتها وتحليلها بالذكاء الاصطناعي</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-bold pt-2 border-t border-zinc-200/5">
                <div className={`p-4 rounded-xl border ${isDark ? "bg-white/[0.01] border-white/5" : "bg-zinc-50 border-zinc-100"}`}>
                  <span className="opacity-50 block">تصنيف المسألة ونوع القضية:</span>
                  <span className="opacity-95 mt-1 block text-[13px]">{consultation.lawyerSpecialty}</span>
                </div>
                <div className={`p-4 rounded-xl border ${isDark ? "bg-white/[0.01] border-white/5" : "bg-zinc-50 border-zinc-100"}`}>
                  <span className="opacity-50 block">الوقائع والبيانات المستهدفة:</span>
                  <span className="opacity-95 mt-1 block text-[13px] leading-relaxed">
                    {consultation.questionText || "تأصيل الوقائع التي تم إدخالها وتطويرها في الاستبيان"}
                  </span>
                </div>
              </div>
            </div>

            {/* Direct Assessment Opinion Card */}
            <div className={`p-6 rounded-[2rem] border relative space-y-4 ${cardBg}`}>
              <div className="flex items-center justify-between border-b border-zinc-200/5 pb-3">
                <div className="flex items-center gap-2 text-emerald-500">
                  <ShieldCheck size={20} weight="fill" />
                  <span className="text-[13px] font-black uppercase tracking-wider">رأي المساعد الذكي والتشخيص القانوني</span>
                </div>

                <button
                  onClick={handleCopyReport}
                  className={`p-2 rounded-xl border text-[11px] font-black transition-all flex items-center gap-1.5 ${
                    copied
                      ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                      : isDark
                        ? "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                        : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <Copy size={14} />
                  <span>{copied ? "✓ تم نسخ التقرير" : "نسخ التقرير كامل"}</span>
                </button>
              </div>

              <div className={`p-5 rounded-2xl border leading-relaxed text-[13.5px] font-medium whitespace-pre-wrap ${
                isDark ? "bg-white/[0.01] border-white/5 text-zinc-200" : "bg-emerald-500/[0.01] border-emerald-500/5 text-zinc-800"
              }`}>
                {consultation.topic}
              </div>
            </div>

            {/* Expandable Statutory Provisions */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-zinc-500">
                <Scales size={18} weight="duotone" className="text-[#C8A762]" />
                <span className="text-[11px] font-extrabold uppercase tracking-wider">السندات ومواد الأنظمة ذات العلاقة</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {dynamicStatutes.map((s, idx) => {
                  const key = `${consultation.id}-${idx}`;
                  const isExpanded = expandedStatutes[key];
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleStatuteExpand(key)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer ${cardBg} hover:border-[#C8A762]/30`}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-[12.5px] font-black text-emerald-500">{s.title}</h4>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-black text-[#C8A762]">{s.subtitle}</span>
                          {isExpanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
                        </div>
                      </div>
                      
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.p
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 0.8 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="text-[11.5px] leading-relaxed mt-3 pt-3 border-t border-zinc-200/5"
                          >
                            {s.text}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Interactive Timeline Roadmap */}
            <div className={`p-6 rounded-[2rem] border relative space-y-4 ${cardBg}`}>
              <div className="flex items-center gap-2 text-zinc-500">
                <Clock size={18} weight="duotone" className="text-[#C8A762]" />
                <span className="text-[12px] font-extrabold uppercase tracking-wider">خريطة الطريق التنفيذية والخطوات المتبعة</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {roadmapSteps.map((act) => {
                  const isStepDone = completedRoadmapSteps.includes(act.step);
                  return (
                    <div
                      key={act.step}
                      onClick={() => toggleRoadmapStep(act.step)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isStepDone
                          ? "border-emerald-500/30 bg-emerald-500/5 opacity-75"
                          : isDark
                            ? "border-white/5 bg-zinc-950 hover:bg-white/[0.01]"
                            : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
                      }`}
                    >
                      <div className="flex gap-2.5 items-start">
                        <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded flex items-center justify-center border ${
                          isStepDone ? "bg-emerald-500 border-emerald-500 text-white" : "border-zinc-400"
                        }`}>
                          {isStepDone && <CheckCircle size={12} weight="fill" />}
                        </div>
                        
                        <div>
                          <h5 className={`text-[12px] font-black leading-tight ${isStepDone ? "line-through text-zinc-500" : ""}`}>
                            {act.title}
                          </h5>
                          <p className="text-[10px] text-zinc-500 mt-1 leading-normal">{act.desc}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions Toolbar */}
              <div className="pt-4 border-t border-zinc-200/5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-bold text-zinc-500">
                  يمكنك تحميل هذا الرأي القانوني كوثيقة PDF منسقة ومطبوعة رسمياً.
                </p>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleDownloadPDF}
                    className="px-5 py-2.5 rounded-xl bg-[#0B3D2E] hover:bg-[#0a3328] text-white text-[11px] font-black shadow-md flex items-center gap-2 border border-[#C8A762]/20"
                  >
                    <FileArrowUp size={14} weight="bold" />
                    <span>تنزيل التقرير الموثق PDF</span>
                  </motion.button>
                  <Link href={`/dashboard/client/consultation/new?escalate=${consultation.id}`}>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="px-4 py-2.5 rounded-xl bg-[#C8A762]/10 hover:bg-[#C8A762]/20 text-[#C8A762] text-[11px] font-black border border-[#C8A762]/20"
                    >
                      طلب مراجعة من محامٍ
                    </motion.button>
                  </Link>
                </div>
              </div>
            </div>

          </div>
        </main>

        {/* Branded Footer disclaimer */}
        <footer className={`flex-shrink-0 flex items-center justify-center gap-2 py-3 text-[11px] font-bold border-t ${
          isDark ? "text-zinc-600 border-white/5 bg-zinc-900/30" : "text-zinc-400 border-zinc-200 bg-zinc-50/30"
        }`}>
          <Warning size={14} weight="fill" /> الإجابات والتقارير لأغراض استرشادية فقط ولا تُعدّ استشارة قانونية رسمية ملزمة.
        </footer>
      </div>
    );
  }

  // ─── 2. LAWYER INTERACTIVE CHAT PANEL RENDER ────────────────────────────────

  const bg = isDark ? "bg-zinc-950" : "bg-zinc-50";
  const panelBg = isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-200/70";

  return (
    <div className={`flex h-[100dvh] flex-col ${bg}`} dir="rtl">

      {/* Header */}
      <header className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b backdrop-blur-[20px] ${isDark ? "bg-zinc-950/90 border-white/[0.06]" : "bg-white/90 border-zinc-200"}`}>
        <Link href="/dashboard/client/consultation">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-white/[0.06] hover:bg-white/[0.1] text-zinc-400" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"}`}>
            <ArrowRight size={17} />
          </motion.button>
        </Link>

        {/* Lawyer Info details */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <div className={`h-10 w-10 rounded-full ${consultation.lawyerColor} flex items-center justify-center shadow-md`}>
              <span className="text-white font-extrabold text-sm">{consultation.lawyerInitial}</span>
            </div>
            {consultation.status === "active" && (
              <span className="absolute -bottom-0.5 -end-0.5 flex h-3 w-3 rounded-full border-2 border-white dark:border-zinc-950 bg-emerald-500" />
            )}
          </div>
          <div className="min-w-0">
            <p className={`text-[14px] font-bold truncate ${isDark ? "text-white" : "text-zinc-900"}`}>
              {consultation.lawyerName}
            </p>
            <div className="flex items-center gap-1.5">
              <SealCheck size={11} weight="fill" className="text-[#C8A762]" />
              <span className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{consultation.lawyerSpecialty}</span>
            </div>
          </div>
        </div>

        {/* Session timer */}
        {consultation.status === "active" && (
          <div className={`hidden sm:flex items-center gap-1.5 rounded-xl px-3 py-1.5 ${isDark ? "bg-amber-900/30 border border-amber-700/30" : "bg-amber-50 border border-amber-200"}`}>
            <Clock size={13} className="text-amber-500" />
            <span className={`font-mono text-[12px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>{sessionTimeLeft}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <motion.button whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.93 }}
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-white/[0.06] text-zinc-400 hover:text-zinc-200" : "bg-zinc-100 text-zinc-600 hover:text-zinc-900"}`}>
            <Phone size={16} />
          </motion.button>
          <motion.button whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.93 }}
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-white/[0.06] text-zinc-400 hover:text-zinc-200" : "bg-zinc-100 text-zinc-600 hover:text-zinc-900"}`}>
            <Video size={16} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.93 }}
            onClick={() => setShowAIPanel(!showAIPanel)}
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${showAIPanel
              ? "bg-[#0B3D2E] text-[#C8A762]"
              : isDark ? "bg-white/[0.06] text-zinc-400 hover:text-zinc-200" : "bg-zinc-100 text-zinc-600 hover:text-zinc-900"
            }`}>
            <Robot size={16} />
          </motion.button>
        </div>
      </header>

      {/* Body */}
      {(chatLoading || chatNotice) && (
        <div className={`flex-shrink-0 px-4 py-2 text-center text-[11px] font-bold border-b ${
          isDark
            ? "bg-amber-900/20 border-amber-700/20 text-amber-300"
            : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
          {chatLoading ? "جارٍ تحميل المحادثة..." : chatNotice}
        </div>
      )}
      <SessionChatPane
        consultation={consultation}
        messages={messages}
        input={input}
        setInput={setInput}
        isRecording={isRecording}
        setIsRecording={setIsRecording}
        showAIPanel={showAIPanel}
        setShowAIPanel={setShowAIPanel}
        sessionTimeLeft={sessionTimeLeft}
        isDark={isDark}
        sendMessage={sendMessage}
      />
    </div>
  );
}
