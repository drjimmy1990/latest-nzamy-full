/**
 * What the library assistant (LibraryAI in ./_ai-components.tsx) says when
 * POST /api/ai/library-chat answers with a refusal it can act on.
 *
 * The route lets through only signed-in users on Pro or above, or an admin
 * (src/app/api/ai/_libraryAiAccess.ts): a guest gets 401, everyone else 403.
 * That includes a library-only subscriber: the library subscription opens the
 * texts, not the assistant (owner answer ٢٠٧), so neither message calls the
 * assistant a library-subscription feature and the 403 links to the plans page,
 * not to /laws/subscribe. Neither names a plan either: /pricing shows lawyers
 * «المحامي المحترف» and everyone else the individuals tab, so no plan there
 * reads "Pro" (the server's own 403 JSON keeps requiredTier: 'pro').
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
      text: "سجّل الدخول لتستخدم مساعد المكتبة.\nاشتراك المكتبة يشمل النصوص دون المساعد.",
      action: { label: "تسجيل الدخول", href: `/login?next=${encodeURIComponent(currentPath)}` },
    };
  }
  if (status === 403) {
    return {
      text: "المساعد الذكي للمكتبة غير مشمول في اشتراكك الحالي؛ اشتراك المكتبة يشمل النصوص دون المساعد.",
      action: { label: "عرض الباقات", href: "/pricing" },
    };
  }
  if (status === 429) {
    return { text: "طلبات كثيرة خلال وقت قصير — حاول مجدداً بعد قليل." };
  }
  return null;
}
