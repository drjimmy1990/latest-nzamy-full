# Owner package 2026-11-02: gap analysis and build plan

**Source:** `C:\Users\LOQ\Downloads\حزمة_المبرمج_٢٠٢٦-١١-٠١\` (249 files, 16 MB). I read it only and ran nothing from it.

**Compared against:** main `80ea10ad`, which is production and includes the founder membership.

**How it was checked:** six read-only checks, one per slice. Their full reports, with file:line evidence, are in this folder:

| Slice | Report | Rows | Done | Partial | Missing | Conflict | Ops only |
|---|---|---|---|---|---|---|---|
| A: P0 security, prices, plans, coupons, admin switcher | `A-security-pricing.md` | 22 + 9 price mismatches | 3 | 5 | 6 | 5 | 3 |
| B: Library: quotas, locks, visitor masking, 7 bugs | `B-library.md` | 36 | 10 | 12 | 12 | – | 1 |
| C: AI architecture, studios, sharing, collector, telemetry, 21 screenshots | `C-ai-architecture-studios.md` | 34 | 1 | 13 | 14 | 4 | 2 |
| D: The ~40 "genius" AI tools and redirects | `D-ai-tools.md` | 44 | 0 | 16 | 25 | 3 | – |
| E: Chrome extension, platform sync, canvas studio | `E-extension-canvas.md` | 46 | 7 | 10 | 21 | 5 | 2 |
| F: Firms, cases, clients, letterhead, murshid data | `F-firms-cases-murshid.md` | 30 | 4 | 6 | 17 | 1 | 2 |

## 1. The finding that shapes the whole plan

**The "189 golden files" are the old mock screens.**
- 188 of the 189 are byte-for-byte the repository's first commit (5a6a7242, 3 Jun 2026).
- None of them calls the server: there is no fetch, `/api/`, Supabase, n8n or `useAiRun`.
- 75 of them show invented results after a `setTimeout`. One example is a hard-coded «قوة الموقف ٧٨٪».
- The golden `share/[token]` accepts any 6-digit passcode. The golden StepApproval makes its passcode with `Math.random` and never stores it.

**We removed these screens on purpose.** Commits a92743a0, 41007a5c and c15da9e4 cite owner answer ١١٥. The owner's own pricing document in this same package (line 303, decision ٢١٦) keeps unfinished tools «قريباً» until each one has a live backend.

**Plan rule: a screen comes back only together with its real backend, one tool at a time.**
- Until then it stays «قريباً».
- We reuse the golden layout and components wherever they help, but never their sample data or fake timers.

This is owner question ٤٠٨ below. Without his agreement the "restore" order cannot be done honestly.

## 2. Already live and dangerous: fix first

1. **`/forgot-password` is fake.** It says «تم بنجاح» and resets nothing (`src/app/forgot-password/page.tsx:505-532`), and the login page links to it.
2. **The library AI leaks money.**
   - The old routes `/api/ai/library-chat` and `/api/ai/explain-article` still answer for free.
   - A reader the security monitor has locked can still use the library AI (`readQuota.ts:66-70` does not cover `/api/v1/ai/runs`).
3. **The AI "review" mode takes points and gives nothing back.**
   - It charges at the start and hides the output, even from admins (`runCore.ts:564`, `runs/[id]/route.ts:40`).
   - There is no release or reject action, and the sweep never refunds it.
   - It must not be switched on until it is fixed.
4. **Shown prices don't match charged prices.** `/pricing` and the AI hub show 15 / 10 / 15–20 / 5 points; the server charges 200–1,500.
5. **False claims on live pages.**
   - Templates claims «AI-powered» with no AI behind it.
   - The debt-collection notice says «المستحق علينا» and calls itself «سنداً قانونياً معتمداً».
   - Gated tools run a fake progress bar and then say "not available".
6. **Plans the owner has cancelled are still for sale:** ind-preventive 1,490, ind-litigation 3,990, and the monthly ind-ai cycles. **Switching Moyasar to live before fixing this would sell them.**
7. **Public download of protected content.** About 34 MB of principles and the book «مصادر الحق» are built into the site's public JavaScript (`precedents/[slug]/page.tsx:316-358`, `book/[slug]/page.tsx:636`).
8. **Privacy page:** it still says we train AI on anonymized data (`src/app/privacy/page.tsx:34`). The owner's patch for those two lines is safe to apply.
9. **The untracked `src/app/api/v1/najiz/sync/route.ts` in the main folder must never be committed.**
   - Any Bearer string longer than 10 characters becomes the user id.
   - It writes with the service client, bypassing RLS, and can overwrite other users' cases.
   - It invents the client side and hearing dates, and stores opponents' ID numbers in plain text.
10. **Contract-drafter "out of credit" banner** shows to every account, admins included, because it reads a field nothing writes.

## 3. What the owner asks for that is not code (the user's steps)

- **GitHub:** make the repository private, then rotate every key that was ever committed.
- **n8n:** turn off "Save successful production executions" on the live instance. Seven workflow JSONs in the repo also save them; we change those in code.
- **Turnstile:** put the live site and secret keys on the server, then rebuild, because the site key is baked in at build time.
- **Moyasar live:** only **after** wave 1 below stops selling the cancelled plans and shows the real prices.
- **«تعذّر الاتصال بالخادم»** (screenshots 03, 04, 17, 21): check the app and nginx logs. The pattern points to a non-JSON 502/504 timeout.
- **Library settings an admin can change now, no deploy:**
  - **First** set `lock_after_refused` to **0**. Today's locks never expire, so lowering the caps would lock real readers until an admin steps in.
  - Then set: 90 docs/day, 240 requests/hour, 60 searches/hour, 180 docs per 7 days, 6 h × 25, action "slow down", 90-day retention.
- **Library AI (L5 `library-assistant`):** switching it on is an admin action.

## 4. Conflicts the owner must settle

These are questions ٤٠٨–٤٣٠ in `owner-questions.ar.md`. Each has its sources in the slice report.

**AI tools and prices**
- **Restore the golden screens vs answer ١١٥ and decision ٢١٦.** It is q٤٠٨.
- **Wargaming:** 250 live, 150 or 75 in the guide, 75 in the canonical document.
- **Drafter claim:** 500 live, 200 now. Rejoinder, supplementary and closing memos have no price from him.
- **Legal opinion:** consult and letter are 400 live; he wants 100 and 50.
- **Assistant and quick answer:**
  - assistant: 40 points for 15 messages wanted, 100 points for 5 messages live;
  - quick answer: 15 points plus one free question a day wanted, 20 live.
- **Najiz condensing:** 5 live, 15 in the canonical document.
- **Discount:** the "subscriber discount" on the 500-point simple contract has no rate.
- **The `ungrounded` refund guard vs "remove the ungrounded block".**
- **The analyze-strength win-percentage gauge vs answer ١٩٣.**
- **The 15-point communicate tool:** the guide redirects it, but the canonical document keeps it as its own 5-point tool.

**Plans and money**
- **ind-smart:** 249 including VAT, yearly only (guide) vs 249 before VAT with monthly allowed (pricing document).
- **ind-litigation 365:** including or before VAT? And should the 496-seat client founder be built now? The founder kit said its prerequisites are missing.
- **Marketplace commission:** the guide abolishes 5% with a 7% floor. The pricing document and the founder brochure promise founders 5%. The live terms say 5–15%. No commission engine exists.
- **Top-up bonus:** does the offer-period bonus (25 Oct – 25 Jan) apply now?
- **q335 (open the AI tools to everyone with points):**
  - The Pro gate is what keeps paywalled article text from free users.
  - Proposal: free users get short excerpts only.
  - Which roles get access?

**Library**
- **q380 (hide decree numbers, dates and links from visitors) vs answers ٣١٨, ٢٦٣ and ١٨٣.**
- **His numbers conflict with each other:**
  - the hourly cap is given as a range (35–120), not one number;
  - 25 docs/hour for 6 hours can never fire under a 90/day cap;
  - the firm 60% review rule fires before a firm uses its own pool;
  - firms have no seat count yet.
- **"Five locks" are never listed.**
- **Device policy:** what happens to a third device?
- **Library requests:** may operations still approve them (answer ٢١٠ vs q376)? Operations should also be able to lift a lock (q372).

**Terms patch**
These clauses promise what the code can't do:
- immediate erasure of the imported archive;
- staff access only with the subscriber's consent;
- ZATCA Phase 2 e-invoicing;
- "using the site is express consent";
- dropping المعقب.

Zero-data-retention wording must wait until the AI provider confirms ZDR in writing.

**Extension**
- **His shipped manifest contradicts his memo §11ج1:**
  - it still has 15 government hosts, `tabs` and localhost;
  - it has no `activeTab`;
  - any nezamy.sa page can start a harvest without a click;
  - the renamed delay is still the same random delay.
- **Access model:** narrow firm-wide case access to case-team only (C4)? Cross-firm co-counsel (C5)?
- **Pages above 30 (+5/page):** the brief tool refuses them today.
- **The office graph:** keep `OfficeGraphPage` as the studio's map mode instead of deleting it.
- **Ministry of Justice no-objection** before publishing.

**Murshid data**
- **The bundle does not contain what the guide says.**
  - It has 15 channels, 32 sector summaries and 61 problem cards.
  - It has none of the 363 agencies, 862 circuits or 243 Najiz rows.
  - Its file list points to his own PC.
- **It reverses two of his decisions:** it publishes 920000529 instead of 920000553, and `info@pp.gov.sa`.
- **Wrong numbers:** three channels carry the wrong agency number.
- **The 10-day urgent cassation:** the text he cites matches Art. 187, and Art. 194 is not in our law export.
- **Corrections:** he says «١–١٠», but the file has 6.

**Firms**
- **VAT on firm invoices without Fatoora** may make them look like invalid tax invoices.
- **The Saudi prompt repository** he refers to is not in our workspace, so he needs to send it.

## 5. Build plan: waves in dependency order

Each wave is one branch, one SQL folder (if any), its own owner report, and a review before merge. These estimates are effort; review and testing add about 30%.

### Wave 1: Safety and honesty. No owner input needed. About 4–5 days
- **Stop selling the cancelled plans.** The owner already decided this in this package (q329, §6.2): ind-preventive 1,490, ind-litigation 3,990, the monthly, quarterly and semiannual ind-ai cycles, and the 199 launch price. Only the replacement prices wait on ٤١٩ and ٤٢٠.
  - Retire the ids and cycles in the book and in the admin catalog, and hide them on `/pricing`.
  - Existing buyers keep what they paid for.
  - **This blocks the live Moyasar switch.** The founder sale stays paused until that switch (R29), and its window closes on 25 Jan.
- **Real password reset:**
  - `resetPasswordForEmail` with a captcha token, plus a `/reset-password` page;
  - auth callback handling;
  - ops for the user: SMTP and the redirect allow-list on auth.nezamy.sa.
- **Library money and locks:**
  - delete the two free legacy library-AI routes;
  - make the library lock cover `/api/v1/ai/runs`;
  - let operations lift a lock.
- **AI review mode:** hide the "review" release mode from the admin switch until wave 3 makes it money-safe.
- **Truthful labels:**
  - show the server prices on `/pricing`, in the hub and in `TOOL_POINT_LABELS`;
  - fix the templates and debt-collection wording;
  - show «قريباً» on gated tools instead of fake progress bars.
- **Privacy:** apply the 2-line privacy patch.
- **n8n:** set `saveDataSuccessExecution: "none"` in the 7 workflow JSONs.
- **Small fixes:**
  - the contract-drafter credit banner;
  - PartyForm (representative ID + «أخرى»);
  - `*` markers on required fields;
  - the activity filter, made obvious;
  - Najiz copy: 9,000 characters, not 10,000.
- **Library small items:**
  - BUG-LIB-05 (wrong «سابق» badge);
  - the «مدمج» one-word badge;
  - the successor link on a repealed law's card;
  - the print fingerprint in Asia/Riyadh (computed at print time).
- **Cases (code only):**
  - the deadline default event is receipt of the judgment (q347);
  - Asia/Riyadh in `.ics` and Google exports (q352);
  - one «اطلب استشارة» button (q358);
  - hearings plus consultations in the clash check (q357);
  - court search with «أخرى» (q351);
  - drop the unverified prosecution e-mail (q386).

### Wave 2: Protected content and prices. After the owner answers. About 4–5 days
- **Principles and book server-side only (q390), done together with BUG-LIB-01:** delete the bundled JSON after checking the database holds all 33 collections and the book; in-reader search runs on the server.
- **q380 masking:** a migration to revoke the anon column reads, plus masking in the decree, init and search routes, according to his answer.
- **Search fixes:**
  - BUG-LIB-02: «لايكون» / «لا يكون»;
  - BUG-LIB-03: prefixes and `(+)`;
  - BUG-LIB-04: one search bar plus an ⓘ help icon.
- **Points repricing per his answers:** claim, consult, letter, assistant, quick answer (with one free question a day) and wargaming.
- **Individual plans:**
  - the new ind-smart and 365 plan prices, per ٤١٩ and ٤٢٠ (the old ids were retired in wave 1);
  - reprice or replace ind-litigation;
  - remove the 99-SAR items;
  - contract review 600 / 800;
  - if he says yes, the client founder 496-seat counter, reusing the founder seat code.
- **Top-up offer bonus and coupons:** the bonus is granted by the server clock; NEWCLIENT moves out of code into the coupon flag.
- **Terms:** the clause 9 Controller/Processor shield plus the clauses he accepts, with the commission text per his answer.
- **Auto-lock 24 h:** an `auto_lock_hours` setting read by the existing function, same signature.

### Wave 3: AI platform foundations. About 6–8 days
- **Money-safe review gate:** `ai_release_run` / `ai_reject_run`, where reject refunds; a sweep; an admin queue that shows the output; alerts by bell, e-mail and WhatsApp (needs n8n and keys).
- **Paywall-safe q335:** excerpts only for users without library access, then widen the roles per his answer.
- **Inputs:**
  - server-side docx/doc/txt/md to text;
  - an attachment preview modal;
  - «الصق النص» on brief-check, contract review and wargaming;
  - drop the forced specialty and branch (the AI infers them).
- **Collector hub:** «إرسال مع السياق إلى ▾», a typed hand-off to the 6 targets, and the save button on principles.
- **Activity log:** `ai_runs` in the unified log.
- **Live waiting telemetry:**
  - a `progress_events` table;
  - the run id returned before retrieval;
  - n8n callback details;
  - `<AiThinkingStage/>` on the 10 mount points.

  This is the largest item in the wave.

### Wave 4: AI tools, honest restore. About 3–4 weeks, in sub-batches
- **4a. UI on backends that already exist:**
  - case-brief merged into `/ai/analyze`, then the 301;
  - analyze-strength becomes a wargaming tab (no % gauge), then the 301s for it and memo-studio;
  - a real 301 for `/ai/research`;
  - the corp/ngo/micro contract tools route to contracts-pro or the contract drafter;
  - the quick-answer UI;
  - the Najiz v5.2 rules (fields marked «يحتاج تحقق», not deleted).
- **4b. New n8n tools on library retrieval:** direction-support (75), compare (50), legal-translate (50), monitor impact (15), mail-advisor (15), templates customisation (50), and corp HR / compliance / advisor / privacy. Each needs a workflow, a prompt, validators, a tools entry, points, and an admin switch from staff to live.
- **4c. Legal-opinion completion:** study (750), memo (350), cross-exam (60), due diligence (2,000).
- **4d. Studios on real AI:**
  - drafter section editor plus «عدّل هذا القسم»;
  - contracts clause editor;
  - contract review (250) and negotiator (150) jobs;
  - brief-check 5-dimension view.
- **4e. Client sharing:** a share table plus feedback, ClientSharePanel in the drafter and contracts, comment and approve on `/share/[token]`, share history, and the case sharing page last.

### Wave 5: Firm permission model, finance and letterhead. About 2 weeks
- **Small SQL guards:** keep the note author's name (q340), block deleting inherited sessions (q341), the m18 office kind (q339).
- **Permission model:** a `firm_member_permissions` table, then:
  - per-member print (q344);
  - case assignment (q350);
  - firm-level billing (q356);
  - a member lands on the firm dashboard (q338).
- **Firm finance:** reversal entry (q355), optional VAT (q354, per his answer), four client types (q349).
- **Letterhead:**
  - sanitised SVG logos (q346);
  - a verification card behind the barcode (q343);
  - real `.docx` and PDF letterhead export from the drafter, contracts and legal opinion (q345). This needs a new docx library.

### Wave 6: Library new models. About 1–2 weeks
- weekly 200 pool plus an exact 300/600 daily search cap;
- firm shared pool, once a firm seat source exists;
- invite codes with custom days and seats (q378);
- micro / NGO / provider eligibility flag (q375);
- device policy, 1 desktop + 1 mobile (q367);
- BUG-LIB-06 then 07: columns, loader pass-through, **the owner re-exports and loads** (we never run the seeder).

### Wave 7: Chrome extension and platform sync, then the canvas studio. About 3–4 weeks
- **Extension hardening, done on our copy:** the manifest per his memo §11ج1, no external trigger, a pinned origin, `storage.session`, an encrypted outbox, and the hamza bug in `resolveClientSide`.
- **Migrations `20261102_01/02/04/05`:**
  - devices, pairing and consent;
  - `request_kind` with the RLS gate, so synced cases never reach the marketplace;
  - hearings gov columns;
  - `attachments.archive_folder` 01–06 plus nullable BYOS columns;
  - `ai_document_cache`.
- **Routes:** `import-archive` with its aliases, `uploads/sign` and `complete` with server-side sensitivity filtering, ancillary, `portal-adapters-config`, and a rate-limit bucket.
- **UI:** `CaseSixFolderArchive` (never the vault), the "connect platforms" settings page, and seven-platform nodes on the graph.
- **Access model:** `can_access_case_file`, team roles and co-counsel. This needs his answers.
- **Canvas studio:**
  - a `canvas_boards` table, saved boards linked to an entity or free;
  - `/dashboard/lawyer/graph` becomes the studio, with the office map kept as one of its modes;
  - the 50-point strategist.

### Wave 8: Tools that need new data stores or outside services. Schedule after wave 4
- vault (storage plus table);
- NGO governance results (q337);
- secretary;
- CLM / corpmind;
- report generator;
- transcriber (needs a speech-to-text provider and keys);
- global comparative research (needs his chosen sources);
- gov suite (needs his decision on audience and liability).

**Murshid import of what actually arrived:** 15 channels re-keyed, 61 cards behind legal review, Najiz classifications once clarified. The 862 circuits and 363 agencies wait for his files.

## 6. Rough total
- **About 14–18 weeks of build work for one developer.**
- Waves 1–3 (about 3 weeks) make the platform safe, truthful and ready.
- Waves 4–8 are new product.
- Waves 1 and 2 run one after the other, because both edit `/pricing`, `tools.ts` and the price labels.
- Wave 5 (firms) touches different files, so it can run alongside them.
