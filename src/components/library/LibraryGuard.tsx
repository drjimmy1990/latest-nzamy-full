"use client";

import { usePathname } from "next/navigation";
import { useLibraryStatus } from "@/hooks/useLibraryStatus";
import { useTheme } from "@/components/ThemeProvider";
import LibraryClosedNotice from "./LibraryClosedNotice";
import LibraryAccountLockedNotice from "./LibraryAccountLockedNotice";
import LibrarySecurityLockNotice, {
  LibraryDailyLimitBanner,
  LibraryReadWarningBanner,
  LibraryWeeklyLimitBanner,
} from "./LibrarySecurityLockNotice";
import LibraryPointsLockBanner from "./LibraryPointsLockBanner";
import { isCollectionReaderPath, isLawReaderPath, isOrderReaderPath } from "./libraryGuardPaths";

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

/**
 * `lawReaderGuardsItself` (only src/app/laws/layout.tsx passes it): a law's
 * reader, /laws/[slug], is guarded by its own layout, which renders this guard
 * around the reader and the public «عن هذا النظام» block and JSON-LD OUTSIDE
 * it (owner TODO P1-10) — the guard SSRs only a spinner, so anything inside
 * never reaches the first HTML. The section guard lets that path through
 * without reading the status; every other /laws page is guarded here as before
 * (libraryGuardPaths.ts lists the static siblings).
 */
export default function LibraryGuard({
  children,
  lawReaderGuardsItself = false,
  collectionReaderGuardsItself = false,
}: {
  children: React.ReactNode;
  lawReaderGuardsItself?: boolean;
  /** Only src/app/precedents/layout.tsx: /precedents/[slug] guards itself (owner 18 Nov, item 4.1). */
  collectionReaderGuardsItself?: boolean;
}) {
  const pathname = usePathname();
  // A decree's reader (/laws/orders/[slug]) guards itself as a law's does (owner 18 Nov, item 4.1).
  if (lawReaderGuardsItself && (isLawReaderPath(pathname) || isOrderReaderPath(pathname))) return <>{children}</>;
  if (collectionReaderGuardsItself && isCollectionReaderPath(pathname)) return <>{children}</>;
  return <GuardedContent pathname={pathname}>{children}</GuardedContent>;
}

function GuardedContent({ children, pathname }: { children: React.ReactNode; pathname: string | null }) {
  const lib = useLibraryStatus();
  const { isDark } = useTheme();
  const alwaysOpen = !!pathname && ALWAYS_OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Render nothing content-shaped until the status resolves. Rendering children
  // first would flash real statutory text to visitors while the library is
  // supposed to be closed — and, on /laws/subscribe, prices to an account whose
  // library is locked (owner item 9), so that page waits for the status too.
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

  // Owner item 9 (batch l8): the library is locked for this account's type —
  // every library page, /laws/subscribe included (no price, no buy button, no
  // library offer). Checked before anything mounts: the precedent and book
  // readers would otherwise fall back to their bundled copies.
  if (lib.accountLock) {
    return <LibraryAccountLockedNotice message={lib.accountLock.message} />;
  }

  if (alwaysOpen) return <>{children}</>;

  // effectiveStatus already accounts for the admin bypass, so an admin keeps
  // working while the library is closed to everyone else.
  if (lib.effectiveStatus === "closed") {
    return <LibraryClosedNotice message={lib.message} />;
  }

  // Owner note ١٣ C09: a library-only security lock. The reader pages turn a
  // refused API call into a generic error (or, for precedents and books, a
  // bundled copy), so the honest notice is shown here and the readers are not
  // mounted at all. The account itself is untouched.
  if (lib.securityLock) {
    return <LibrarySecurityLockNotice lock={lib.securityLock} />;
  }

  // Register 14 item 48 (batch l9): a subscriber below the 50-point minimum
  // reads what a visitor reads (the server decides); the banner says why and
  // offers the top-up. Owner note ١٣ C07 / register 14 item 8: at the daily
  // or 7-day cap the documents already opened today still open, and at the
  // daily warning (30) nothing is refused — each is a banner above the page.
  const quota = lib.readQuota;
  const banner = quota?.overDaily ? (
    <LibraryDailyLimitBanner quota={quota} />
  ) : quota?.overWeekly ? (
    <LibraryWeeklyLimitBanner quota={quota} />
  ) : quota?.warn ? (
    <LibraryReadWarningBanner quota={quota} />
  ) : null;
  // One shape whatever the banners: a banner appearing on the next status poll
  // (the 30th open) must not remount the reader under it.
  return (
    <>
      {lib.pointsLock ? <LibraryPointsLockBanner lock={lib.pointsLock} /> : null}
      {banner}
      {children}
    </>
  );
}
