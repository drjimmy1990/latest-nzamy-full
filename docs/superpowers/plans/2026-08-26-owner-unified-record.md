# Owner's unified record, 26 August 2026 — build plan

**Source:** `السجل_الشامل_الموحد_لملاحظات_وقرارات_العميل_والشركة.md` — د. محمد's consolidated ruling on
the client and corporate accounts. It answers 9 of the 12 open questions and adds several items.

---

## 0. His answers to the 12 open questions

| # | Question | His answer |
|:---:|---|---|
| س١ | Terms / Refund escrow | **Rewrite them.** Delete Escrow, the 72h dispute window, the 14-day guarantee, and the liability cap. Replace with terms that comply with نظام التجارة الإلكترونية السعودي. Also remove any "beta / قيد التطوير" wording — it blocks the payment-gateway and bank approval. |
| س٢ | Companies: same form? | **Yes** — the same 3-step form (§3ب) |
| س٣ | "Instant AI" tools | **Reword** — «نماذج وقوالب استرشادية فورية», plus a «طلب التدقيق والاعتماد من محامي المكتب» button |
| س٤ | Orders page vs activity log | **The middle option** — Arabise the log and make rows open the order (§2ج/٣) |
| س٥ | Which taxonomy | **The 31 in the code** (row 16) |
| س٦ | Payment provider | ⚠️ **Still not named.** §5 is the preparation for approving one, not the choice. |
| س٧ | Receipt: server or browser | **Server**, plus a manual upload path for paper receipts (§7 — dual-proof) |
| س٨ | Wargaming memo: file or text-or-file | ❌ **Not answered** |
| س٩ | 23 letter types | **Group into families** (row 17) |
| س١٠ | `N8N_WEBHOOK_SECRET` | ❌ **Not answered** |
| س١١ | The SQL row count | ❌ **Not answered** |
| س١٢ | Ramy/Ashraf assignment | **Build it** — assign by name from the order card + an assignee filter (§6ب) |

---

## 1. His 18 rows against the code

Verified today, not assumed.

| # | Item | State |
|:---:|---|---|
| ٣ | SLA 48h / 2 revisions | ✅ **done** — `eeb86a7`, server-enforced |
| ١٢ | Source badges on the queue | ✅ **done** — `ACCOUNT_BADGE` |
| ١٤ | Client vs internal notes | ✅ **done** — `9728eb0`, with the leak guard |
| ١ | Client submit blocked by payments | 🔴 `requests/new/page.tsx:70,128` |
| ٢ | Client attachments discarded | 🔴 zero `uploadDocumentFile` calls in that file |
| ٤ | Long UUID order reference | 🔴 |
| ٥ | Edit-order button | 🔴 |
| ٦ | 19 mock corporate sections | 🔴 |
| ٧ | Corporate identity at signup | 🔴 CR dropped, name defaults to «شركة جديدة» |
| ٨ | Corporate document vault | 🔴 |
| ٩ | Free legal assessment form | 🔴 zero POSTs in `services/business/_components.tsx` |
| ١٠ | Public consultation booking | 🔴 `useConsultationForm.ts:36` — a 2200ms fake |
| ١١ | Escrow in the legal docs | 🔴 **10 hits** in `terms`, **4** in `refund-policy` |
| ١٣ | Ramy/Ashraf assignment | 🔴 |
| ١٥ | Receipts | 🔴 |
| ١٦ | Unify taxonomy on the 31 | 🔴 |
| ١٧ | Letter families | 🔴 |
| ١٨ | Reword the instant tools | 🔴 |

**15 to build.**

---

## 2. Build order

Sequenced so each wave produces something the owner can see working.

### Wave 1 — the client can actually order (items 1, 2)
The whole point. Nothing else matters if the form still stops at the payment gate and throws the files away.
- Remove the payment block; submit at amount 0 with the estimated price shown
- Real uploads through `useOrderAttachments` (the same hook the four lawyer wizards use), so the
  attachment→order binding at `service-requests/route.ts:293-329` picks them up
- Signed download URLs for the admin

### Wave 2 — stop losing leads (items 9, 10)
Two advertised entry points that capture data and discard it. Cheapest new volume on the board.

### Wave 3 — the company (items 6, 7, 8)
Hide the 19 mock sections · persist CR + legal representative at signup (and backfill) · document vault

### Wave 4 — admin assignment (item 13)
Assign by name from the order card, plus an assignee filter. **Note:** this is the *assignment* half.
Real permission tiers (what Rami may do vs Ashraf) is a separate, larger job — every admin still holds
full authority today.

### Wave 5 — compliance, and it gates the payment gateway (items 11, 18)
- Rewrite Terms + Refund Policy against نظام التجارة الإلكترونية السعودي
- Remove «قيد التطوير / تجريبي» wording — he says it blocks bank and gateway approval
- Reword the instant tools as templates + add the human-review button

### Wave 6 — polish (items 4, 5, 16, 17)
Short order reference · edit-before-fulfilment · unify on `LEGAL_TAXONOMY` (31) · letter families

### Wave 7 — receipts (item 15)
Server-generated PDF with serial, تفقيط and QR, plus the manual upload path. **Needs a QR package that
is not installed**, and server-side PDF generation which the current deps cannot do.

---

## 3. Still blocked

- **س٦ — no payment provider named.** Wave 5 is the *preparation* for approval; the choice itself is
  still outstanding, and `/pay/[token]` cannot be scoped without it.
- **س٨** — wargaming memo requirement unanswered. Current behaviour (text **or** file) is deliberate and
  cites his own field test; left as is.
- **س١٠ / س١١** — the VPS webhook secret and the row count are his to run.

## 4. Note on the legal rewrite

Wave 5 rewrites a law firm's Terms of Service. He asked for it and gave the standard to write against, so
it proceeds — but the draft goes to him for review before it is treated as final. A developer should not
be the last reader of that text.
