/**
 * /dashboard/firm/clients/[id] — the firm's client file (file 15 row 30, batch l9).
 *
 * The cards on /dashboard/firm/clients were not clickable, and this route held
 * a demo-only mock (one invented company, invented cases and invoices) behind
 * «قريباً». It now renders the SAME client file the lawyer uses: the API
 * (/api/v1/lawyer/clients/[id], assertRole lawyer + firm) and RLS on
 * lawyer_clients (owner or active firm member) decide what the firm may read;
 * the page keeps every link under /dashboard/firm (usePathname there).
 * The previous mock is preserved in git history.
 */
export { default } from "../../../lawyer/clients/[id]/page";
