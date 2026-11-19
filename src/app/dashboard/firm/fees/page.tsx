/**
 * /dashboard/firm/fees — «الأتعاب» of the firm (file 15 row 49, batch l9).
 *
 * It was a static page (invented statements, totals and payment methods under
 * an «unfinished» note). The fee statements are built for lawyers — VAT 15% for
 * a VAT-registered issuer and 0% with a notice otherwise, print on the
 * letterhead (PDF), send and void (/api/v1/lawyer/finance/*, assertRole lawyer
 * + firm) — so the firm now gets that same page. It shows the statements the
 * signed-in firm account issued itself; there is no firm-wide statement model
 * (a member lawyer's own statements stay on his own page).
 * The previous static page is preserved in git history.
 */
export { default } from "../../lawyer/finance/page";
