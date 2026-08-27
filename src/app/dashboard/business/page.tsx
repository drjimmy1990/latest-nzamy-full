"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowClockwise,
  ArrowLeft,
  BookOpen,
  Briefcase,
  FolderOpen,
  Plus,
  UploadSimple,
  Warning,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import AddCaseModal from "./_components/AddCaseModal";
import { BusinessProfileReadinessPanel } from "@/components/dashboard/business/BusinessProfileReadinessPanel";
import { listMyServiceOrders } from "@/lib/services/serviceOrders";
import { getDocuments } from "@/lib/services/documentService";
import { toClientCases, type CaseTone, type ClientCase } from "@/lib/services/clientDashboardCards";
import {
  accountDisplayName,
  countVaultDocuments,
  vaultDocumentsPhraseAr,
} from "@/lib/services/businessOverview";

/**
 * نظرة عامة على المنشأة — /dashboard/business.
 *
 * ─── WHAT WAS HERE, AND WHY NONE OF IT SURVIVED ──────────────────────────────
 *
 * This is the only /dashboard/business route a corporate account can still
 * open (plus the document vault); sixteen sibling sections were unlinked on 26
 * August because they rendered another company's invented data. This page was
 * left visible and was full of the same thing. Every item below was a
 * module-level literal, identical for every company that signed in:
 *
 *   STATS              «٤ استشارات معلقة», «٣٤ عقود سارية», «٢ قضايا عمالية»,
 *                      «معدل الامتثال ٩٢٪» — with trend arrows «+٥ تم تجديدها».
 *   URGENT_DEADLINES   two dated legal deadlines with day countdowns, in red.
 *   INITIAL_REQUESTS   three departmental requests with ids (NZ-REQ-102),
 *                      departments and timestamps («اليوم ٩:٠٠ ص»).
 *   TEAM_LOAD          three named employees and their caseloads.
 *   BUSINESS_PLAN      a subscription called «Growth» with «١٢/٢٠» consumed.
 *   the secretary card «تم تحليل ٣ عقود موردين … واكتشاف ثغرات في بند تحمل
 *                      المسئولية» — no analysis had run, for anyone, ever.
 *   the seconded card  a named advocate at a named firm, an «نشط» badge and
 *                      «١٢ / ٤٠» billable hours left this month.
 *   EscalationFlow     `complexityScore={55}`, hardcoded, telling a company
 *                      with no case that «قضيتك فيها تفاصيل تحتاج نظر محامي».
 *   AI_TOOLS + KPIs    seven cards linking to /dashboard/business/* sections
 *                      the layout now refuses to render, and to /ai/corp/*
 *                      tools whose only asynchronous work is a setTimeout.
 *   handleCaseAdded    on a successful submit the page ALSO prepended a card
 *                      built from the form's own values — a second, invented
 *                      representation of a row the server already held, with
 *                      its own reference format («NZ-…» beside «ORD-…») and a
 *                      literal «الآن» for a timestamp. The modal itself was
 *                      already real and is kept; see below.
 *
 * None of it is replaced by a zero. A rendered «٠ عقود سارية» is the same
 * false claim as «٣٤», so where there is no query there is no label.
 *
 * ─── WHAT IT IS NOW ──────────────────────────────────────────────────────────
 *
 * Only what the platform genuinely knows about the company reading it:
 *   1. its own identity   — business_profiles, via BusinessProfileReadinessPanel;
 *   2. its own orders     — listMyServiceOrders() over service_requests, whose
 *                           RLS scopes SELECT to `requester_user_id = auth.uid()`;
 *   3. its own vault      — GET /api/v1/documents, filtered to the rows bound
 *                           to no order;
 *   4. two real actions   — /dashboard/client/services, and AddCaseModal.
 *
 * AddCaseModal STAYS. It looks like the fabricated controls around it and is
 * not one: a previous pass rewired it to POST through createWorkflowRequest()
 * with `receiver: "ai_workspace"` — the one literal the admin fulfilment queue
 * reads — and to carry everything it collects in `metadata.intake`, where
 * buildOrderPrompt() finds it. Its `type: "business_case"` is on the
 * service_requests CHECK list (20260814_service_orders_types.sql:23). It is a
 * working intake path for a corporate account, so removing it would have been
 * a regression dressed up as a cleanup. What is removed is what the PAGE did
 * with its callback (see handleCaseAdded above): the list now refetches from
 * the server instead of being handed a card assembled from the form.
 *
 * Whether a company should have two ways in — the service catalogue and this
 * short form — is a product question for the owner, not something to settle by
 * quietly deleting the one that still works.
 *
 * The service catalogue is the point of the page. Owner ruling س٢ (26 August):
 * a company files through the SAME three-step form an individual does, and
 * src/lib/auth/routeAccess.ts now admits `corporate` to the three intake
 * subtrees. Ordering a service is the only thing a company could not do here
 * before, and it is now the first control on the screen.
 *
 * ─── THINGS DELIBERATELY NOT RENDERED ────────────────────────────────────────
 *
 * • A total, of anything. `listMyServiceOrders()` fetches the route's default
 *   page (20 rows) and this page cannot widen it without owning that module,
 *   so any «لديك N طلباً» printed here would silently cap at twenty. A capped
 *   count is a wrong count.
 * • `<OnboardingBanner role="business">`. Its three buttons point at
 *   /dashboard/business/requests (no such route), /contracts and /governance
 *   (both unlinked on 26 August for fabricated data) — three dead controls on
 *   a company's first screen. The banner component is not this change's file;
 *   the fix available from inside this one is to stop rendering it.
 * • `<LegalLibraryBanner variant="compact">`. Its one line of copy asserts a
 *   catalogue size nothing here can source and calls a Postgres full-text
 *   search «بحث ذكي بالذكاء الاصطناعي». The component takes no prop that could
 *   correct either, so what is rendered in its place is a plain link to the
 *   same real section — see the block near the bottom of the JSX.
 * • The ERP/service mode switch and the limited-role view. Both branched into
 *   BusinessSubViews.tsx, which is somebody else's file and still renders
 *   mock departments and dead /dashboard/business/* links. Reaching the
 *   limited view required a `business_role` in user metadata that no corporate
 *   signup writes, so it was unreachable in production.
 *
 *   `?mode=service` WAS reachable, and one link still emits it:
 *   src/app/onboarding/page.tsx:728 sends a corporate account with no in-house
 *   lawyer to `/dashboard/business?mode=service`. That link is not broken — it
 *   lands on this page, which now renders the same real overview for everyone.
 *   The parameter is simply inert, and what it used to select was the screen
 *   with the mock departments on it.
 * • The QA role switcher. It existed to jump between those same views and was
 *   already `NODE_ENV !== "production"` only.
 */

/** How many orders the overview lists before deferring to «طلباتي». */
const ORDERS_SHOWN = 5;

/**
 * The status badge palette, keyed by the tones `toClientCases` can emit.
 *
 * Typed `Record<CaseTone, string>`, so a tone added to that union without a
 * colour here is a build error rather than an unstyled badge. zinc-*, never
 * gray-*: globals.css redefines --color-gray-50/100/200 as dark SURFACES, so
 * `dark:text-gray-100` is invisible text.
 */
const TONE_CLASS: Record<CaseTone, string> = {
  amber: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  blue: "border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  green: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  zinc: "border-zinc-400/25 bg-zinc-400/10 text-zinc-600 dark:text-zinc-300",
};

/**
 * `loading` is where every panel starts. An empty state painted before its
 * answer arrives is a false statement that merely happens to be brief — the
 * distinction «لا توجد طلبات» / «تعذّر التحميل» / «لم نعرف بعد» is the whole
 * subject of this page.
 */
type LoadState = "loading" | "ready" | "error";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 90, damping: 18, delay: i * 0.05 },
  }),
};

export default function BusinessOverviewPage() {
  const { isDark } = useTheme();
  const user = useUser();

  const [ordersState, setOrdersState] = useState<LoadState>("loading");
  const [orders, setOrders] = useState<ClientCase[]>([]);
  const [vaultState, setVaultState] = useState<LoadState>("loading");
  const [vaultCount, setVaultCount] = useState<number | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);

  // ── Reload counters ────────────────────────────────────────────────────────
  //
  // Each panel refetches when its counter changes, and the retry button is what
  // increments it. The indirection buys two things a `load()` callback called
  // straight from the effect does not: the effect can return a cleanup that
  // cancels a reply already in flight (a second click would otherwise let an
  // older, slower response land last and overwrite a newer one), and no
  // setState happens synchronously in an effect body
  // (react-hooks/set-state-in-effect).
  const [ordersAttempt, setOrdersAttempt] = useState(0);
  const [vaultAttempt, setVaultAttempt] = useState(0);

  // listMyServiceOrders() THROWS on failure — including on the route's
  // `200 {data: [], degraded: true}` answer to a Supabase error — which is
  // exactly what lets this panel tell "you have placed no orders" apart from
  // "we could not read your orders". Swallowing that into an empty array is the
  // defect this whole pass exists to remove.
  useEffect(() => {
    let cancelled = false;
    listMyServiceOrders()
      .then((rows) => {
        if (cancelled) return;
        // toClientCases(), not a cast: a `service_requests` row has no
        // `statusColor`, and reading `.bg` off the `undefined` that a cast
        // produced is what crashed the client landing page for every client
        // who had ever placed an order.
        setOrders(toClientCases(rows));
        setOrdersState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[business overview] orders fetch failed:", e);
        setOrdersState("error");
      });
    return () => { cancelled = true; };
  }, [ordersAttempt]);

  useEffect(() => {
    let cancelled = false;
    getDocuments()
      .then((docs) => {
        if (cancelled) return;
        setVaultCount(countVaultDocuments(docs));
        setVaultState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[business overview] vault fetch failed:", e);
        setVaultState("error");
      });
    return () => { cancelled = true; };
  }, [vaultAttempt]);

  // Back to the skeleton first — that is the only feedback the click gives.
  const retryOrders = () => { setOrdersState("loading"); setOrdersAttempt((n) => n + 1); };
  const retryVault = () => { setVaultState("loading"); setVaultAttempt((n) => n + 1); };

  const card = isDark
    ? "bg-zinc-900/80 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl shadow-sm";
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const divider = isDark ? "border-white/[0.06]" : "border-zinc-100";

  // The company's own trading name — or null, and then the heading below is the
  // section's name instead of a claim about who is reading it.
  //
  // NOT `user.name.trim()`, which is what this was. `useUser` builds that value
  // as `display_name ?? full_name ?? user.email ?? ""` (src/hooks/useUser.ts:620),
  // so two strings that are not a company name reach it:
  //   • the EMAIL, whenever the account never set a display name — printed here
  //     it put a person's address in the page's largest type;
  //   • the literal «عميل نظامي», which is where /register/client's own
  //     displayName chain ends (page.tsx:246), so every corporate signup that
  //     skipped the company-name field carries it.
  // The second one is the sharper bug: BusinessProfileReadinessPanel, 26 lines
  // below, already screens «عميل نظامي» out and prints «لم تُسجَّل بيانات هذه
  // المنشأة بعد» — so one screen was announcing the company's name and denying
  // it had one. accountDisplayName() is the single list both now consult, and
  // the test that pins them together is in businessOverview.test.ts.
  //
  // No loading state for the heading: «لوحة المنشأة» is true of every account
  // that can open this page, so the swap when `useUser` resolves is a flicker
  // rather than a correction.
  const accountName = accountDisplayName(user.name);

  const listed = orders.slice(0, ORDERS_SHOWN);
  const vaultPhrase = vaultCount === null ? null : vaultDocumentsPhraseAr(vaultCount);

  return (
    <div
      className={`p-5 md:p-8 space-y-6 max-w-[1100px] mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`}
      dir="rtl"
    >
      {/* ── Header + the one action this page exists for ─────────────────── */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        custom={0}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#0B3D2E] to-[#0d5238] p-7 shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)]"
      >
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-white">
              {accountName ?? "لوحة المنشأة"}
            </h1>
            <p className="mt-1 text-sm text-emerald-300/80">
              اطلب خدمة قانونية من مكتب نظامي، وتابع طلبات منشأتك ووثائقها من هنا.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/dashboard/client/services"
              className="flex items-center gap-2 rounded-xl bg-[#C8A762] px-4 py-2.5 text-sm font-bold text-[#0B3D2E] shadow-[0_4px_16px_-4px_rgba(200,167,98,0.5)] transition hover:brightness-105"
            >
              <Plus size={16} weight="bold" />
              اطلب خدمة قانونية
            </Link>
            <button
              type="button"
              onClick={() => setShowNewRequest(true)}
              className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.12] px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/[0.18] cursor-pointer"
            >
              <Briefcase size={15} />
              طلب قانوني جديد
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── The company's own record ─────────────────────────────────────── */}
      <BusinessProfileReadinessPanel />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── Orders ─────────────────────────────────────────────────────── */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={1}
          className={`${card} flex flex-col lg:col-span-2`}
        >
          <div className={`flex items-center justify-between border-b px-6 py-4 ${divider}`}>
            <div className="flex items-center gap-2">
              <Briefcase size={17} weight="fill" className={isDark ? "text-emerald-400" : "text-[#0B3D2E]"} />
              <h2 className="text-[15px] font-bold">طلبات منشأتك</h2>
            </div>
            <Link
              href="/dashboard/client/requests"
              className="flex items-center gap-1 text-sm font-medium text-[#C8A762] hover:underline"
            >
              عرض الكل <ArrowLeft size={13} />
            </Link>
          </div>

          {ordersState === "loading" && (
            <div className={`divide-y ${isDark ? "divide-white/[0.04]" : "divide-zinc-50"}`} aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="px-6 py-4">
                  <div className={`h-3.5 w-48 rounded-full animate-pulse ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />
                  <div className={`mt-2 h-2.5 w-32 rounded-full animate-pulse ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />
                </div>
              ))}
            </div>
          )}

          {ordersState === "error" && (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <Warning size={30} weight="duotone" className="text-amber-500" />
              {/* Never «لا توجد طلبات» on a failed read: a company that had
                  filed five requests would be told it had filed none. */}
              <p className={`text-sm font-medium ${muted}`}>تعذّر تحميل طلبات منشأتك.</p>
              <button
                type="button"
                onClick={retryOrders}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${isDark ? "border-white/[0.12] text-zinc-200 hover:bg-white/[0.06]" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"}`}
              >
                <ArrowClockwise size={13} weight="bold" />
                إعادة المحاولة
              </button>
            </div>
          )}

          {ordersState === "ready" && listed.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <Briefcase size={30} weight="duotone" className={isDark ? "text-zinc-600" : "text-zinc-300"} />
              <p className={`text-sm font-medium ${muted}`}>لم تقدّم منشأتك أي طلب بعد.</p>
              <Link
                href="/dashboard/client/services"
                className="text-xs font-bold text-[#C8A762] hover:underline"
              >
                تصفّح الخدمات وابدأ طلبك الأول
              </Link>
            </div>
          )}

          {ordersState === "ready" && listed.length > 0 && (
            <div className={`flex-1 divide-y ${isDark ? "divide-white/[0.04]" : "divide-zinc-50"}`}>
              {listed.map((order) => (
                <Link
                  key={order.id}
                  // The same destination «طلباتي» itself uses for a row
                  // (src/app/dashboard/client/requests/page.tsx). Three things
                  // have to hold for a company to actually SEE that page, and
                  // all three now do:
                  //   • /ai/* carries no route-access rule, so the edge proxy
                  //     admits a corporate account;
                  //   • src/app/ai/layout.tsx wraps every /ai/* page in
                  //     BusinessDashboardLayout for user_type 'corporate', and
                  //     that layout used to gate on isVisibleBusinessRoute(),
                  //     which is false for /ai/orders/<id> — a path that is not
                  //     a business section at all — so this link rendered
                  //     «هذا القسم قيد الإعداد» over a real order. It now asks
                  //     isHiddenBusinessSection() instead, which is true only
                  //     for the /dashboard/business/* sections that were
                  //     unlinked on 26 August (layout.tsx:103-110);
                  //   • SharedSidebar picks by profiles.user_type, so the
                  //     company keeps its own menu once it arrives.
                  href={`/ai/orders/${order.id}`}
                  className={`flex items-center gap-4 px-6 py-4 transition-colors ${isDark ? "hover:bg-white/[0.04]" : "hover:bg-zinc-50/80"}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`mb-1 truncate text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                      {order.title}
                    </p>
                    <div className={`flex flex-wrap items-center gap-2 text-[11px] ${muted}`}>
                      <span className="font-mono" dir="ltr">{order.caseNo}</span>
                      {/* Each of the two below is rendered only when the row
                          carried it. A separator with nothing after it is the
                          small version of the same lie. */}
                      {order.serviceLabel && (<><span>·</span><span>{order.serviceLabel}</span></>)}
                      {order.createdAtLabel && (<><span>·</span><span>{order.createdAtLabel}</span></>)}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold ${TONE_CLASS[order.statusColor]}`}>
                    {order.statusLabel}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Document vault ─────────────────────────────────────────────── */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={2}
          className={`${card} p-5`}
        >
          <div className="mb-4 flex items-center gap-2">
            <FolderOpen size={16} weight="fill" className="text-[#C8A762]" />
            <h2 className="text-[14px] font-bold">خزنة وثائق المنشأة</h2>
          </div>

          {vaultState === "loading" && (
            <div className={`h-4 w-36 rounded-full animate-pulse ${isDark ? "bg-white/10" : "bg-zinc-200"}`} aria-hidden />
          )}

          {(vaultState === "error" || (vaultState === "ready" && vaultCount === null)) && (
            <div className="space-y-3">
              <p className={`flex items-center gap-2 text-[12px] ${muted}`}>
                <Warning size={14} weight="fill" className="shrink-0 text-amber-500" />
                تعذّر قراءة خزنة الوثائق.
              </p>
              <button
                type="button"
                onClick={retryVault}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition ${isDark ? "border-white/[0.12] text-zinc-200 hover:bg-white/[0.06]" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"}`}
              >
                <ArrowClockwise size={13} weight="bold" />
                إعادة المحاولة
              </button>
            </div>
          )}

          {vaultState === "ready" && vaultPhrase && (
            <div className="space-y-3">
              <p className={`text-[15px] font-black ${isDark ? "text-white" : "text-zinc-900"}`}>{vaultPhrase}</p>
              {/* «بأي طلب» was false on two of the three intake paths this very
                  page offers. VaultAttachPicker has exactly ONE call site —
                  src/app/dashboard/client/requests/new/page.tsx:254, the
                  three-step legal-service form the catalogue routes most
                  services to. «طلب قانوني جديد» in the header above (AddCaseModal)
                  has no attachment field at all, and
                  /dashboard/client/consultation/new takes device files only and
                  never reads the vault. So the sentence names the form that
                  really has the picker instead of promising all three.
                  A company can actually GET there: ROUTE_ACCESS admits
                  `corporate` to the prefix "/dashboard/client/requests" and
                  matches with startsWith (routeAccess.ts:57,103), so
                  .../requests/new is covered, not just the list. */}
              <p className={`text-[11px] leading-relaxed ${muted}`}>
                أرفِقها بنقرة في نموذج طلب الخدمات القانونية، دون رفعها من جهازك مرة أخرى.
              </p>
              <Link
                href="/dashboard/business/documents"
                className="flex items-center gap-1 text-[12px] font-bold text-[#C8A762] hover:underline"
              >
                افتح الخزنة <ArrowLeft size={12} />
              </Link>
            </div>
          )}

          {/* vaultCount === 0. The phrase helper returns null at zero on
              purpose: GET /api/v1/documents answers a database failure with
              `200 {"data": []}`, so «٠ وثيقة» would sometimes be a claim about
              files we never managed to read. An invitation is true either way. */}
          {vaultState === "ready" && vaultCount === 0 && (
            <div className="space-y-3">
              {/* Same correction as the counted branch above: the picker lives
                  on the legal-service request form and nowhere else, so «بأي
                  طلب لاحق» promised two paths that cannot honour it. */}
              <p className={`text-[12px] leading-relaxed ${muted}`}>
                لا توجد وثائق في الخزنة بعد. ارفع السجل التجاري وعقد التأسيس
                وقائمة المفوّضين مرة واحدة، لتُرفِقها بنقرة في نموذج طلب الخدمات
                القانونية.
              </p>
              <Link
                href="/dashboard/business/documents"
                className="flex items-center gap-1.5 text-[12px] font-bold text-[#C8A762] hover:underline"
              >
                <UploadSimple size={13} weight="bold" />
                ارفع وثائق المنشأة
              </Link>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── The legal library, linked plainly ────────────────────────────────
          WHAT STOOD HERE: `<LegalLibraryBanner variant="compact" />`. Its
          destination was never the problem — /laws is a real, seeded section —
          but its subtitle is «٥,٠٠٠+ نظام ولائحة سعودية — بحث ذكي بالذكاء
          الاصطناعي» (src/components/LegalLibraryBanner.tsx:14, the only string
          the compact variant renders besides the title and the link). Two
          claims in it, both unsupported: the count has no source anywhere in
          this codebase, and the search behind /laws is a Postgres full-text
          query, not a model. The component exposes only `variant` and
          `onDismiss`, so neither string can be corrected from here, and the
          component is another change's file.
          WHY THE LINK SURVIVED THE BANNER: CORPORATE_SIDEBAR has no /laws entry
          (src/constants/navigation.sidebars.business.ts:64-90), so this row is
          a corporate account's only route into the library. Deleting the whole
          block to be rid of a subtitle would have cost a working section to
          fix a sentence. The banner's own copy is reported for whoever owns
          that file; what is left here says only what /laws actually is —
          «بحث في نصوصها الكاملة» is the one claim below and it is sourced:
          laws/page.tsx:176 posts to /api/library/search, which runs
          `.textSearch('fts', …, { config: LIBRARY_FTS_CONFIG })` over the
          seeded text. No count is asserted, because none is countable here. */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3}>
        <Link
          href="/laws"
          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${isDark ? "border-indigo-500/15 bg-indigo-950/30 hover:bg-indigo-950/50" : "border-indigo-200/60 bg-indigo-50/70 hover:bg-indigo-50"}`}
        >
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isDark ? "bg-indigo-500/15 text-indigo-400" : "bg-indigo-100 text-indigo-600"}`}>
            <BookOpen size={17} weight="duotone" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block text-[12px] font-bold ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>
              المكتبة القانونية
            </span>
            <span className={`block text-[11px] ${muted}`}>
              الأنظمة واللوائح السعودية، بحث في نصوصها الكاملة.
            </span>
          </span>
          <span className={`flex shrink-0 items-center gap-1 text-[11px] font-bold ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>
            تصفّح المكتبة <ArrowLeft size={11} />
          </span>
        </Link>
      </motion.div>

      <AnimatePresence>
        {showNewRequest && (
          <AddCaseModal
            isDark={isDark}
            onClose={() => setShowNewRequest(false)}
            // The saved id is deliberately IGNORED. The old handler built a
            // card out of it plus the form's own strings — a row that existed
            // only in this component's state, printed as «NZ-…» beside its own
            // server-side «ORD-…» twin and stamped «الآن». Bumping the counter
            // refetches instead, so the request the company sees on this page
            // is the one the fulfilment queue actually holds. No `loading`
            // reset: the list stays on screen and gains the new row when the
            // answer lands, rather than blinking back to a skeleton.
            onCaseAdded={() => setOrdersAttempt((n) => n + 1)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
