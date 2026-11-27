/**
 * accountDeviceProxy.ts — the proxy's page hook for owner answer ٢٣٣ (one
 * mobile + one computer per account). src/proxy.ts calls it once, in the
 * page branch, right after the WhatsApp phone gate, with the user getUser()
 * just verified and the pass-through response it built:
 *
 *   const deviceRefused = await accountDevicePageGate(req, user, supabaseResponse);
 *   if (deviceRefused) return deviceRefused;
 *
 *   - refused → a redirect to /device-limit (a public page, not PROTECTED:
 *     no loop) carrying the response's refreshed sb-* cookies, exactly like
 *     the frozen / suspended / phone redirects beside it;
 *   - allowed → the device id (a minted one, or the same one renewed) is set
 *     on `response` (accountDeviceGate.ts says when);
 *   - everything else, and any error → null (go on).
 *
 * All the logic is in accountDeviceGate.ts; this file only reads the request
 * and shapes the response. No node: imports.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ACCOUNT_DEVICE_COOKIE, ACCOUNT_DEVICE_LIMIT_PATH, accountDeviceCookieOptions } from "./accountDevice.ts";
import { accountDeviceOutcome } from "./accountDeviceGate.ts";

export async function accountDevicePageGate(
  req: NextRequest,
  user: { id: string },
  response: NextResponse,
): Promise<NextResponse | null> {
  try {
    const outcome = await accountDeviceOutcome({
      userId: user.id,
      deviceId: req.cookies.get(ACCOUNT_DEVICE_COOKIE)?.value ?? null,
      userAgent: req.headers.get("user-agent"),
      chUaMobile: req.headers.get("sec-ch-ua-mobile"),
    });
    if (outcome.kind === "pass") {
      if (outcome.setDeviceId) {
        response.cookies.set(
          ACCOUNT_DEVICE_COOKIE,
          outcome.setDeviceId,
          accountDeviceCookieOptions(process.env.NODE_ENV === "production"),
        );
      }
      return null;
    }
    const url = req.nextUrl.clone();
    url.pathname = ACCOUNT_DEVICE_LIMIT_PATH;
    url.search = "";
    const refused = NextResponse.redirect(url);
    refused.headers.set("Cache-Control", "no-store");
    response.cookies.getAll().forEach((cookie) => refused.cookies.set(cookie));
    return refused;
  } catch {
    return null;
  }
}
