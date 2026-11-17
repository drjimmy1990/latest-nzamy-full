/**
 * What the library assistant (LibraryAI in ./_ai-components.tsx) says when
 * POST /api/v1/ai/runs (tool library-assistant) answers with a refusal it can
 * act on.
 *
 * The run route lets the library assistant through for a signed-in user on
 * Pro or above, an admin, an active library subscriber or an active founder
 * member (src/app/api/ai/_libraryAiAccess.ts; owner ٥ as amended by ١٥,
 * 17 Nov 2026, replacing ٢٠٧): a guest gets 401, everyone else 403. Every
 * question costs points. So the 403 says the library subscription opens it
 * and links to /laws/subscribe. Neither message names a plan: the server's
 * own 403 JSON keeps requiredTier: 'pro'.
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
      text: "سجّل الدخول لتستخدم مساعد المكتبة.\nيفتحه اشتراك المكتبة، وكل سؤال بنقاط.",
      action: { label: "تسجيل الدخول", href: `/login?next=${encodeURIComponent(currentPath)}` },
    };
  }
  if (status === 403) {
    return {
      text: "المساعد الذكي للمكتبة غير مشمول في اشتراكك الحالي؛ يفتحه اشتراك المكتبة، وكل سؤال بنقاط.",
      action: { label: "اشترك في المكتبة", href: "/laws/subscribe" },
    };
  }
  if (status === 429) {
    return { text: "طلبات كثيرة خلال وقت قصير — حاول مجدداً بعد قليل." };
  }
  return null;
}
