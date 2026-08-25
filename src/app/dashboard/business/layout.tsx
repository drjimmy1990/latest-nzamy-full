"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import SharedSidebar from "@/components/dashboard/SharedSidebar";
import { EntityRouteGuard } from "@/components/dashboard/EntityRouteGuard";
import { UserTypeGuard } from "@/components/dashboard/UserTypeGuard";
import { Storefront, Wrench, ArrowLeft } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { isVisibleBusinessRoute } from "@/constants/navigation.sidebars.business";

/**
 * Business (Corporate) Dashboard Layout
 * Uses SharedSidebar (CORPORATE_SIDEBAR config from navigation.ts)
 *
 * Supports two modes:
 * - ERP (default): Full corporate legal department dashboard
 * - Service: Simplified view for companies without in-house lawyer
 *
 * The role toggle is a DEV/DEMO preview tool — in production the role
 * would come from the authenticated user's account, not a manual toggle.
 */
function ModeHandler({ setMode }: { setMode: (m: "erp" | "service") => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const m = searchParams.get("mode");
    if (m === "service") setMode("service");
    else setMode("erp");
    try { localStorage.setItem("nzamy_last_dashboard", "business"); } catch {}
  }, [searchParams, setMode]);
  return null;
}

/**
 * القسم قيد الإعداد — what a hidden corporate section renders instead of its page.
 *
 * The owner's ruling of 26 August (§3أ) took nineteen sections out of the
 * corporate sidebar because each renders invented cases, departments, employees
 * and invoices. Removing the link is not enough on its own: a company that
 * bookmarked one of those URLs, or that follows a link still standing in
 * CORPORATE_NAV, would land on the fabricated screen exactly as before. This is
 * what it sees instead.
 *
 * It states plainly that the section is not ready. It does not claim the data is
 * loading, and it does not redirect — a silent bounce would leave the company
 * wondering whether it had lost access to something it was paying for.
 */
function SectionNotReady({ isAr, isDark }: { isAr: boolean; isDark: boolean }) {
  return (
    <div className="max-w-xl mx-auto py-16 px-4 text-center">
      <div
        className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5 ${
          isDark ? "bg-white/[0.06]" : "bg-zinc-100"
        }`}
      >
        <Wrench size={26} className="text-ink-muted" />
      </div>
      <h1 className="text-xl font-black text-ink mb-3">
        {isAr ? "هذا القسم قيد الإعداد" : "This section is not ready yet"}
      </h1>
      <p className="text-sm leading-7 text-ink-muted mb-8">
        {isAr
          ? "لم يُربط هذا القسم ببيانات شركتك بعد، وقد أُخفي من القائمة حتى يجهز. ما كان يظهر فيه لم يكن يخصّك."
          : "This section is not connected to your company's data yet, so it has been hidden until it is. What it used to display was not yours."}
      </p>
      {/* No "contact us" line here on purpose. Naming a channel this cluster
          cannot verify — a page, a number, an inbox — would be the same defect
          in a smaller font. The back link is the only forward path claimed. */}
      <Link
        href="/dashboard/business"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-royal text-gold text-sm font-bold hover:bg-royal-light transition-colors"
      >
        <ArrowLeft size={16} className={isAr ? "" : "rotate-180"} />
        {isAr ? "العودة إلى لوحة الشركة" : "Back to the company dashboard"}
      </Link>
    </div>
  );
}

export default function BusinessDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<"erp" | "service">("erp");
  const { lang, isDark } = useTheme();
  const isAr = lang === "ar";
  const pathname = usePathname() ?? "";
  const { userType } = useUser();

  // The nineteen hidden sections stay in the tree, so the URL still resolves.
  // Refuse to RENDER them rather than redirecting after the fact: a
  // useEffect + router.replace paints the invented kanban for a frame first,
  // which is the one thing this change exists to stop.
  //
  // The admin passes through. UserTypeGuard above deliberately admits
  // ["corporate", "admin"] so the platform owner can look at these pages; a
  // guard that bounced the admin too would remove the only way to inspect them.
  // While useUser is still resolving, userType is not yet "admin" and the
  // notice shows — the safe direction to be wrong in.
  const sectionHidden = userType !== "admin" && !isVisibleBusinessRoute(pathname);

  return (
    <UserTypeGuard allowedTypes={["corporate", "admin"]}>
      <div className="min-h-[100dvh] bg-surface dark:bg-dark-bg" dir={isAr ? "rtl" : "ltr"} suppressHydrationWarning>
        <Suspense fallback={null}>
          <ModeHandler setMode={setMode} />
        </Suspense>

        <SharedSidebar />

        <main className="lg:mr-64 pt-[60px] lg:pt-0 min-h-[100dvh]">

          {/* ── Service Mode indicator ── */}
          {mode === "service" && (
            <div className="mx-4 md:mx-6 mt-4 mb-0">
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-royal/8 dark:bg-royal/15 border border-royal/12 dark:border-royal/20">
                <Storefront size={15} className="text-royal dark:text-emerald-400" />
                <span className="text-xs font-bold text-royal dark:text-emerald-400">
                  {isAr ? "وضع طلب الخدمة — لا يوجد قسم قانوني داخلي" : "Service Mode — No Internal Legal Department"}
                </span>
              </div>
            </div>
          )}

          <div className="p-4 md:p-6 pt-4">
            {sectionHidden ? (
              <SectionNotReady isAr={isAr} isDark={isDark} />
            ) : (
              <EntityRouteGuard scope="business">
                {children}
              </EntityRouteGuard>
            )}
          </div>
        </main>

              </div>
    </UserTypeGuard>
  );
}


