import { buildRobotsTxt } from "@/lib/publicSeo/robotsTxt";

/**
 * GET /robots.txt — the owner's legal notice, TDM reservation and three
 * crawler tiers (register 57 / 58 / 60; batch l9). A route handler, not
 * app/robots.ts: Next's MetadataRoute.Robots cannot print comments. Built at
 * build time from src/lib/publicSeo/robotsTxt.ts.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(buildRobotsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
