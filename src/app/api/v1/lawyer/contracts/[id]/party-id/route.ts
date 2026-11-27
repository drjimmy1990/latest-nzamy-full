import { officePlanRefusal } from "@/lib/auth/assertOfficePlan";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { createServiceClient } from "@/lib/supabase/server";
import { hashNationalId } from "@/lib/services/clientIdentityHash";
import { decryptPartyId, encryptPartyId, readPartyIdKey } from "@/lib/services/contractPartyIdCrypto";
import {
  isContractAuthor,
  isMissingTable,
  parsePartyNationalId,
  partyIdStatus,
  PARTY_ID_AUTHOR_ONLY_AR,
  PARTY_ID_LOG_FAILED_AR,
  PARTY_ID_UNAVAILABLE_AR,
} from "@/lib/services/contractPartyId";

/**
 * /api/v1/lawyer/contracts/[id]/party-id — N01-5 (owner ٢٤): the other
 * party's national ID on a contract.
 *
 *   GET            status only: { stored, encrypted, keyConfigured } — no number
 *   GET ?reveal=1  the number, for the contract's author, after an access-log row
 *   PUT  { nationalId }  store it (AES-256-GCM with CONTRACT_PARTY_ID_KEY; without
 *                        the key, the SHA-256 only — never the plain number)
 *   DELETE         remove it
 *
 * ── WHO ─────────────────────────────────────────────────────────────────────
 * The contract is read with the SESSION client (RLS: can_access_contract), so
 * a contract the caller cannot see answers 404. Of those who can see it, only
 * its author (contracts.owner_user_id) passes; anyone else gets 403 and a
 * refused read is logged too.
 *
 * ── WHY THE SERVICE ROLE ────────────────────────────────────────────────────
 * public.contract_party_national_ids and contract_party_id_access_log
 * (20261201_40) grant nothing to sessions; the route writes them after the
 * author check above. The log is append-only. A reveal whose log row cannot be
 * written is refused: no read goes unrecorded.
 */

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

type Action = "set" | "clear" | "read";
type Outcome = "ok" | "no_key" | "refused";

async function logAccess(
  service: SupabaseClient,
  contractId: string,
  actor: string,
  action: Action,
  outcome: Outcome,
): Promise<boolean> {
  const { error } = await service
    .from("contract_party_id_access_log")
    .insert({ contract_id: contractId, actor_user_id: actor, action, outcome });
  if (error) console.error("[contracts/party-id] access log failed:", error.code);
  return !error;
}

/** The session-visible contract and whether the caller wrote it. */
async function authorGate(id: string) {
  const auth = await assertCaseWorker();
  if (!auth.ok) return { response: auth.response } as const;
  const { user, supabase } = auth;
  if (!id || id.length > 100) {
    return { response: NextResponse.json({ error: "العقد غير موجود" }, { status: 404, headers: NO_STORE }) } as const;
  }
  const { data: contract, error } = await supabase
    .from("contracts")
    .select("id, owner_user_id")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[contracts/party-id] contract lookup failed:", error.code);
  if (!contract) {
    return { response: NextResponse.json({ error: "العقد غير موجود" }, { status: 404, headers: NO_STORE }) } as const;
  }
  const service = await createServiceClient();
  if (!isContractAuthor(contract as { owner_user_id: string | null }, user.id)) {
    return { refused: true, service, uid: user.id, supabase, userType: auth.userType } as const;
  }
  return { refused: false, service, uid: user.id, supabase, userType: auth.userType } as const;
}

function forbidden() {
  return NextResponse.json({ error: PARTY_ID_AUTHOR_ONLY_AR }, { status: 403, headers: NO_STORE });
}

function unavailable() {
  return NextResponse.json({ error: PARTY_ID_UNAVAILABLE_AR, available: false }, { status: 503, headers: NO_STORE });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const gate = await authorGate(id);
    if ("response" in gate) return gate.response;
    const reveal = request.nextUrl.searchParams.get("reveal") === "1";
    if (gate.refused) {
      if (reveal) await logAccess(gate.service, id, gate.uid, "read", "refused");
      return forbidden();
    }

    const { data: row, error } = await gate.service
      .from("contract_party_national_ids")
      .select("ciphertext")
      .eq("contract_id", id)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error.code)) return unavailable();
      console.error("[contracts/party-id GET] read failed:", error.code);
      return NextResponse.json({ error: "تعذّرت القراءة." }, { status: 500, headers: NO_STORE });
    }
    const key = readPartyIdKey();
    const status = partyIdStatus(row as { ciphertext: string | null } | null, key !== null);
    if (!reveal || !row) return NextResponse.json(status, { headers: NO_STORE });

    const ciphertext = (row as { ciphertext: string | null }).ciphertext;
    const plain = key && ciphertext ? decryptPartyId(ciphertext, id, key) : null;
    const logged = await logAccess(gate.service, id, gate.uid, "read", plain ? "ok" : "no_key");
    if (!logged) return NextResponse.json({ error: PARTY_ID_LOG_FAILED_AR }, { status: 500, headers: NO_STORE });
    if (!plain) {
      return NextResponse.json(
        { ...status, nationalId: null, error: "لا يمكن عرض الرقم المحفوظ الآن، فأعد إدخاله." },
        { headers: NO_STORE },
      );
    }
    return NextResponse.json({ ...status, nationalId: plain }, { headers: NO_STORE });
  } catch (err) {
    console.error("[contracts/party-id GET] unexpected error:", err);
    return NextResponse.json({ error: "تعذّرت القراءة." }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const gate = await authorGate(id);
    if ("response" in gate) return gate.response;
    if (gate.refused) return forbidden();
    // Owner ق٢٦-٤: «contracts» is «إدارة المكتب» — refused on the free side.
    const officeLocked = await officePlanRefusal(gate.supabase, "contracts", gate.userType);
    if (officeLocked) return officeLocked;

    const parsed = parsePartyNationalId(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
    const hash = hashNationalId(parsed.value);
    if (!hash) return NextResponse.json({ error: "رقم الهوية غير صالح." }, { status: 400, headers: NO_STORE });

    const key = readPartyIdKey();
    const ciphertext = key ? encryptPartyId(parsed.value, id, key) : null;
    const { error } = await gate.service
      .from("contract_party_national_ids")
      .upsert(
        { contract_id: id, author_user_id: gate.uid, id_hash: hash, ciphertext, updated_at: new Date().toISOString() },
        { onConflict: "contract_id" },
      );
    if (error) {
      if (isMissingTable(error.code)) return unavailable();
      console.error("[contracts/party-id PUT] write failed:", error.code);
      return NextResponse.json({ error: "تعذّر الحفظ." }, { status: 500, headers: NO_STORE });
    }
    await logAccess(gate.service, id, gate.uid, "set", key ? "ok" : "no_key");
    return NextResponse.json(partyIdStatus({ ciphertext }, key !== null), { headers: NO_STORE });
  } catch (err) {
    console.error("[contracts/party-id PUT] unexpected error:", err);
    return NextResponse.json({ error: "تعذّر الحفظ." }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const gate = await authorGate(id);
    if ("response" in gate) return gate.response;
    if (gate.refused) return forbidden();

    const { error } = await gate.service.from("contract_party_national_ids").delete().eq("contract_id", id);
    if (error) {
      if (isMissingTable(error.code)) return unavailable();
      console.error("[contracts/party-id DELETE] failed:", error.code);
      return NextResponse.json({ error: "تعذّر الحذف." }, { status: 500, headers: NO_STORE });
    }
    await logAccess(gate.service, id, gate.uid, "clear", "ok");
    return NextResponse.json(partyIdStatus(null, readPartyIdKey() !== null), { headers: NO_STORE });
  } catch (err) {
    console.error("[contracts/party-id DELETE] unexpected error:", err);
    return NextResponse.json({ error: "تعذّر الحذف." }, { status: 500, headers: NO_STORE });
  }
}
