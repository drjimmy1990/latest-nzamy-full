/**
 * /dashboard/micro/wallet — the SAME wallet the client dashboard renders.
 *
 * ── WHAT WAS HERE ──────────────────────────────────────────────────────────
 *
 * 335 lines of invented money. A module-level `WALLET` literal declaring a
 * balance of ٢٥٠ ر.س, ٧٥ ر.س «pending earnings», a referral code
 * («MICRO-KH2024») and lifetime totals — none of it read from anything. Under
 * it, a transaction history naming real-looking people:
 *
 *     «مكافأة إحالة — محمد الغامدي»        +٧٥
 *     «استشارة قانونية — خالد الحربي»      -٢٥٠
 *     «رصيد ترحيب — انضممت لنظامي»         +٢٥٠
 *     «مكافأة إحالة — فاطمة الأنصاري»      +٧٥
 *
 * …plus two coupons («RAMADAN30», «LEGAL100») that redeem nothing, and a live
 * «أحِل صديقاً — واكسب ٧٥ ريال» promise with a working copy button. Matrix row
 * 50, and the owner's shot 12 caught the same fabricated balance contradicting
 * shot 14, where the referral programme's own page says it does not exist.
 *
 * A wrong number on a dashboard is bad. A wrong number denominated in RIYALS,
 * that a small-business owner can reasonably read as credit he already owns, is
 * a different category — he can plan a purchase around it.
 *
 * ── WHY THIS IS A RE-EXPORT AND NOT A DELETION ─────────────────────────────
 *
 * Because the real thing already exists and this page was ignoring it.
 * `GET /api/v1/wallet` is built, careful, and reads `wallet_transactions` for
 * real: it formats in Arabic-Indic digits, maps `kind` through the table's own
 * CHECK constraint, and — the part that matters — REFUSES TO SHOW A BALANCE it
 * cannot compute, rather than summing the newest fifty rows and calling that a
 * balance. `/dashboard/client/wallet` renders exactly what that route returns
 * and nothing more.
 *
 * That page makes no assumption about who is looking at it: no `userType`
 * check, no role branch, no `assertRole`. It cannot, because the route is
 * RLS-scoped — Supabase decides whose rows come back from the caller's own
 * session. So a micro account opening this URL sees ITS wallet, correctly,
 * with no work beyond pointing at it.
 *
 * The route stays a route (rather than the sidebar linking straight to
 * /dashboard/client/wallet) because `/dashboard/micro/*` is behind
 * `UserTypeGuard allowedTypes={["micro", "admin"]}` in this segment's layout,
 * and sending a micro user into the client subtree would put them against a
 * guard that does not list them.
 */
export { default } from "@/app/dashboard/client/wallet/page";
