import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth/assertRole";
import { readIssuerVat } from "@/lib/finance/invoiceFinanceCore";
import { isSaudiVatNumber, normalizeVatNumber } from "@/lib/finance/invoiceVat";
import { BRANDING_NEEDS_MIGRATION_AR } from "@/lib/branding/brandingVault";
import { ensureOwnVault, resolveBrandingCaller } from "@/lib/branding/brandingServer";

/**
 * /api/v1/lawyer/finance/issuer — who issues this caller's fee statements and
 * whether that issuer charges VAT (owner TODO 17-Nov N01-11, Q484 — final:
 * 15% only with a VAT number, else 0% «غير خاضع لضريبة القيمة المضافة»).
 *
 * GET  public.invoice_issuer_vat(caller) — the SAME answer
 *      create_lawyer_invoice_v3 acts on, so the form's preview cannot disagree
 *      with what is issued: { scope, name, state, vatNumber, editable }.
 *      `available: false` while 20261126_30 has not run.
 *
 * PUT  { vatNumber } — the individual lawyer's own number ("" clears it).
 *      ONE source per issuer: a member of a firm issues as the firm, whose
 *      number lives in the firm's settings (firm_profiles.metadata.settings
 *      .vatNumber, «إعدادات الكيان») — refused here with 409. Order (the
 *      20261103_69 pattern): the caller's own vault read or created THROUGH
 *      RLS, then the service role writes branding_vaults.vat_number (sessions
 *      hold no grant on it; the column CHECK pins the shape).
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const UNAVAILABLE_AR = "احتساب الضريبة على بيانات الأتعاب غير متاح بعد: يتطلب تحديث قاعدة البيانات.";
const VAT_NUMBER_SHAPE_AR = "الرقم الضريبي ١٥ رقماً يبدأ بالرقم ٣ وينتهي به (مثال: 3XXXXXXXXXXXXX3).";
const FIRM_SOURCE_AR =
  "بيانات أتعابك تصدر باسم المكتب الذي أنت عضو فيه، فرقمه الضريبي هو المعتمد. يعدّله مالك المكتب من الإعدادات ← «إعدادات الكيان».";

export async function GET() {
  const auth = await assertRole(["lawyer", "firm"]);
  if (!auth.ok) return auth.response;
  const service = await createServiceClient();
  const r = await readIssuerVat({ admin: service }, auth.user.id);
  if (!r.ok) {
    return r.status === 503
      ? NextResponse.json({ available: false, message: UNAVAILABLE_AR }, { headers: NO_STORE })
      : NextResponse.json({ error: "تعذّرت قراءة بيانات جهة الإصدار" }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json(
    {
      available: true,
      ...r.issuer,
      // Only an individual lawyer issuing in his own name edits it here.
      editable: r.issuer.scope === "lawyer" && auth.userType === "lawyer",
    },
    { headers: NO_STORE },
  );
}

export async function PUT(request: NextRequest) {
  const caller = await resolveBrandingCaller("lawyer");
  if (!caller.ok) return caller.response;
  const { supabase, owner, user } = caller;

  const body = (await request.json().catch(() => null)) as { vatNumber?: unknown } | null;
  if (!body || (body.vatNumber !== null && typeof body.vatNumber !== "string")) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const vatNumber = normalizeVatNumber(body.vatNumber);
  if (vatNumber !== null && !isSaudiVatNumber(vatNumber)) {
    return NextResponse.json({ error: VAT_NUMBER_SHAPE_AR, field: "vatNumber" }, { status: 400 });
  }

  const service = await createServiceClient();
  const current = await readIssuerVat({ admin: service }, user.id);
  if (!current.ok) {
    return current.status === 503
      ? NextResponse.json({ error: UNAVAILABLE_AR }, { status: 503 })
      : NextResponse.json({ error: "تعذّرت قراءة بيانات جهة الإصدار" }, { status: 500 });
  }
  if (current.issuer.scope !== "lawyer") {
    return NextResponse.json({ error: FIRM_SOURCE_AR }, { status: 409 });
  }

  const vault = await ensureOwnVault(supabase, owner);
  if (!vault.ok) {
    return vault.reason === "missing"
      ? NextResponse.json({ error: BRANDING_NEEDS_MIGRATION_AR }, { status: 503 })
      : NextResponse.json({ error: "تعذّر قراءة خزنة الهوية" }, { status: 500 });
  }
  const { error } = await service.from("branding_vaults").update({ vat_number: vatNumber }).eq("id", vault.row.id);
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return NextResponse.json({ error: UNAVAILABLE_AR }, { status: 503 });
    }
    console.error("[lawyer/finance issuer PUT] vat_number update failed:", error.message);
    return NextResponse.json({ error: "تعذّر حفظ الرقم الضريبي" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, vatNumber }, { headers: NO_STORE });
}
