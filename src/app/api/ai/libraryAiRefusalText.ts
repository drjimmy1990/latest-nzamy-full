/**
 * The two 403 sentences of the library AI gate (_libraryAiAccess.ts),
 * N05-L11/12 (batch l11): plain Arabic naming the real plans as the law reader
 * names them («باقة المكتبة القانونية», «الباقة الاحترافية»), never "Pro".
 * The assistant's price per question comes from the tool registry
 * (toolPointsDisplay.ts) and the browse minimum from pointsGate.ts (register
 * 14 item 48), so no number is typed here.
 *
 * Pure (imports src/lib only): `node --test` loads it (library-ai-access.test.ts).
 */
import { aiToolPriceText } from "../../../lib/ai/toolPointsDisplay.ts";
import { LIBRARY_MIN_POINTS_DEFAULT } from "../../../lib/library/pointsGate.ts";
import { toArabicDigits } from "../../../lib/services/arabicCount.ts";

/** The library assistant: library subscribers (founders included) and the professional plan or higher. */
export const LIBRARY_ASSISTANT_REFUSAL_AR =
  `مساعد المكتبة الذكي متاح لمشتركي باقة المكتبة القانونية والأعضاء المؤسسين ومشتركي الباقة الاحترافية أو أعلى، ` +
  `والسؤال الواحد عليه ${aiToolPriceText("library-assistant", "ar")} من رصيدك، ` +
  `وتبقى المكتبة مفتوحة للمشترك ما دام رصيده لا يقل عن ${toArabicDigits(LIBRARY_MIN_POINTS_DEFAULT)} نقطة.`;

/** The other library AI tools: the professional plan or higher only. */
export const LIBRARY_TOOL_REFUSAL_AR =
  "هذه الأداة تجيب من نصوص المكتبة القانونية، وهي متاحة لمشتركي الباقة الاحترافية أو أعلى.";
