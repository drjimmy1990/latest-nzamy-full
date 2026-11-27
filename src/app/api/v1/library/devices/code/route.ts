import { NextResponse } from "next/server";
import { RETIRED_DEVICE_CODE_AR, RETIRED_DEVICE_CODE } from "@/lib/library/deviceLimit";

/**
 * POST /api/v1/library/devices/code — RETIRED (l19 review B3).
 *
 * It used to e-mail the code of a new library device (owner ٤٠, 20261127_60).
 * Owner ٢٣٣ (batch l19) replaced that with the account rule — one mobile and
 * one computer, registered silently, an extra device refused with «تواصل مع
 * الإدارة» (public.account_device_gate, 20261209_40). The old code could
 * still confirm a device outside that rule, so this route now answers 410
 * with an honest line and calls nothing: no code is issued, no row is
 * written, nothing can set `verified_at` through it.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: RETIRED_DEVICE_CODE_AR, code: RETIRED_DEVICE_CODE },
    { status: 410, headers: { "Cache-Control": "private, no-store" } },
  );
}
