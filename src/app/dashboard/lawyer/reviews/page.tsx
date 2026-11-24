"use client";

/**
 * «تقييمات العملاء» — /dashboard/lawyer/reviews.
 *
 * Old owner note (file 10 ب8, «وصول التقييم إلى المحامي»): a client's review
 * must reach the lawyer. This page was a «قريباً» stub while the real reviews
 * and the one-time reply already lived in the profile's «التقييمات» tab. It
 * now shows that same panel (`ReviewsPanel`, over /api/v1/reviews/mine and
 * /api/v1/reviews/[id]/response), and the «تقييم جديد على خدمتك» notification
 * opens here, so the lawyer lands on the review itself.
 */

import { useTheme } from "@/components/ThemeProvider";
import ReviewsPanel from "../_components/profile/ReviewsPanel";

export default function LawyerReviewsPage() {
  const { isDark } = useTheme();
  return (
    <div className="max-w-4xl mx-auto space-y-5" dir="rtl">
      <div>
        <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>تقييمات العملاء</h1>
        <p className={`mt-1 text-sm ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
          تقييمات عملائك على الخدمات التي أنجزتها، ويمكنك الرد على كل تقييم مرة واحدة.
        </p>
      </div>
      <ReviewsPanel isDark={isDark} />
    </div>
  );
}