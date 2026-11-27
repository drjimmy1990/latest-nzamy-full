import { NextResponse } from "next/server";
import { RETIRED_DEVICE_CODE_AR, RETIRED_DEVICE_CODE } from "@/lib/library/deviceLimit";

/**
 * POST /api/v1/library/devices/verify — RETIRED (l19 review B3).
 *
 * It used to check the e-mail code of a new library device and confirm it
 * (owner ٤٠, 20261127_60). Owner ٢٣٣ (batch l19) retired the
 * code: a device is now registered by the account rule alone
 * (public.account_device_gate, 20261209_40). This route answers 410 with an
 * honest line, reads no body and calls nothing, so nothing can set
 * `verified_at` through it.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: RETIRED_DEVICE_CODE_AR, code: RETIRED_DEVICE_CODE },
    { status: 410, headers: { "Cache-Control": "private, no-store" } },
  );
}
