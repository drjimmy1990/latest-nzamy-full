"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowClockwise, Buildings, Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { createClient } from "@/lib/supabase/client";
import {
  toCompanyIdentityFields,
  type CompanyIdentityField,
} from "@/lib/services/businessOverview";

/**
 * بيانات المنشأة — the company's own record, read from its own
 * `business_profiles` row.
 *
 * WHAT THIS USED TO BE. Until 2026-08-27 this panel rendered
 * `useAdminSettings().currentCompanyFeatures`, which is
 * `DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID]` — company "C-001", a fictional
 * large enterprise with an in-house legal department, a governance programme
 * and nine entitlements. Every corporate account on the platform saw C-001's
 * profile presented as its own, seeded into its own localStorage on first
 * paint. Beside it sat an «إدارة من الأدمن» button pointing at
 * /dashboard/admin/business, a prefix the edge proxy refuses to a corporate
 * user (src/lib/auth/routeAccess.ts) — so the one control offered was a
 * guaranteed redirect.
 *
 * WHAT IT IS NOW. Four facts, each printed only when the row actually holds
 * it: the trading name, the CR number, the legal representative and their
 * capacity. Those are what owner item ٧ persisted
 * (20260826_corporate_identity_persisted.sql, applied to production). Nothing
 * is defaulted and nothing is invented; the mapping that decides what may be
 * shown is `toCompanyIdentityFields`, which has tests
 * (src/lib/services/businessOverview.test.ts).
 *
 * THE NAME IS NOW A MISNOMER and is kept anyway: BusinessSubViews.tsx imports
 * this export, that file belongs to another change, and renaming a symbol
 * across a file boundary you do not own is how a build breaks. The `compact`
 * prop is kept for the same reason — BusinessSubViews passes it.
 *
 * WHY IT FETCHES ITS OWN ROW rather than taking one as a prop: it has two
 * callers, and a prop would have to be optional for the other one. An optional
 * "identity" prop that is simply absent is indistinguishable from "this
 * company has no record", and the panel would print «لم تُسجَّل بيانات
 * المنشأة» about a company it never looked up. One query, owned here, cannot
 * make that mistake.
 */

interface BusinessProfileReadinessPanelProps {
  /** Trims the panel to the two headline facts. Passed by BusinessSubViews. */
  compact?: boolean;
}

/**
 * `loading` is the state the panel STARTS in and it is not cosmetic: an empty
 * state rendered before the answer arrives is a false statement that happens
 * to be brief.
 */
type LoadState = "loading" | "ready" | "error";

export function BusinessProfileReadinessPanel({ compact = false }: BusinessProfileReadinessPanelProps) {
  const { isDark } = useTheme();
  const [state, setState] = useState<LoadState>("loading");
  const [fields, setFields] = useState<CompanyIdentityField[]>([]);

  // The reload counter the retry button increments. The effect below depends on
  // it, so a retry refetches and its cleanup cancels whatever was still in
  // flight — and no setState runs synchronously in an effect body
  // (react-hooks/set-state-in-effect).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    /**
     * Resolves to the company's identity lines, or throws. It deliberately
     * performs no state update of its own — every setState below is guarded by
     * `cancelled`, and keeping them in one place is what makes that guarantee
     * checkable by reading rather than by hoping.
     */
    async function read(): Promise<CompanyIdentityField[]> {
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth?.user) {
        // Not "this company has no record" — we could not establish who is
        // asking. Those two must never render the same sentence, so this is an
        // error rather than an empty result.
        throw authError ?? new Error("no session");
      }

      const { data, error } = await supabase
        .from("business_profiles")
        // `select("*")`, not a named column list. `legal_rep_name` and
        // `legal_rep_capacity` only exist where 20260826 has run; naming them
        // on a database where it has not turns the whole query into a 42703
        // and takes the company's own NAME down with two columns that were
        // merely absent. The mapper reads every field defensively anyway.
        .select("*")
        .eq("owner_user_id", auth.user.id)
        // Deterministic, and never somebody else's company. RLS alone would
        // also admit an admin (who may read every row) and an active
        // business_member, so an unfiltered `.limit(1)` would hand an admin an
        // arbitrary company's CR number — precisely the defect this panel was
        // rewritten to remove. The ordering makes the choice stable if a
        // duplicate row ever exists; the signup trigger's `ON CONFLICT DO
        // NOTHING` names no unique target, so that is possible.
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // `data` is null when the account owns no business_profiles row at all.
      // The mapper turns that into an empty list, and the empty state below
      // says so plainly.
      return toCompanyIdentityFields(data);
    }

    read()
      .then((next) => {
        if (cancelled) return;
        setFields(next);
        setState("ready");
      })
      .catch((e) => {
        // createClient() throws outright when the Supabase env vars are absent
        // (a demo build), so this is a real path, not defensive padding.
        if (cancelled) return;
        console.error("[business overview] company profile read failed:", e);
        setState("error");
      });

    return () => { cancelled = true; };
  }, [attempt]);

  // Back to the skeleton first — that is the only feedback the click gives.
  const retry = () => { setState("loading"); setAttempt((n) => n + 1); };

  // zinc-*, never gray-*: globals.css redefines --color-gray-50/100/200 as dark
  // SURFACES, so `dark:text-gray-100` renders invisible text.
  const card = isDark
    ? "border-white/[0.06] bg-zinc-900/80 text-zinc-100"
    : "border-zinc-200 bg-white text-zinc-900";
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const soft = isDark ? "border-white/[0.06] bg-white/[0.03]" : "border-zinc-100 bg-zinc-50";

  const shown = compact ? fields.slice(0, 2) : fields;

  return (
    <section className={`rounded-2xl border p-5 ${card}`} dir="rtl">
      <div className="flex items-start gap-3">
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-[#0B3D2E]/25 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
          <Buildings size={22} weight="duotone" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-black">بيانات المنشأة</h2>
          {/* «تُرفَق هذه البيانات بكل طلب تقدّمه» said the wrong thing about a
              real mechanism. NOTHING writes company identity onto a
              service_requests row. What happens is a lookup on the other side:
              the admin fulfilment queue re-reads business_profiles by
              `owner_user_id` for every requester whose profile says
              `user_type: "corporate"` and puts the result beside the card
              (src/app/api/v1/admin/service-orders/route.ts:178-203). So the
              team SEES the record with the request; the record is not carried
              by it. The distinction matters to a company deciding whether to
              retype its CR number into a request description.
              «كل طلب» IS CHECKED, not assumed. That queue hard-filters
              `receiver: "ai_workspace"` (route.ts:59), so a path writing any
              other receiver would never reach the join and this would be the
              same «بأي طلب» overclaim the vault tile just lost. All three
              intake paths a corporate account can use write that literal:
              client/requests/new:135, client/consultation/new:347, and
              business/_components/AddCaseModal:121. Re-check this line if a
              fourth is ever added.
              Note the lookup's failure is logged and swallowed there (:194-198)
              — the identity block is context on a card, not the card — so this
              sentence describes the design and not a per-request guarantee. */}
          <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
            ما هو مسجَّل لدى نظامي عن منشأتك. يطّلع عليه فريق نظامي مع كل طلب
            تقدّمه من هذا الحساب.
          </p>
        </div>
      </div>

      {state === "loading" && (
        <div className="mt-4 grid gap-3 grid-cols-1 md:grid-cols-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className={`rounded-xl border p-3 ${soft}`}>
              <div className={`h-2.5 w-20 rounded-full animate-pulse ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />
              <div className={`mt-2 h-3 w-32 rounded-full animate-pulse ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />
            </div>
          ))}
        </div>
      )}

      {state === "error" && (
        <div className={`mt-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-[12px] leading-relaxed ${isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <Warning size={15} weight="fill" className="shrink-0" />
          {/* Deliberately NOT «لا توجد بيانات» — we did not read the record, so
              we are in no position to describe what is in it. */}
          <span className="flex-1 min-w-[12rem]">تعذّر قراءة بيانات المنشأة من الخادم.</span>
          <button
            type="button"
            onClick={retry}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${isDark ? "border-amber-400/30 text-amber-200 hover:bg-amber-500/10" : "border-amber-300 text-amber-800 hover:bg-amber-100"}`}
          >
            <ArrowClockwise size={13} weight="bold" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {state === "ready" && shown.length > 0 && (
        <div className={`mt-4 grid gap-3 grid-cols-1 ${compact ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-4"}`}>
          {shown.map((field) => (
            <div key={field.key} className={`rounded-xl border p-3 ${soft}`}>
              <p className={`text-[10px] font-bold ${muted}`}>{field.label}</p>
              {/* dir="auto" so a CR number (ASCII digits) is not laid out
                  right-to-left inside this RTL section, while an Arabic
                  trading name still is. */}
              <p className="mt-1 text-[12px] font-black break-words" dir="auto">{field.value}</p>
            </div>
          ))}
        </div>
      )}

      {state === "ready" && shown.length === 0 && (
        <div className={`mt-4 rounded-xl border p-3 text-[12px] leading-relaxed ${soft} ${muted}`}>
          <p>لم تُسجَّل بيانات هذه المنشأة بعد — لا الاسم التجاري ولا رقم السجل التجاري ولا الممثل النظامي.</p>
          {/* One honest route out, and it is a page that really submits (POST
              /api/v1/contact). There is no corporate profile editor to link to;
              inventing a «تعديل البيانات» button here would be a dead control
              of exactly the kind this pass removed. */}
          <p className="mt-1">
            لتسجيلها أو تصحيحها{" "}
            <Link href="/contact" className="font-bold text-[#C8A762] hover:underline">
              تواصل مع فريق نظامي
            </Link>
            .
          </p>
        </div>
      )}
    </section>
  );
}
