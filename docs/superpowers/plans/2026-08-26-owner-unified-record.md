# Owner's unified record, 26 August 2026 — build plan

**Source:** `السجل_الشامل_الموحد_لملاحظات_وقرارات_العميل_والشركة.md` — د. محمد's consolidated ruling on
the client and corporate accounts. It answers 9 of the 12 open questions and adds several items.

**Status: all 18 rows built.** Three questions remain unanswered and two of them still block work
(see §3). The Terms/Refund rewrite is a **draft pending his approval** (§4).

---

## 0. His answers to the 12 open questions

| # | Question | His answer | State |
|:---:|---|---|:---:|
| س١ | Terms / Refund escrow | **Rewrite them.** Delete Escrow, the 72h dispute window, the 14-day guarantee, and the liability cap. Replace with terms that comply with نظام التجارة الإلكترونية السعودي. Also remove any "beta / قيد التطوير" wording — it blocks the payment-gateway and bank approval. | ✅ draft |
| س٢ | Companies: same form? | **Yes** — the same 3-step form (§3ب) | ✅ |
| س٣ | "Instant AI" tools | **Reword** — «نماذج وقوالب استرشادية فورية», plus a «طلب التدقيق والاعتماد من محامي المكتب» button | ✅ |
| س٤ | Orders page vs activity log | **The middle option** — Arabise the log and make rows open the order (§2ج/٣) | ✅ |
| س٥ | Which taxonomy | **The 31 in the code** (row 16) | ✅ |
| س٦ | Payment provider | ⚠️ **Still not named.** §5 is the preparation for approving one, not the choice. | 🔴 blocked |
| س٧ | Receipt: server or browser | **Server**, plus a manual upload path for paper receipts (§7 — dual-proof) | ◐ partial |
| س٨ | Wargaming memo: file or text-or-file | ❌ **Not answered** | 🔴 |
| س٩ | 23 letter types | **Group into families** (row 17) | ✅ |
| س١٠ | `N8N_WEBHOOK_SECRET` | ❌ **Not answered** | 🔴 |
| س١١ | The SQL row count | ❌ **Not answered** | 🔴 |
| س١٢ | Ramy/Ashraf assignment | **Build it** — assign by name from the order card + an assignee filter (§6ب) | ✅ |

---

## 1. His 18 rows against the code

| # | Item | State | Commit |
|:---:|---|---|---|
| ٣ | SLA 48h / 2 revisions | ✅ done | `eeb86a7` |
| ١٢ | Source badges on the queue | ✅ done | `ACCOUNT_BADGE` |
| ١٤ | Client vs internal notes | ✅ done | `9728eb0` |
| ١ | Client submit blocked by payments | ✅ done | `4496176` |
| ٢ | Client attachments discarded | ✅ done | `4496176` |
| ٩ | Free legal assessment form | ✅ done | `0ae3310` |
| ١٠ | Public consultation booking | ✅ done | `0ae3310` |
| ٦ | 19 mock corporate sections | ✅ done | `5fcb5c2` |
| ٧ | Corporate identity at signup | ✅ done | `5fcb5c2` + migration |
| ١٣ | Ramy/Ashraf assignment | ✅ done | `3a97969` |
| ١١ | Escrow in the legal docs | ✅ **draft** | `bbaf6bd` |
| ١٨ | Reword the instant tools | ✅ done | `bbaf6bd` |
| ٤ | Long UUID order reference | ✅ done | `060fe0c` |
| ٥ | Edit-order button | ✅ done | `060fe0c` |
| ١٦ | Unify taxonomy on the 31 | ✅ done | `9d54e38` |
| ١٧ | Letter families | ✅ done | `9d54e38` |
| ١٥ | Receipts | ◐ **ledger done, PDF blocked** | `6bb9e74` + migration |
| ٨ | Corporate document vault | ✅ done | `6cb9d28` |

---

## 2. What each wave actually changed

### Wave 1 — the client can order (items 1, 2)
`receiver` was `"lawyer"` on 22 of 27 catalog services while the admin queue hard-filters
`receiver = 'ai_workspace'`. Orders were being **saved where nobody could see them**. Removed the
payment block, submit at amount 0 with the price shown as «السعر التقديري», real uploads through
`useOrderAttachments`.

### Wave 2 — stop losing leads (items 9, 10)
«التقييم القانوني المجاني» made zero POSTs; `/book/consultation` was a 2200 ms fake with a hardcoded
reference. Both pages are public and `POST /api/v1/service-requests` is 401 without a session, so a
new public `/api/v1/leads` endpoint carries them.

### Wave 3 — the company (items 6, 7)
Hid the mock sections; fixed the signup form → trigger contract (the trigger read
`raw_user_meta_data->>'company_name'`, which the form never sent, so **every** corporate row read
«شركة جديدة»; the CR was collected and dropped).

### Wave 4 — assignment (item 13)
Routing is **not** a claim: it leaves `status` alone (resolvePath keys the n8n webhook off status, so
`in_review` would fire the client's "work started" workflow), sends the client nothing, and writes its
own audit event. The assignee id is validated against `profiles.user_type = 'admin'` because
`assigned_to` is what `POST /api/v1/documents` checks before allowing a deliverable upload.

### Wave 5 — compliance (items 11, 18)
Escrow removed from Terms, Refund and eleven public pages, **replaced not deleted** — the liability
cap was defined *by* the escrow amount, and refund §٢ was the mechanism every promise in §٣/§٤ rested
on. Three invented provider testimonials removed from `/join`. «قيد التطوير» reworded to «غير متاحة
حالياً» everywhere (the marker stays — deleting it re-introduces the fabrication). The demo-gated
«بيانات تجريبية» banners were left alone: they are dead-code-eliminated from a supabase build.

### Wave 6 — polish (items 4, 5, 16, 17)
One `ORD-8F14E4` helper replaces three private formats. Edit-before-fulfilment with the gate shared
between component and handler (a *routed* order keeps `pending_assignment`, so status alone is not the
answer). One taxonomy with legacy aliases kept. Letter families, presentational only — no id renamed.

### Wave 7 — receipts (item 15)
`public.receipts` with a **database-generated** serial (a stored column over the table's bigserial —
two admins issuing in the same second cannot collide). تفقيط as a pure, 11-test function. Manual paper
upload. SELECT-only RLS, so the admin route is the only door.

### Item 8 — the vault
No new table: the vault is the account's unbound attachments. Attaching **copies**, because binding is
a move and would empty the vault on first use.

---

## 3. Still blocked — his to answer

- **س٦ — no payment provider named.** Wave 5 was the *preparation* for approval; the choice is still
  outstanding and `/pay/[token]` cannot be scoped without it.
- **س٨** — wargaming memo requirement. Current behaviour (text **or** file) is deliberate and cites his
  own field test; left as is.
- **س١٠ / س١١** — the VPS webhook secret and the row count are his to run.

## 4. Note on the legal rewrite — NOT FINAL

Item ١١ rewrote a law firm's Terms of Service. He asked for it and gave the standard to write against,
so it proceeded — but **the draft goes to him before it is treated as approved**, and two pieces of it
are substantive legal decisions rather than transcription:

1. **The liability cap.** Deleting Escrow removed the ceiling entirely, not just a promise. It now
   reads «قيمة الأتعاب المدفوعة فعلياً عن الخدمة محل النزاع». That number is his call.
2. **The refund mechanism.** Refund §٢ was replaced, not deleted, because §٣ and §٤ depend on it.

Article numbers are **deliberately not cited** — the text names نظام التجارة الإلكترونية ولائحته
التنفيذية and describes the rights. He adds the citations.

## 5. Blocked by a dependency decision — item ١٥, the PDF half

The receipt ledger, the serial and the تفقيط are built and the record is complete enough to render
from. The document is not, and needs a decision:

- **Server-side Arabic PDF.** The installed `jsPDF` ships Latin-only fonts and performs no bidi or
  letter joining, so Arabic renders as disconnected reversed glyphs. Needs an embedded Arabic font
  plus a shaping/bidi library.
- **The ZATCA QR.** No QR package is installed.

The admin panel says so on screen rather than leaving a gap to discover, and the paper receipt is
uploaded there in the meantime.

## 6. Migrations pending on production

Both additive; neither alters or drops anything.

1. `supabase/migrations/20260826_corporate_identity_persisted.sql` — **without it corporate identity
   is not saved.**
2. `supabase/migrations/20260826_receipts.sql` — **without it no receipt can be issued.**

## 7. Follow-ups noted, not built

- `/dashboard/admin/escrow` still exists as an internal console now that Terms no longer promise
  escrow. Left alone deliberately — gutting an admin surface is its own decision.
- The `/marketplace` subtree and `/lawyers/[slug]` still contain escrow copy; both are redirected by
  `BETA_MONOPOLY_MODE` and unreachable.
- Real permission tiers (what Ramy may do vs Ashraf) remain unbuilt — every admin still holds full
  authority. Wave 4 built the *assignment* half only.
- `micro/find-lawyer`, `register/provider` and `provider/profile` still carry their own specialty
  lists. `normalizeCategoryId()` resolves their values; the pickers themselves were not rewired.
