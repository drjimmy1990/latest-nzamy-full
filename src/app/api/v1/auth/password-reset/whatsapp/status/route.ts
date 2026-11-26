import { NextResponse } from "next/server";
import { whatsappResetIsAvailable } from "@/lib/passwordReset/whatsappResetServer";

/**
 * GET /api/v1/auth/password-reset/whatsapp/status → { whatsapp: boolean }
 * (batch l17). true only while WhatsApp sending is configured (Zernio + the
 * code pepper) AND the sign-up WhatsApp switch is on; /forgot-password shows
 * «أرسل رمزًا إلى واتساب» only then. Nothing about any account.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ whatsapp: await whatsappResetIsAvailable() }, { headers: { "Cache-Control": "no-store" } });
}
