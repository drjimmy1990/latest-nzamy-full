"use client";

import { useTheme } from "@/components/ThemeProvider";
import AiHistoryList from "@/components/ai/AiHistoryList";

/**
 * /dashboard/lawyer/ai/history — «سجلّي» (L11-log, owner file 03 ل11, batch
 * l12): every AI run of the signed-in account, newest first, with a filter per
 * tool, the per-run delete and the link to each full answer. Linked from the
 * «ذكاء نظامي» group of the lawyer sidebar — the owner's stated exception to
 * «القائمة الجانبية كما هي» (20 Nov). The list is the account's own and
 * nobody else's (GET /api/v1/ai/history).
 */
export default function AiHistoryPage() {
  const { isDark } = useTheme();
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6" dir="rtl">
      <div>
        <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>سجلّي</h1>
        <p className={`mt-1 text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
          معاملاتك السابقة مع أدوات الذكاء الاصطناعي: السؤال والجواب والنقاط المخصومة. السجل لك وحدك، ولك أن تحذف أي معاملة منه،
          ويُمسح نص المعاملات تلقائياً بعد مدة الحفظ التي تحددها المنصة.
        </p>
      </div>
      <AiHistoryList isDark={isDark} />
    </div>
  );
}
