"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, use } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { LockKey, CheckCircle, ChatCircleDots, ShieldCheck, FileText, DownloadSimple, Check, Quotes, Microphone, Paperclip } from "@phosphor-icons/react";
import { VoiceInput } from "@/components/ui/VoiceInput";

type SharePageProps = {
  params: Promise<{ token: string }>;
};

export default function ClientSharePage({ params }: SharePageProps) {
  const { isDark } = useTheme();
  // Unwrap parameters using React.use()
  const { token } = use(params);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState<"view"|"notes">("view");
  const [clientNotes, setClientNotes] = useState("");
  const [actionSuccess, setActionSuccess] = useState<"approved"|"noted"|null>(null);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  const btnSecondary = isDark
    ? "border-white/[0.08] hover:bg-white/[0.04] text-zinc-300"
    : "border-zinc-200 hover:bg-zinc-50 text-zinc-700";

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (passcode.length === 6) {
      setIsAuthenticated(true);
      setError("");
    } else {
      setError("الرجاء إدخال باسكود صحيح مكون من 6 أرقام");
    }
  }

  function handleApprove() {
    setActionSuccess("approved");
  }

  function handleSubmitNotes() {
    if (!clientNotes.trim()) return;
    setActionSuccess("noted");
  }

  if (!isAuthenticated) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? "bg-[#0A0A0A]" : "bg-zinc-50"}`}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} 
          className={`w-full max-w-sm p-8 text-center shadow-xl ${card}`}>
          <div className={`mx-auto w-16 h-16 flex items-center justify-center rounded-2xl mb-6 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
            <LockKey size={32} className="text-[#C8A762]" weight="duotone" />
          </div>
          <h1 className={`text-xl font-bold mb-2 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>مستند محمي</h1>
          <p className={`text-[13px] mb-6 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            يرجى إدخال رمز المرور (Passcode) المكون من 6 أرقام للوصول إلى المستند المرسل من نظامي.
          </p>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <input 
                type="text" 
                maxLength={6}
                value={passcode}
                onChange={e => setPasscode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className={`w-full text-center tracking-[0.5em] font-mono text-xl py-3 rounded-xl border outline-none transition-colors ${
                  error ? "border-red-500/50 bg-red-500/5 text-red-500" : 
                  isDark ? "border-white/[0.1] bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-700" : "border-zinc-300 bg-zinc-50 text-zinc-800 placeholder:text-zinc-300"
                }`}
              />
              {error && <p className="text-red-500 text-[11px] font-bold mt-2">{error}</p>}
            </div>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit"
              className="w-full py-3 rounded-xl bg-[#C8A762] text-white font-bold text-[14px] shadow-lg shadow-[#C8A762]/20">
              فتح المستند
            </motion.button>
          </form>
          <p className={`mt-6 text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            مشفر ومحمي بواسطة نظامي للذكاء الاصطناعي القانوني
          </p>
        </motion.div>
      </div>
    );
  }

  if (actionSuccess === "approved") {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? "bg-[#0A0A0A]" : "bg-zinc-50"}`}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-md p-8 text-center ${card} border-emerald-500/30`}>
          <div className="mx-auto w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-5">
            <CheckCircle size={40} className="text-emerald-500" weight="fill" />
          </div>
          <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>تم اعتماد المستند بنجاح!</h2>
          <p className={`text-[14px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            نشكرك. تم إشعار المحامي ونسخة الاعتماد محفوظة بأمان في سجل الأعمال الخاص بك.
          </p>
        </motion.div>
      </div>
    );
  }

  if (actionSuccess === "noted") {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? "bg-[#0A0A0A]" : "bg-zinc-50"}`}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-md p-8 text-center ${card} border-blue-500/30`}>
          <div className="mx-auto w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mb-5">
            <ChatCircleDots size={40} className="text-blue-500" weight="fill" />
          </div>
          <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>تم إرسال ملاحظاتك</h2>
          <p className={`text-[14px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            تم توجيه جميع ملاحظاتك للمحامي للمراجعة. سيتم إرسال المستند المحدث فور الانتهاء.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-20 ${isDark ? "bg-[#0A0A0A] text-zinc-300" : "bg-zinc-50 text-zinc-800"}`}>
      {/* Header */}
      <header className={`sticky top-0 z-10 px-4 py-3 sm:px-8 sm:py-4 flex items-center justify-between border-b backdrop-blur-md ${isDark ? "border-white/[0.05] bg-[#0A0A0A]/80" : "border-zinc-200 bg-white/80"}`}>
        <div className="flex items-center gap-3">
           <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
             <span className="font-bold text-[#C8A762] text-lg">N</span>
           </div>
           <div>
             <h1 className={`text-[14px] font-bold leading-tight ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>مسودة عقد عمل (شركة مساهمة)</h1>
             <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>مرسل من: المحامي أحمد فهد • يرجى المراجعة والاعتماد</p>
           </div>
        </div>
        <div className="flex items-center gap-2">
           <button className={`hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg border text-[12px] font-bold ${btnSecondary}`}>
             <DownloadSimple size={14} /> تحميل نسخة
           </button>
           <button onClick={handleApprove} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] font-bold shadow-lg shadow-emerald-500/20">
             <ShieldCheck size={14} weight="fill" /> اعتماد العقد
           </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-4 sm:p-8 mt-4">
        
        {/* Mobile Download */}
        <button className={`sm:hidden w-full mb-6 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-[13px] font-bold ${btnSecondary}`}>
           <DownloadSimple size={16} /> تحميل المستند للمراجعة
        </button>

        {/* Tabs for Reading or Revisions */}
        <div className={`flex p-1 mb-8 rounded-xl border ${isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-zinc-100 border-zinc-200"}`}>
          <button onClick={() => setActiveTab("view")} 
            className={`flex-1 py-2 text-[13px] font-bold rounded-lg transition-colors ${activeTab === "view" ? (isDark ? "bg-zinc-800 text-white shadow-sm" : "bg-white text-zinc-900 shadow-sm") : "text-zinc-500 hover:text-zinc-400"}`}>
            قارئ المستند
          </button>
          <button onClick={() => setActiveTab("notes")} 
            className={`flex-1 flex justify-center items-center gap-2 py-2 text-[13px] font-bold rounded-lg transition-colors ${activeTab === "notes" ? (isDark ? "bg-zinc-800 text-white shadow-sm" : "bg-white text-zinc-900 shadow-sm") : "text-zinc-500 hover:text-zinc-400"}`}>
            طلب تعديلات <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${activeTab === "notes" ? "bg-[#C8A762] text-white" : isDark ? "bg-zinc-800" : "bg-zinc-200"}`}>مهم</span>
          </button>
        </div>

        {activeTab === "view" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`p-8 sm:p-12 min-h-[600px] text-[14px] leading-loose shadow-xl rounded-2xl border ${isDark ? "bg-[#111] border-white/[0.1] text-zinc-300" : "bg-white border-zinc-200 text-zinc-800"}`}>
            <h2 className="text-center text-xl font-bold mb-8">عقد عمل محدد المدة</h2>
            <p className="mb-4">إنه في يوم الإثنين الموافق 1445/08/12هـ، تم الاتفاق بين كل من:</p>
            <p className="mb-4">
              <strong>الطرف الأول (الشركة):</strong> شركة التقنية المتقدمة، سجل تجاري رقم (1010101010)...
            </p>
            <p className="mb-6">
              <strong>الطرف الثاني (الموظف):</strong> السيد/ عبد الله محمد، هوية وطنية رقم (10xxxxxx)...
            </p>
            
            <h3 className="font-bold text-lg mt-8 mb-4 border-b pb-2">البند الأول: مجال العمل والمهام</h3>
            <p className="mb-4 text-justify">
              يعمل الطرف الثاني لدى الطرف الأول بصفتة (مهندس برمجيات أول) ويكون مسؤولاً عن تنفيذ المشاريع الموكلة إليه، والالتزام بأوقات الدوام الرسمية وهي 48 ساعة أسبوعياً. 
            </p>

            <h3 className="font-bold text-lg mt-8 mb-4 border-b pb-2">البند الثاني: الراتب والبدلات</h3>
            <p className="mb-4 text-justify">
              يتقاضى الطرف الثاني راتباً أساسياً قدره (15,000) ريال سعودي مقطوعاً يضاف إليه بدل سكن مقداره...
            </p>

            <div className="mt-20 pt-8 border-t border-dashed flex justify-between gap-8">
               <div className="flex-1 text-center">
                 <p className="font-bold mb-8">الطرف الأول</p>
                 <span className="text-zinc-400 text-[12px]">(التوقيع الإلكتروني معتمد)</span>
               </div>
               <div className="flex-1 text-center">
                 <p className="font-bold mb-8">الطرف الثاني</p>
                 <span className="text-zinc-400 text-[12px]">(بانتظار الاعتماد)</span>
               </div>
            </div>
          </motion.div>
        )}

        {activeTab === "notes" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`p-6 shadow-sm rounded-2xl ${card}`}>
             <div className="flex items-center gap-3 mb-4">
               <Quotes size={24} className="text-[#C8A762]" weight="duotone" />
               <h3 className={`text-lg font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>هل لديك تعديلات قبل الاعتماد؟</h3>
             </div>
             <p className={`text-[13px] mb-6 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
               إذا رفضت الاعتماد بسبب بنود معينة، يرجى توضيحها هنا بدقة وسيقوم الذكاء الاصطناعي الخاص بالمحامي بصياغة التعديلات نيابة عنك بناءً على طلبك.
             </p>

             <div className="relative mb-6">
               <textarea 
                 value={clientNotes}
                 onChange={e => setClientNotes(e.target.value)}
                 className={`w-full min-h-[150px] p-4 rounded-xl border mb-3 outline-none ${
                   isDark ? "bg-zinc-800/50 border-white/[0.1] focus:border-[#C8A762]/50 text-zinc-100" 
                          : "bg-zinc-50 border-zinc-200 focus:border-[#C8A762]/50 text-zinc-800"
                 }`}
                 placeholder="مثال: يرجى تعديل البند الثاني ليصبح الراتب الأساسي 18,000 ريال، وإلغاء البند الخاص بعدم المنافسة..."
               />
               <div className="flex flex-col sm:flex-row gap-3">
                 <button className={`flex-1 flex justify-center items-center gap-2 px-3 py-3 rounded-xl border text-[13px] font-bold ${btnSecondary}`}>
                   <Microphone size={18} /> تسجيل ملاحظة صوتية
                 </button>
                 <button className={`flex-1 flex justify-center items-center gap-2 px-3 py-3 rounded-xl border text-[13px] font-bold ${btnSecondary}`}>
                   <Paperclip size={18} /> إرفاق مسودة خارجية
                 </button>
               </div>
             </div>

             <motion.button onClick={handleSubmitNotes} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
               disabled={!clientNotes.trim()}
               className={`w-full py-4 rounded-xl font-bold text-[14px] flex justify-center items-center gap-2 transition-all ${
                 clientNotes.trim() 
                 ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                 : isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-200 text-zinc-500"
               }`}>
               <ChatCircleDots size={18} weight="fill" /> إرسال الملاحظات لإعادة الصياغة
             </motion.button>
          </motion.div>
        )}

      </main>
    </div>
  );
}
