import { NextResponse } from "next/server";

/**
 * /laws/civil-procedure — kept as an alias, not as a page.
 *
 * LIB-12 (2026-09-25): this used to be a bespoke client page that fetched
 * `/api/library/laws/civil-procedure-law` and, when that failed, silently
 * rendered a hardcoded ARTICLES array bundled into the JavaScript. On the
 * self-hosted library that slug does not exist (404), so every visitor got the
 * hardcoded sample dressed up as the law. It also ignored the `locked` flag the
 * API sets, so even a successful load showed truncated text with no upgrade
 * path, a hand-written index of dead anchors and a note calling it a sample.
 *
 * The law itself is «نظام المرافعات الشرعية ولائحته التنفيذية», slug
 * `sharia-pleading-law-qadha-edition` in library.laws (243 articles, 15
 * chapters). The generic reader at /laws/[slug] already carries the paywall,
 * the lock UI and an Arabic error state, so this route only forwards to it.
 *
 * A route handler rather than a page calling permanentRedirect(): under the
 * /laws layout a page-level redirect is streamed inside a 200 response, which
 * crawlers following the sitemap entry do not treat as a redirect. This
 * answers a real 308. The folder must stay — without it the URL falls through
 * to /laws/[slug] and 404s, and the sitemap, smart folders and recent sessions
 * still link here.
 */
const CIVIL_PROCEDURE_LAW_SLUG = "sharia-pleading-law-qadha-edition";

export function GET(request: Request) {
  // Keep ?viewMode=… and any other query the caller passed. The Location is
  // relative (valid per RFC 9110) so it never leaks the upstream host that a
  // reverse proxy may have put in request.url.
  const { search } = new URL(request.url);
  return new NextResponse(null, {
    status: 308,
    headers: { Location: `/laws/${CIVIL_PROCEDURE_LAW_SLUG}${search}` },
  });
}
