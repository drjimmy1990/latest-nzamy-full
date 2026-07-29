"use client";

import { usePathname } from "next/navigation";
import { useLibraryStatus } from "@/hooks/useLibraryStatus";
import { useTheme } from "@/components/ThemeProvider";
import LibraryClosedNotice from "./LibraryClosedNotice";

/**
 * LibraryGuard — renders library content only while the library is open.
 *
 * Applied at LAYOUT level (src/app/{laws,precedents,book}/layout.tsx) rather
 * than per page, for three reasons:
 *   1. Hook safety — an early return inside an existing page component would
 *      skip that page's remaining hooks and break the rules of hooks.
 *   2. Coverage — every current AND future route in the section is protected
 *      automatically, including pages that render bundled/demo content without
 *      ever calling the API (those bypass the server-side gate entirely).
 *   3. It never mounts the children while closed, so no content fetches fire.
 *
 * This is defence in depth, NOT the enforcement boundary. The real enforcement
 * is libraryGate() on the API routes — a client guard alone would leave the
 * data one fetch away.
 */

/**
 * Paths that stay reachable even while the library is closed.
 *
 * /laws/subscribe is the plan/pricing page: it sells library access but renders
 * no statutory text, and blocking it would strand users who arrive from a
 * pricing link with a closure notice instead of an explanation.
 */
const ALWAYS_OPEN_PATHS = ["/laws/subscribe"];

export default function LibraryGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lib = useLibraryStatus();
  const { isDark } = useTheme();

  if (pathname && ALWAYS_OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <>{children}</>;
  }

  // Render nothing content-shaped until the status resolves. Rendering children
  // first would flash real statutory text to visitors while the library is
  // supposed to be closed.
  if (lib.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" dir="rtl">
        <div
          className={`h-8 w-8 animate-spin rounded-full border-2 border-t-transparent ${
            isDark ? "border-white/30" : "border-zinc-300"
          }`}
          role="status"
          aria-label="جارِ التحميل"
        />
      </div>
    );
  }

  // effectiveStatus already accounts for the admin bypass, so an admin keeps
  // working while the library is closed to everyone else.
  if (lib.effectiveStatus === "closed") {
    return <LibraryClosedNotice message={lib.message} />;
  }

  return <>{children}</>;
}
