import { PRIVATE_ROBOTS } from "@/lib/publicSeo/privatePages";

// Owner 18 Nov, item 4.3: a private page — <meta name="robots" content="noindex, follow">
// (next.config.ts also sends it as X-Robots-Tag; src/lib/publicSeo/privatePages.ts).
export const metadata = { robots: PRIVATE_ROBOTS };

// Batch l19 (POST-L18-02): rendered per request, never prerendered. A
// prerendered page is sent with `s-maxage=31536000`, and the nginx cache in
// front of the site keeps such a page by its address alone (cookies are not
// part of the key), so a signed-in visitor of /register, /register/client or
// /register/provider got the guest copy and never reached the proxy's
// signed-in redirect (src/proxy.ts signedInSignupPageRedirect). A dynamic page
// is sent `private, no-store`, which no shared cache keeps: every load reaches
// the proxy. It also keeps the browser's router from reusing a guest copy.
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
