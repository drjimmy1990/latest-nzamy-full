"use client";

/**
 * OrderTimeline.tsx — Task 6, Step 2.
 *
 * Three-stage progress strip for an AI-fulfilled order (`receiver:
 * "ai_workspace"`), derived purely from `order.status`. Rendered by the
 * order detail page for every status except "cancelled" (which shows its
 * own, unrelated panel instead — a cancelled order was never going to
 * finish this journey, so a partially-filled progress bar there would
 * misrepresent what happened) and the out-of-band catch-all statuses the
 * page's fifth branch exists for (values ServiceOrder["status"] doesn't
 * model at all, so there is no sane "reached" mapping for them).
 */

const STAGES = [
  { key: "sent", label: "تم الإرسال" },
  { key: "working", label: "قيد التدقيق والصياغة" },
  { key: "ready", label: "جاهز للتحميل" },
] as const;

// The three statuses during which the order is still open — i.e. nothing
// has been delivered or cancelled yet. Shared with page.tsx's own branching
// so "which panel shows the delivery-time card" and "which statuses count as
// still-open" never drift apart into two different lists.
const OPEN_STATUSES = new Set(["pending_assignment", "assigned", "in_review"]);

export function OrderTimeline({ status, isDark }: { status: string; isDark: boolean }) {
  const reached =
    status === "completed" ? 3 :
    status === "assigned" || status === "in_review" ? 2 : 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap" dir="rtl">
        {STAGES.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold ${
              i < reached ? "bg-[#0B3D2E] text-white"
                          : isDark ? "bg-white/5 text-zinc-500" : "bg-zinc-100 text-zinc-400"}`}>
              {i < reached ? "✓" : i + 1}
            </div>
            <span className={`text-[11px] ${i < reached
              ? isDark ? "text-zinc-200" : "text-zinc-800"
              : isDark ? "text-zinc-500" : "text-zinc-400"}`}>{s.label}</span>
            {i < STAGES.length - 1 && <div className={`h-px w-6 ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />}
          </div>
        ))}
      </div>

      {/*
       * Delivery-time expectation card — owner-ruled, 2026-08-20 review.
       * It was raised with him that nothing in the system enforces a
       * ٤–٢٤ ساعة window, and that the predecessor plan removed this exact
       * claim from BetaReviewGate for that reason. He reaffirmed it should
       * ship here anyway, on two conditions that are both load-bearing:
       *
       *   1. Shown ONLY while the order is still open (this Set). On a
       *      delivered or cancelled order it would be noise at best and a
       *      contradiction at worst — the client is looking at an outcome,
       *      not a wait.
       *   2. Worded as "متوسط" (an expected average), never a promise verb
       *      — the Arabic must not read as a commitment the platform
       *      cannot keep, since nothing enforces it.
       *
       * Do not soften this further and do not omit it — both would undo a
       * decision the owner already made explicitly.
       */}
      {OPEN_STATUSES.has(status) && (
        <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
          متوسط وقت التسليم المتوقع: خلال ٤ – ٢٤ ساعة
        </p>
      )}
    </div>
  );
}
