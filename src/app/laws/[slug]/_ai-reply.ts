/**
 * What the library assistant (LibraryAI in ./_ai-components.tsx) says when
 * POST /api/ai/library-chat answers with a refusal it can act on.
 *
 * The route lets through only signed-in users with full library access
 * (src/app/api/ai/_libraryAiAccess.ts): a guest gets 401, a tier below pro 403.
 * Before this, every non-ok answer read «قيد التفعيل», so once the n8n webhook
 * is live a guest or a free user would be told "coming soon" about a feature
 * that is live but closed to them.
 *
 * Returns null for everything else (503 not configured or library closed,
 * 5xx): the caller keeps its existing «قيد التفعيل» wording for those.
 */

export interface LibraryAiAction {
  label: string;
  href: string;
}

export interface LibraryAiRefusal {
  text: string;
  action?: LibraryAiAction;
}

/** `currentPath` is pathname + search of the page asking, for /login?next=. */
export function libraryAiRefusal(status: number, currentPath: string): LibraryAiRefusal | null {
  if (status === 401) {
    return {
      text: "سجّل الدخول لتستخدم مساعد المكتبة.\nالمساعد متاح لمشتركي المكتبة القانونية (باقة Pro أو أعلى).",
      action: { label: "تسجيل الدخول", href: `/login?next=${encodeURIComponent(currentPath)}` },
    };
  }
  if (status === 403) {
    return {
      text: "مساعد المكتبة متاح لمشتركي المكتبة القانونية (باقة Pro أو أعلى).\nاشترك لتسأل عن المواد وتستخرج نصوصها.",
      action: { label: "عرض باقات المكتبة", href: "/laws/subscribe" },
    };
  }
  if (status === 429) {
    return { text: "طلبات كثيرة خلال وقت قصير — حاول مجدداً بعد قليل." };
  }
  return null;
}
