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
        // /ai/orders redirects permanently below, and it was linked from EIGHT
        // sidebars before owner item ٩٩ removed them — so a large share of
        // existing users have already visited it and will cache that redirect.
        // A cached permanent redirect is resolved inside the browser: the
        // request never leaves the machine, and no server-side change can
        // reach it.
        //
        // That matters because the redirect below is only half of owner item
        // ١٠٠, which asks for a ROLE-BASED destination. The other half belongs
        // in src/proxy.ts, which sees the session this file cannot. Without
        // this header, every lawyer, firm, provider, government reviewer and
        // arbitrator who follows the link once between now and then is pinned
        // to /dashboard/client/requests — a route routeAccess.ts refuses them —
        // for as long as their browser keeps the entry, and the eventual fix
        // silently misses exactly the users who need it most.
        //
        // Scoped to the bare path, matching the redirect's own scope:
        // /ai/orders/:id is neither redirected nor deleted and must stay
        // cacheable.
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
   * These are the server half of owner items ٩٩/١٠٠ (/ai/orders), ١١٨/١١٩
   * (الأرشيف), ١٢٦/١٢٧ (الشبكة المهنية) and ١٣٤/١٣٥ (العروض الترويجية). Each
   * deleted page was reachable by URL as well as by sidebar link, so removing
   * the link alone would have left a bookmark, a stale notification href or a
   * search-engine result landing on a 404.
   *
   * They live here rather than in src/proxy.ts on purpose: proxy.ts already
   * carries a REDIRECTS map, but it runs per request behind a Supabase session
   * read. These four destinations do not depend on who is asking, so they
   * belong in the static table Next resolves before it ever touches the
   * filesystem.
   *
   * `permanent: true` emits 308 — a permanent redirect that, unlike 301,
   * preserves the request method. Every source below is a GET navigation, so
   * the distinction is invisible to users and the semantics the owner asked
   * for («301 دائم») are the ones delivered.
   *
   * NOTE ON PRECEDENCE, because it decides what may be listed here: redirects()
   * is evaluated BEFORE filesystem routes. Any source added to this array
   * shadows a real page at the same path, whether or not that page still
   * exists. That is why /ai/orders/:id is deliberately absent — see below.
   */
  async redirects() {
    return [
      // ── Owner ٩٩ + ١٠٠ — «طلباتي الذكية» ────────────────────────────────
      // The /ai/orders LIST page was a second copy of «طلباتي»
      // (/dashboard/client/requests): same rows, same source
      // (listMyServiceOrders), a different name in the sidebar. One central
      // request log, so the duplicate list is gone and its URL points at the
      // survivor.
      //
      // Scoped to the exact path. /ai/orders/:id is NOT redirected and its page
      // is NOT deleted: it is the only screen in the app that shows a client
      // their own uploaded attachments and downloads the file the team
      // delivers, and «طلباتي» itself links into it
      // (dashboard/client/requests/page.tsx, «فتح صفحة الطلب الكاملة»).
      // Redirecting it here would have shadowed that page, turned that button
      // into a loop back to the list it was clicked from, and broken the
      // orderUrl the fulfilment webhook mails out
      // (api/v1/admin/service-orders/[id]/route.ts).
      { source: "/ai/orders", destination: "/dashboard/client/requests", permanent: true },

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
