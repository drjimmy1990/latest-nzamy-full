import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { LISTEN_VOICE_DEFAULT, LISTEN_VOICE_SETTING, parseListenVoice } from "@/lib/ai/listenVoice";

/**
 * GET /api/v1/ai/listen-voice — «استمع للإجابة» (owner Q182, batch l13):
 * `{ voice }`, the voice name the admin chose for reading answers aloud
 * (platform_settings listen_voice; "" = the browser's first ar-SA voice).
 * The same for everyone and not secret, so it is public and cached for five
 * minutes. Read with the service client, so platform_settings keeps no
 * session grant; only this one value leaves. Any error → the default.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE = { "Cache-Control": "public, max-age=300" };

export async function GET() {
  try {
    const admin = await createServiceClient();
    const { data, error } = await admin.from("platform_settings").select("value").eq("key", LISTEN_VOICE_SETTING).maybeSingle();
    if (error) return NextResponse.json({ voice: LISTEN_VOICE_DEFAULT }, { headers: CACHE });
    return NextResponse.json({ voice: parseListenVoice((data as { value?: unknown } | null)?.value) }, { headers: CACHE });
  } catch {
    return NextResponse.json({ voice: LISTEN_VOICE_DEFAULT }, { headers: CACHE });
  }
}
