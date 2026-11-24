"use client";

import SharedSidebar from "@/components/dashboard/SharedSidebar";

/**
 * The dashboard frame for the account pages every account type shares
 * (/dashboard/billing, /dashboard/offers): the viewer's own sidebar —
 * SharedSidebar picks it from the session's account type — instead of the
 * public site navbar.
 *
 * Live check of 13 Nov, row 12: «الفوترة» opened without the client's sidebar,
 * so a client who reached it had no way back into the dashboard but the
 * browser's back button. The same frame as dashboard/client/layout.tsx.
 *
 * Not a layout.tsx on /dashboard/billing on purpose: the receipt and credit
 * note under it are printable documents with their own screen-only navbar.
 */
export default function AccountDashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-surface dark:bg-dark-bg" dir="rtl" suppressHydrationWarning>
      <SharedSidebar />
      <div className="print-main lg:mr-64 pt-[calc(env(safe-area-inset-top)+60px)] lg:pt-0 min-h-[100dvh]">
        {children}
      </div>
    </div>
  );
}
