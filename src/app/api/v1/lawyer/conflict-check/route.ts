import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { normalizeDigits } from "@/lib/services/clientIdentityRules";
import { hashNationalId, normalizedCommercialRegister } from "@/lib/services/clientIdentityHash";

/**
 * GET /api/v1/lawyer/conflict-check — Phase 2 (خطة_البناء_الكاملة_٢٠٢٦-٠٩-٠٢.md
 * §6, item 193). Replaces MOCK_DB in
 * src/app/dashboard/firm/compliance/conflict/page.tsx.
 *
 * Searches ONLY what the caller may already read under RLS — their own
 * client cards and cases, plus their firm's through active membership. This
 * route never widens that: every query below runs on the caller's own RLS
 * client, so a "no match" answer means "no match in your records", not "no
 * conflict exists anywhere" — the screen says so, this route does not
 * pretend otherwise.
 *
 * The national ID is hashed here and compared to `national_id_hash` only —
 * the raw value is never sent to Postgres in a column that stores it in the
 * clear, never logged, and never echoed back in a `ConflictMatch`.
 *
 * Sources searched, each capped at 50 rows before dedup:
 *   (a) `lawyer_clients` — name (ILIKE, q ≥ 2 chars), phone (exact),
 *       national_id_hash (exact), commercial_register_no (exact).
 *   (b) `service_requests` (type = 'service') — title / requester name
 *       (ILIKE, q ≥ 2 chars only).
 *
 * Priority when one row matches on more than one field (e.g. a `q` that
 * happens to equal the stored phone digits): national_id, then
 * commercial_register, then phone, then name — the earlier query wins the
 * dedup and its `matchOn` is what's reported.
 */

interface ClientRow {
  id: string;
  name: string;
  client_type: string;
  status: string;
  owner_user_id: string;
}

interface CaseRow {
  id: string;
  title: string;
  status: string;
  assigned_to: string | null;
  requester_user_id: string | null;
}

type MatchOn = "name" | "phone" | "national_id" | "commercial_register";

interface ConflictMatchDto {
  kind: "client" | "case_party";
  matchOn: MatchOn;
  label: string;
  detail: string | null;
  href: string | null;
  clientId?: string;
  caseRequestId?: string;
  viaFirm: boolean;
}

const CLIENT_SELECT = "id, name, client_type, status, owner_user_id";
const CASE_SELECT = "id, title, status, assigned_to, requester_user_id";
const SOURCE_CAP = 50;

/** Same sanitisation as searchClause() in admin/users/route.ts — keeps a
 * caller-supplied term from breaking PostgREST's or()/ilike() syntax. */
function sanitizeTerm(term: string): string {
  return term.replace(/[,()\\%]/g, "").trim();
}

function clientToMatch(row: ClientRow, matchOn: MatchOn, uid: string, isAdmin: boolean): ConflictMatchDto {
  return {
    kind: "client",
    matchOn,
    label: row.name,
    detail: `موكّل — ${row.client_type === "company" ? "شركة" : "فرد"} — ${row.status}`,
    href: `/dashboard/lawyer/clients/${row.id}`,
    clientId: row.id,
    viaFirm: !isAdmin && row.owner_user_id !== uid,
  };
}

function caseToMatch(row: CaseRow, uid: string, isAdmin: boolean): ConflictMatchDto {
  return {
    kind: "case_party",
    matchOn: "name",
    label: row.title,
    detail: `قضية — ${row.status}`,
    href: `/dashboard/lawyer/cases/${row.id}`,
    caseRequestId: row.id,
    viaFirm: !isAdmin && row.assigned_to !== uid && row.requester_user_id !== uid,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase, userType } = auth;
    const isAdmin = userType === "admin";

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const phone = searchParams.get("phone")?.trim() || "";
    const nationalId = searchParams.get("nationalId")?.trim() || "";
    const commercialRegister = searchParams.get("commercialRegister")?.trim() || "";

    if (!q && !phone && !nationalId && !commercialRegister) {
      return NextResponse.json(
        { error: "أدخل اسمًا أو رقم هاتف أو هوية أو سجلًا تجاريًا للبحث." },
        { status: 400 },
      );
    }

    const merged = new Map<string, ConflictMatchDto>();
    const add = (list: ConflictMatchDto[]) => {
      for (const m of list) {
        const key = `${m.kind}:${m.clientId ?? m.caseRequestId}`;
        if (!merged.has(key)) merged.set(key, m);
      }
    };

    // ── (a) lawyer_clients — most specific identifiers first ────────────────
    const nationalIdHash = nationalId ? hashNationalId(nationalId) : null;
    if (nationalIdHash) {
      const { data, error } = await supabase
        .from("lawyer_clients")
        .select(CLIENT_SELECT)
        .eq("national_id_hash", nationalIdHash)
        .limit(SOURCE_CAP);
      if (error) {
        console.error("[lawyer/conflict-check GET] national_id query failed:", error.message, error.code);
        return NextResponse.json({ error: "تعذّر تنفيذ فحص التعارض." }, { status: 500 });
      }
      add(((data ?? []) as ClientRow[]).map((r) => clientToMatch(r, "national_id", user.id, isAdmin)));
    }

    const normalizedCr = commercialRegister ? normalizedCommercialRegister(commercialRegister) : null;
    if (normalizedCr) {
      const { data, error } = await supabase
        .from("lawyer_clients")
        .select(CLIENT_SELECT)
        .eq("commercial_register_no", normalizedCr)
        .limit(SOURCE_CAP);
      if (error) {
        console.error("[lawyer/conflict-check GET] commercial_register query failed:", error.message, error.code);
        return NextResponse.json({ error: "تعذّر تنفيذ فحص التعارض." }, { status: 500 });
      }
      add(((data ?? []) as ClientRow[]).map((r) => clientToMatch(r, "commercial_register", user.id, isAdmin)));
    }

    const normalizedPhone = phone ? normalizeDigits(phone) : "";
    if (normalizedPhone) {
      const { data, error } = await supabase
        .from("lawyer_clients")
        .select(CLIENT_SELECT)
        .eq("phone", normalizedPhone)
        .limit(SOURCE_CAP);
      if (error) {
        console.error("[lawyer/conflict-check GET] phone query failed:", error.message, error.code);
        return NextResponse.json({ error: "تعذّر تنفيذ فحص التعارض." }, { status: 500 });
      }
      add(((data ?? []) as ClientRow[]).map((r) => clientToMatch(r, "phone", user.id, isAdmin)));
    }

    const nameTerm = q.length >= 2 ? sanitizeTerm(q) : "";
    if (nameTerm) {
      const { data, error } = await supabase
        .from("lawyer_clients")
        .select(CLIENT_SELECT)
        .ilike("name", `%${nameTerm}%`)
        .limit(SOURCE_CAP);
      if (error) {
        console.error("[lawyer/conflict-check GET] name query failed:", error.message, error.code);
        return NextResponse.json({ error: "تعذّر تنفيذ فحص التعارض." }, { status: 500 });
      }
      add(((data ?? []) as ClientRow[]).map((r) => clientToMatch(r, "name", user.id, isAdmin)));

      // ── (b) service_requests — case parties, q only ────────────────────────
      const { data: caseData, error: caseError } = await supabase
        .from("service_requests")
        .select(CASE_SELECT)
        .eq("type", "service")
        .or(`title.ilike.%${nameTerm}%,requester->>name.ilike.%${nameTerm}%`)
        .limit(SOURCE_CAP);
      if (caseError) {
        console.error("[lawyer/conflict-check GET] case query failed:", caseError.message, caseError.code);
        return NextResponse.json({ error: "تعذّر تنفيذ فحص التعارض." }, { status: 500 });
      }
      add(((caseData ?? []) as CaseRow[]).map((r) => caseToMatch(r, user.id, isAdmin)));
    }

    const results = Array.from(merged.values());
    return NextResponse.json({ data: results, total: results.length });
  } catch (err) {
    console.error("[lawyer/conflict-check GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تنفيذ فحص التعارض." }, { status: 500 });
  }
}
