import type { NextConfig } from "next";
import { privateRobotsHeaderRules } from "./src/lib/publicSeo/privatePages.ts";
import { CSP_REPORT_GROUP, CSP_REPORT_PATH } from "./src/lib/security/cspReport.ts";

// ── Supabase Storage host, derived from the runtime env ─────────────────────
// Blog cover images (and any other public Storage object) are served from
// `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/<bucket>/...`. This
// used to be hardcoded to `*.supabase.co`, which is only true for Supabase
// CLOUD projects; a self-hosted instance (e.g. https://auth.nezamy.sa) has an
// arbitrary hostname, so next/image would throw
// "Invalid src prop ... hostname is not configured" for every cover on that
// host. Deriving the pattern from the same env var the Supabase client itself
// uses keeps this in sync with whichever backend is configured, with no
// separate "self-hosted host" variable to remember to set.
//
// Guarded: `next.config.ts` loads before any request-time validation runs
// (including src/instrumentation.ts's own assertion), so an unset or
// malformed URL must not crash `next build`/`next dev` — it just means no
// dynamic host is added, and Storage images from that host will 404 out of
// next/image until the env var is fixed (a loud, easy-to-diagnose failure,
// not a boot crash).
function supabaseStorageRemotePattern() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    const { protocol, hostname, port } = new URL(raw);
    if (protocol !== "http:" && protocol !== "https:") return null;
    return {
      protocol: protocol.slice(0, -1) as "http" | "https",
      hostname,
      ...(port ? { port } : {}),
      pathname: "/storage/v1/object/public/**",
    };
  } catch {
    return null;
  }
}

const dynamicSupabasePattern = supabaseStorageRemotePattern();

// ── Security headers (audit WEB-01 / WEB-02 / WEB-03, 2026-11-09) ──────────
// Kept here, in one place in the repo, instead of nginx `add_header` lines on
// the server (which live traffic showed were never applied). Make sure nginx
// and Cloudflare do not add a second copy of any of them.
//
// - HSTS without `preload`: preload is a one-way door for every subdomain
//   (auth., n8n., staging.); it waits for the owner's decision.
// - X-Frame-Options DENY: nothing on our own site frames one of our pages
//   (the three <iframe>s show Google Maps, YouTube and a signed Storage link
//   on the Supabase host; the letter print frame is `srcdoc`, which the header
//   does not touch).
// - The Content-Security-Policy is REPORT-ONLY: the browser logs what it would
//   block, in the console, and blocks nothing. Since batch l9 (owner file 15
//   row 43) it also REPORTS each violation to /api/v1/security/csp-report
//   (report-uri, and report-to through the Reporting-Endpoints header), which
//   writes one «[csp-report]» line per distinct violation to the server log.
//   Owner register 24 / 71: enforce only after the payment test passes AND a
//   week of clean reports — read them with `docker logs <app> | grep csp-report`.
//   Owner 18 Nov, item 2.5 («تحويل CSP إلى enforce بعد المراجعة»): KEPT
//   report-only on 19 Nov — enforcing needs proof that every directive covers
//   what the live site loads, and none exists yet: no report-uri has ever
//   collected a violation; the Moyasar 3-D Secure and wallet flows (Apple Pay,
//   Google Pay, Samsung Pay) were never run under it; the Supabase origin is
//   read from NEXT_PUBLIC_SUPABASE_URL when this file loads (a build without it
//   would enforce a policy that blocks the whole backend); Cloudflare may
//   inject its own scripts (Web Analytics / Rocket Loader) from hosts not
//   listed here. To switch: run those flows with the browser console open,
//   list every «[Report Only]» line, add what is legitimate, then rename the
//   header key to Content-Security-Policy.
//
// CSP sources, each found in the code (2026-11-09):
//   'unsafe-inline' scripts  Next's inline bootstrap + the theme / service
//                            worker scripts in src/app/layout.tsx (no nonce)
//   challenges.cloudflare.com Turnstile (src/components/auth/useTurnstile.ts):
//                            script, frame, fetch
//   pay.google.com, applepay.cdn-apple.com, img.mpay.samsung.com
//                            wallet SDKs moyasar-payment-form injects
//   api.moyasar.com          the Moyasar form's API calls (base_url)
//   appsignal-endpoint.net   the Moyasar form's error reporting
//   fonts.googleapis.com / fonts.gstatic.com
//                            the consultation print window's <link>; the site
//                            itself self-hosts its fonts through next/font
//   the Supabase origin      NEXT_PUBLIC_SUPABASE_URL (auth.nezamy.sa): REST,
//                            auth and Storage over https, Realtime over wss,
//                            Storage images and the signed-link preview frame
//   www.google.com           the contact page's Maps embed
//   www.youtube-nocookie.com the home page's intro video
//   img-src https:           blog covers, avatars and a few remote images
//   blob: / data:            local previews, generated files, inline images
//   GA4 / Microsoft Clarity  ONLY when NEXT_PUBLIC_GA4_ID / NEXT_PUBLIC_CLARITY_ID
//                            are set at build (analyticsCspSources below); the
//                            scripts load after consent on public routes only
//                            (src/lib/analytics/analytics.ts)
//
// Analytics hosts, from Google's "Tag Manager / GA4 without Ads" CSP guide and
// Microsoft's Clarity CSP page (checked 2026-11-18): GA4 script
// www.googletagmanager.com, hits to *.google-analytics.com /
// *.analytics.google.com / *.google.com; Clarity script and data *.clarity.ms
// plus c.bing.com. img-src is already `https:`.
function analyticsCspSources(): { script: string[]; connect: string[] } {
  const ga4 = /^G-[A-Z0-9]{4,16}$/.test((process.env.NEXT_PUBLIC_GA4_ID ?? "").trim().toUpperCase());
  const clarity = /^[a-z0-9]{6,16}$/.test((process.env.NEXT_PUBLIC_CLARITY_ID ?? "").trim().toLowerCase());
  return {
    script: [
      ...(ga4 ? ["https://www.googletagmanager.com"] : []),
      ...(clarity ? ["https://*.clarity.ms"] : []),
    ],
    connect: [
      ...(ga4
        ? ["https://www.googletagmanager.com", "https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.google.com"]
        : []),
      ...(clarity ? ["https://*.clarity.ms", "https://c.bing.com"] : []),
    ],
  };
}

function supabaseCspOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const { protocol, host } = new URL(raw);
    if (protocol !== "http:" && protocol !== "https:") return [];
    return [`${protocol}//${host}`, `${protocol === "https:" ? "wss:" : "ws:"}//${host}`];
  } catch {
    return [];
  }
}

function contentSecurityPolicyReportOnly(): string {
  const [supabaseHttp, supabaseWs] = supabaseCspOrigins();
  const supabase = supabaseHttp ? [supabaseHttp] : [];
  const devEval = process.env.NODE_ENV === "production" ? [] : ["'unsafe-eval'"];
  const analytics = analyticsCspSources();
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'", "'unsafe-inline'", ...devEval,
      "https://challenges.cloudflare.com",
      "https://pay.google.com", "https://applepay.cdn-apple.com", "https://img.mpay.samsung.com",
      ...analytics.script,
    ],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "blob:", ...supabase],
    "connect-src": [
      "'self'", ...supabase, ...(supabaseWs ? [supabaseWs] : []),
      "https://api.moyasar.com", "https://appsignal-endpoint.net",
      "https://challenges.cloudflare.com", "https://pay.google.com",
      ...analytics.connect,
    ],
    "frame-src": [
      "'self'", "blob:", ...supabase,
      "https://www.google.com", "https://www.youtube-nocookie.com",
      "https://challenges.cloudflare.com", "https://pay.google.com",
    ],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", "https://api.moyasar.com"],
    "frame-ancestors": ["'none'"],
    // Batch l9 (file 15 row 43): where the violations go. report-uri for the
    // browsers that do not read report-to; same-origin, relative.
    "report-uri": [CSP_REPORT_PATH],
    "report-to": [CSP_REPORT_GROUP],
  };
  return Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

// Permissions-Policy (BACKEND-SPEC §10-6): no page uses the camera or
// location; the microphone stays allowed for our own pages because voice input
// (SpeechRecognition: /ai/assistant, /ai/analyze, /laws/[slug], VoiceInput)
// needs it; payment for our own pages and the Google Pay frame Moyasar's form
// opens. Topics: off.
const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=(self)",
  "geolocation=()",
  'payment=(self "https://pay.google.com")',
  "usb=()",
  "browsing-topics=()",
].join(", ");

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicyReportOnly() },
  // The endpoint group the policy's report-to names (Reporting API v1).
  { key: "Reporting-Endpoints", value: `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"` },
];

const nextConfig: NextConfig = {
  // No `x-powered-by: Next.js` on responses (audit WEB-03).
  poweredByHeader: false,
  // ── One HTML for every visitor (owner 18 Nov, items 2.7 + 4) ───────────────
  // By default Next "streams" generateMetadata for any user agent outside its
  // HTML-limited-bot list: the <title>, description, canonical and robots tags
  // arrive late, in the <body>. Googlebot and GPTBot / ClaudeBot /
  // PerplexityBot are outside that list, Bingbot and facebookexternalhit are
  // inside — so two crawlers got two different documents, and the AI crawlers
  // (no JavaScript) found no description or canonical in the <head> at all
  // (the SEO audit of 18 Nov). Matching every user agent makes the metadata
  // blocking for everyone: the browser, Googlebot and every other crawler get
  // the same <head>. The cost is the metadata read before the first byte; the
  // library readers' layouts await the same cached read anyway.
  htmlLimitedBots: /.*/,
  // ── Build folder ────────────────────────────────────────────────────────────
  // deploy.sh alternates two build folders, `.next-a` and `.next-b`: it builds
  // into the one that is not live, then points the server at it through
  // NEXT_DIST_DIR in `.env.production.local` (loaded before this file is
  // evaluated). Building straight into `.next` deleted the running server's
  // build — on 2026-09-25 pm2 restarted the app 43 times during the ~6-minute
  // build. A finished build cannot be renamed instead: Next.js 16 bakes the
  // folder name into the compiled server (`distDir:".next-build"`).
  // Unset → `.next` (local dev and any plain `next build`).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // ── Image optimisation ──────────────────────────────────────────────────────
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    remotePatterns: [
      // Blog cover images live in the public Supabase Storage bucket `blog-covers`.
      // Kept for any Supabase CLOUD project (dev/staging still pointed there).
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      // The actual configured backend (self-hosted or cloud) — see
      // supabaseStorageRemotePattern() above. Omitted if the env var is unset
      // or unparseable at config-load time.
      ...(dynamicSupabasePattern ? [dynamicSupabasePattern] : []),
    ],
  },
  async headers() {
    return [
      {
        // Every path. Listed FIRST: when two rules set the same header, the later
        // rule wins, so the stricter Referrer-Policy on /track/:token below stays.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      // Owner 18 Nov, item 4.3: `X-Robots-Tag: noindex, follow` on every
      // private page (dashboards, sign-in and registration, settings, payment,
      // the sign-in /ai tools…) — src/lib/publicSeo/privatePages.ts. Before
      // the /track/:token rule below, whose stricter value then wins.
      ...privateRobotsHeaderRules(),
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
      {
        // The client case tracking page (N3.6): the token IS the URL. The page
        // already sets robots/referrer meta tags and is dynamic; these headers
        // also reach crawlers that read no HTML, and caches in front of Next
        // (a cached copy would keep a revoked link working).
        source: "/track/:token",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
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
      // رادار المهل أصبح تبويباً داخل مساحة الجلسات والمواعيد الموحدة.
      { source: "/dashboard/lawyer/deadlines", destination: "/dashboard/lawyer/hearings?tab=deadlines", permanent: true },

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

      // ── T28-19 — /dashboard/corporate ────────────────────────────────────
      // The corporate account's dashboard lives at /dashboard/business (the
      // `corporate` user type maps there); /dashboard/corporate never existed
      // as a route, but it is the URL people guess and type. No page lives at
      // this path, so the rule shadows nothing.
      { source: "/dashboard/corporate", destination: "/dashboard/business", permanent: true },
      { source: "/dashboard/corporate/:path*", destination: "/dashboard/business/:path*", permanent: true },

      // ── Owner 2026-11-12 #1 — فحص تعارض المصالح (حذف نهائي) ──────────────
      // The owner dropped the feature: it is neither built nor mentioned. The
      // page, its API route and its client service are deleted; an old bookmark
      // lands on the firm dashboard instead of a 404. No page lives at this
      // path any more, so the rule shadows nothing.
      { source: "/dashboard/firm/compliance/conflict", destination: "/dashboard/firm", permanent: true },
      { source: "/dashboard/firm/compliance/conflict/:path*", destination: "/dashboard/firm", permanent: true },
      // ── N02-2 (owner, 13-Nov package) — the legal library lives at /laws ──
      // /erp/library was a static mock (template cards whose preview, download
      // and copy buttons did nothing), linked only from the footer and the
      // floating services menu — both now point at /laws. This rule shadows
      // src/app/erp/library/page.tsx, which can be deleted. /library never
      // existed as a page; it is the URL people guess. Every sub-path lands
      // on the library home: the old paths carry no slug /laws could read.
      { source: "/erp/library", destination: "/laws", permanent: true },
      { source: "/erp/library/:path*", destination: "/laws", permanent: true },
      { source: "/library", destination: "/laws", permanent: true },
      { source: "/library/:path*", destination: "/laws", permanent: true },
    ];
  },
};

export default nextConfig;
