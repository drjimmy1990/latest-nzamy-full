import { buildLlmsTxt } from "@/lib/publicSeo/llmsTxt";
import { loadPlatformRegistry } from "@/lib/publicSeo/platformRegistryServer";

/**
 * GET /llms.txt (owner 18 Nov, item 4.5): plain text, UTF-8, the same for
 * every visitor. Built from src/lib/publicSeo/llmsTxt.ts, and rebuilt every
 * 5 minutes so the licence / CR settings (batch l9) reach it.
 */
export const dynamic = "force-static";
export const revalidate = 300;

export async function GET() {
  return new Response(buildLlmsTxt(await loadPlatformRegistry()), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
