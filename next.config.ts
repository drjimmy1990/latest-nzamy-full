import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Image optimisation ──────────────────────────────────────────────────────
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    remotePatterns: [
      // Blog cover images live in the public Supabase Storage bucket `blog-covers`.
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async headers() {
    return [
      {
        // Prevent browser from caching /ai/wargaming (bust stale 301)
        source: "/ai/wargaming",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
      {
        // Same treatment, and for a sharper reason than /ai/wargaming's.
        //
        // /ai/orders was linked from EIGHT sidebars before owner item ٩٩
        // removed them, and this file used to redirect it itself with
        // `permanent: true` — a 308 a browser caches and resolves without ever
        // asking the server again. That redirect now lives entirely in
        // src/proxy.ts, as a 302 (see its /ai/orders block): the eventual
        // destination for a lawyer/firm/micro/provider/government/ngo account
        // depends on Gate 2's session-aware RBAC redirect a few lines further
        // into that same file, and only proxy.ts reads the session at all.
        // This header stays regardless of which file issues the redirect: it
        // exists to bust any 308 a browser already cached from before that
        // move, so nobody who bookmarked the old link is pinned to a
        // permanent-redirect response for as long as its browser keeps the
        // cached entry — the whole reason proxy.ts's block would otherwise
        // never get a chance to run for them.
        //
        // Scoped to the bare path, not /ai/orders/:id. The detail page needs
        // no such header: src/proxy.ts never redirects it, for any role — see
        // its /ai/orders comment for why (it is the live order-detail screen
        // four AI tools send a freshly-submitted order to, not a stale link).
        source: "/ai/orders",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },

  /**
   * Permanent redirects for routes this build deleted.
   * ───────────────────────────────────────────────────────────────────────────
   * These are the server half of owner items ١١٨/١١٩ (الأرشيف), ١٢٦/١٢٧
   * (الشبكة المهنية) and ١٣٤/١٣٥ (العروض الترويجية). Each deleted page was
   * reachable by URL as well as by sidebar link, so removing the link alone
   * would have left a bookmark, a stale notification href or a search-engine
   * result landing on a 404.
   *
   * They live here rather than in src/proxy.ts on purpose: proxy.ts already
   * carries a REDIRECTS map, but it runs per request behind a Supabase session
   * read. These three destinations do not depend on who is asking, so they
   * belong in the static table Next resolves before it ever touches the
   * filesystem.
   *
   * Owner items ٩٩/١٠٠ (/ai/orders) used to be listed here too. Its eventual
   * destination can depend on the caller's role — routeAccess.ts restricts
   * /dashboard/client/requests to individual/corporate, so a lawyer, firm,
   * micro, provider, government or ngo account that lands there gets bounced
   * onward by proxy.ts's own RBAC gate — and this file's redirects() runs
   * BEFORE src/proxy.ts on every request (Next's documented order:
   * next.config headers → next.config redirects → middleware → filesystem
   * routes) and cannot read the session, so it cannot make that call — a rule
   * left here would answer every hit before proxy.ts ever saw the request.
   * The whole redirect now lives in src/proxy.ts's own /ai/orders block. The
   * Cache-Control header above stays.
   *
   * `permanent: true` emits 308 — a permanent redirect that, unlike 301,
   * preserves the request method. Every source below is a GET navigation, so
   * the distinction is invisible to users and the semantics the owner asked
   * for («301 دائم») are the ones delivered.
   *
   * NOTE ON PRECEDENCE, because it decides what may be listed here: redirects()
   * is evaluated BEFORE filesystem routes. Any source added to this array
   * shadows a real page at the same path, whether or not that page still
   * exists.
   */
  async redirects() {
    return [
      // ── Owner ١١٨ + ١١٩ — الأرشيف الموحّد ──────────────────────────────
      // The page was a «قريباً» template: no shared archive store exists. The
      // documents vault is the real store of the same material.
      { source: "/dashboard/lawyer/archive", destination: "/dashboard/lawyer/documents", permanent: true },
      { source: "/dashboard/lawyer/archive/:path*", destination: "/dashboard/lawyer/documents", permanent: true },

      // ── Owner ١٢٦ + ١٢٧ — الشبكة المهنية ───────────────────────────────
      // Also a «قريباً» template. It points at the professional profile rather
      // than at a marketplace collaboration tab, because that tab does not
      // exist yet and a redirect into a 404 is worse than the page it replaces.
      { source: "/dashboard/lawyer/network", destination: "/dashboard/lawyer/profile", permanent: true },
      { source: "/dashboard/lawyer/network/:path*", destination: "/dashboard/lawyer/profile", permanent: true },

      // ── Owner ١٣٤ + ١٣٥ — العروض الترويجية (حذف نظامي) ─────────────────
      // القاعدة ٣٨ forbids a lawyer advertising discounts, so this is a
      // regulatory deletion and not a deferral: there is no "restore when
      // built" note on it, unlike the archive above.
      { source: "/dashboard/lawyer/promotions", destination: "/dashboard/lawyer/profile", permanent: true },
      { source: "/dashboard/lawyer/promotions/:path*", destination: "/dashboard/lawyer/profile", permanent: true },
      // The provider carried a second copy of the same screen — and a working
      // one, generating discount links off mock data. Same rule, same
      // destination shape.
      { source: "/dashboard/provider/promotions", destination: "/dashboard/provider/profile", permanent: true },
      { source: "/dashboard/provider/promotions/:path*", destination: "/dashboard/provider/profile", permanent: true },
    ];
  },
};

export default nextConfig;
