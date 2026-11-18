import { buildLlmsTxt } from "@/lib/publicSeo/llmsTxt";

/**
 * GET /llms.txt (owner 18 Nov, item 4.5): plain text, UTF-8, the same for
 * every visitor. Built at build time from src/lib/publicSeo/llmsTxt.ts.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
