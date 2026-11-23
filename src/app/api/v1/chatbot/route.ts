import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clientIpFrom, rateLimit } from "@/lib/rateLimit";
import { isFeatureOn } from "@/lib/featureFlags/featureFlagsServer";
import { ASSISTANT_MAX_MESSAGE, answerMessage, classify, feedNeeds } from "@/lib/siteAssistant/answer";
import { loadAssistantFeed, type FeedViewer } from "@/lib/siteAssistant/feedServer";

/**
 * «مساعد نظامي» — the site help assistant (O20 / A21, batch l11-misc; owner
 * register 14 items 21 + 26).
 *
 * GET  → { enabled } — the widget asks once per page view whether to draw its
 *        button (platform_settings.feature_flags.site_assistant, read on the
 *        server with a one-minute cache). The same for everyone, so it may be
 *        cached for a minute.
 * POST { message } → { reply: { text, links, suggestions } } — a deterministic
 *        answer (src/lib/siteAssistant/answer.ts) from the price book, this
 *        viewer's open offers, the founder campaign, the payment switch and
 *        the library's account-type switch (who may subscribe). No
 *        outside model, no legal advice, no library text. Nothing is stored:
 *        the message is answered and forgotten. `reply.intent` tells the
 *        window what was recognised: Q181 (batch l13) — for a legal question
 *        («legal_advice») the window offers a signed-in individual one of his
 *        free questions, which it asks through the AI run route (tool
 *        `floating`), never through this route.
 *
 * Abuse friction: per address, 12 messages a minute and 120 an hour (the
 * process-local limiter, src/lib/rateLimit.ts), on top of the proxy's general
 * write bucket; a message is at most 400 characters.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };
const OFF_AR = "المساعد غير متاح الآن.";

export async function GET() {
  const enabled = await isFeatureOn("site_assistant");
  return NextResponse.json({ enabled }, { headers: { "Cache-Control": "public, max-age=60" } });
}

export async function POST(request: NextRequest) {
  const ip = clientIpFrom(request);
  for (const [bucket, limit, windowMs] of [
    ["minute", 12, 60_000],
    ["hour", 120, 3_600_000],
  ] as const) {
    const rl = rateLimit(`site-assistant:${bucket}:${ip}`, { limit, windowMs });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "أرسلت أسئلة كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة." },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSec) } },
      );
    }
  }

  if (!(await isFeatureOn("site_assistant"))) {
    return NextResponse.json({ error: OFF_AR, disabled: true }, { status: 503, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400, headers: NO_STORE });
  }
  const message = typeof (body as { message?: unknown } | null)?.message === "string" ? (body as { message: string }).message.trim() : null;
  if (message === null) {
    return NextResponse.json({ error: "اكتب سؤالك أولاً" }, { status: 400, headers: NO_STORE });
  }
  if (message.length > ASSISTANT_MAX_MESSAGE) {
    return NextResponse.json({ error: "السؤال أطول من ٤٠٠ حرف؛ اختصره من فضلك." }, { status: 400, headers: NO_STORE });
  }

  try {
    const needs = feedNeeds(classify(message).intent);
    let viewer: FeedViewer | null = null;
    if (needs.sale || needs.offers) {
      try {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        viewer = user ? { id: user.id, last_sign_in_at: user.last_sign_in_at ?? null } : null;
      } catch {
        viewer = null; // a guest answer: sale for the public, offers after sign-in
      }
    }
    const feed = await loadAssistantFeed(viewer, needs);
    const reply = answerMessage(message, feed);
    return NextResponse.json(
      { reply: { text: reply.text, links: reply.links, suggestions: reply.suggestions, intent: reply.intent } },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[chatbot] answer failed:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "تعذّر الرد الآن — حاول بعد قليل." }, { status: 503, headers: NO_STORE });
  }
}
