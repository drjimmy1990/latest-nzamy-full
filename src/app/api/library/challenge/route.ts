import { NextRequest, NextResponse } from "next/server";
import { resolveClientIp } from "@/lib/rateLimit";
import { libraryReadClientKey } from "@/lib/rateLimitRoutes";
import { turnstilePolicy, verifyTurnstileToken } from "@/lib/auth/turnstileServer";
import {
  LIBRARY_PASS_COOKIE,
  libraryPassSecret,
  newLibraryId,
  passBinding,
  signLibraryPass,
} from "@/lib/library/publicGuard";
import { loadLibraryGuardSettings } from "@/lib/library/publicGuardServer";

/**
 * POST /api/library/challenge { token } — the public-library guard's
 * Turnstile check (owner message 18 Nov, item 2; src/proxy.ts
 * applyLibraryPublicGuard).
 *
 * After a visitor spends a soft budget the library answers 429 with
 * `x-library-challenge: required`; LibraryChallengeHost shows the Turnstile
 * box and posts its token here. A passed check sets `nz_lib_pass`: HttpOnly,
 * path /api, signed (HMAC) and bound to the visitor's address, valid
 * library_public_protection.pass_minutes — a fresh allowance, never a way past
 * the hard ceiling. The proxy never counts this path in the soft budgets; the
 * note-١٣ library-any bucket still applies to it.
 *
 * TURNSTILE_SECRET_KEY verifies (siteverify). Without it: accepted outside
 * production (local work), 503 in production. The pass key is
 * LIBRARY_CHALLENGE_SECRET, else derived from TURNSTILE_SECRET_KEY.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  let token: unknown = null;
  try {
    const body = (await req.json()) as { token?: unknown } | null;
    token = body?.token ?? null;
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400, headers: NO_STORE });
  }

  const ip = resolveClientIp((name) => req.headers.get(name));
  const visitor = libraryReadClientKey((name) => req.headers.get(name), ip);

  const policy = turnstilePolicy(process.env.TURNSTILE_SECRET_KEY, process.env.NODE_ENV);
  const passSecret = libraryPassSecret(process.env);
  if (policy === "misconfigured" || !passSecret) {
    console.error("[library/challenge] TURNSTILE_SECRET_KEY (or LIBRARY_CHALLENGE_SECRET) is not set — no pass can be issued");
    return NextResponse.json(
      { error: "التحقق البشري غير متاح الآن. انتظر قليلاً ثم أكمل القراءة." },
      { status: 503, headers: NO_STORE },
    );
  }
  if (policy === "verify") {
    const passed = await verifyTurnstileToken({
      secret: process.env.TURNSTILE_SECRET_KEY as string,
      token: typeof token === "string" ? token : null,
      remoteIp: visitor,
      fetchImpl: fetch,
    });
    if (!passed) {
      return NextResponse.json(
        { error: "لم يكتمل التحقق. أعد المحاولة.", code: "library_challenge_failed" },
        { status: 403, headers: NO_STORE },
      );
    }
  }

  const { protection } = await loadLibraryGuardSettings();
  const maxAgeSeconds = protection.passMinutes * 60;
  const pass = await signLibraryPass(passSecret, {
    expiresAt: Date.now() + maxAgeSeconds * 1000,
    nonce: newLibraryId(),
    binding: await passBinding(visitor),
  });
  const res = NextResponse.json({ ok: true, minutes: protection.passMinutes }, { headers: NO_STORE });
  res.cookies.set(LIBRARY_PASS_COOKIE, pass, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
    maxAge: maxAgeSeconds,
  });
  return res;
}
