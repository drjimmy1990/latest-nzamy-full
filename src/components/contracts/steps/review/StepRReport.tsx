import { motion } from "framer-motion";
import { ShieldCheck, DownloadSimple, ShareNetwork } from "@phosphor-icons/react";
import ClientSharePanel from "@/components/contracts/ClientSharePanel";
import { WargameSection } from "@/components/draft/steps/WargameSection";
import AiResultActions from "@/components/AiResultActions";

interface StepRReportProps {
  isDark: boolean;
  shareLink: string | null;
  sharePasscode: string | null;
  linkCopied: boolean;
  setLinkCopied: (v: boolean) => void;
  clientEmail: string;
  setClientEmail: (v: string) => void;
  clientPhone: string;
  setClientPhone: (v: string) => void;
  generateShareLink: () => void;
  setShareLink: (v: string | null) => void;
  setSharePasscode: (v: string | null) => void;
}

export function StepRReport({
  isDark, shareLink, sharePasscode, linkCopied, setLinkCopied, clientEmail,
  setClientEmail, clientPhone, setClientPhone, generateShareLink, setShareLink, setSharePasscode
}: StepRReportProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className={`${card} p-6 text-center space-y-4 shadow-sm`}>
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#C8A762]/10 mx-auto">
          <ShieldCheck size={32} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div>
          <p className={`font-bold text-[16px] mb-1 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>تم تجهيز تقرير المراجعة والمخاطر</p>
          <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>التقرير يشمل كافة البنود المحللة، والتعديلات التي اقترحتها، ومؤشر الخطر العام.</p>
        </div>

        <div className="flex gap-3 justify-center pt-2">
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-3 text-[13px] font-bold text-white shadow-sm">
            <DownloadSimple size={15} /> تنزيل التقرير (PDF)
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className={`flex items-center gap-2 rounded-xl border px-6 py-3 text-[13px] font-bold ${isDark ? "border-white/[0.1] text-zinc-300 hover:bg-white/[0.04]" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}>
            <DownloadSimple size={15} /> تنزيل التقرير (Word)
          </motion.button>
        </div>
      </div>

      {/* Unified Result Actions */}
      <div className={`pt-2 border-t ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`}>
        <AiResultActions
          text="تقرير مراجعة العقد — تم تجهيزه من محترف العقود."
          filename="contract-review-report"
          showVault
          showHumanReview
          className="justify-start"
        />
      </div>

      {/* ── محاكي الخصم (اختياري) ── */}
      <WargameSection isDark={isDark} />

      {/* Attachments Section for Report */}
      <div className={`${card} p-5 shadow-sm`}>
        <p className={`font-bold text-[13px] mb-3 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>مرفقات ترسل مع المراجعة (اختياري)</p>
        <p className={`text-[12px] mb-4 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>أضف مسودة معدلة بمعرفتك، أو تعليق صوتي، أو أي مستندات تدعم مراجعتك ليراها العميل بجانب التقرير النهائي.</p>
        <div className={`p-4 rounded-xl border-2 border-dashed text-center cursor-pointer transition-colors ${
          isDark ? "border-white/10 hover:border-[#C8A762]/30 hover:bg-white/5" : "border-zinc-300 hover:border-[#0B3D2E]/30 hover:bg-zinc-50"
        }`}>
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>اسحب وأفلت المرفقات أو انقر للرفع</p>
        </div>
      </div>

      <div className={`${card} p-5 shadow-sm border-2 ${isDark ? "border-[#C8A762]/20" : "border-amber-200/80"}`}>
        <div className="flex items-center gap-2 mb-4">
          <ShareNetwork size={16} className="text-[#C8A762]" weight="duotone" />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>مشاركة التقرير مع العميل</p>
        </div>

        <ClientSharePanel
          isDark={isDark}
          shareLink={shareLink}
          sharePasscode={sharePasscode}
          linkCopied={linkCopied}
          clientEmail={clientEmail}
          clientPhone={clientPhone}
          onEmailChange={setClientEmail}
          onPhoneChange={setClientPhone}
          onGenerate={generateShareLink}
          onCopy={() => { navigator.clipboard.writeText(shareLink!); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
          onReset={() => { setShareLink(null); setSharePasscode(null); }}
        />
      </div>
    </motion.div>
  );
}
