# AI services: lawyer and individual — inventory and build order (2026-10-26)

**Sources:**
- the code on main 931c9ff8: `src/constants/lawyerAiCatalog.ts`, the sidebars `navigation.sidebars.legal.ts` and `navigation.sidebars.primary.ts`, and `src/constants/clientServiceCatalog.ts`;
- owner prices from the 25-Oct pricing doc §5;
- his answers ٢٨٣ (analyze tiers, case-brief merged), ٢٨٤ (individuals pay in points), ٢٩١ (canvas AI card) and ٢٩٦ (no price on demo tools);
- AI model choice ٢٧٥: Haiku for quick tasks, Sonnet for deep work, no Opus.

**Where things stand.** Only two features call an AI model today:
- the library assistant (RAG, `src/app/api/ai/library-chat`);
- «شرح المادة» (`src/app/api/ai/explain-article`).

Every other tool has a screen, but its result is either a canned sample hidden behind `BetaReviewGate`, or a service order the team fulfils by hand. Building a tool means wiring its screen to a real model. Also, no tool charges points yet: `debit_points` has no caller.

---

## Lawyer tools (and firm)

| # | Tool | Page | Owner price (points) | State today |
|:-:|---|---|---|---|
| 1 | الصائغ القانوني | `/ai/draft` | 500 lawsuit / reply / rejoinder / supplementary / closing · 1,000 appeal · 1,500 cassation / petition for review | Becomes an order the team fulfils |
| 2 | محترف العقود | `/ai/contracts` | 1,000 | Screen only |
| 3 | محترف العقود المختصر | `/ai/contract-drafter` | 500 | Sample behind the gate |
| 4 | الرأي الفصل | `/ai/legal-opinion` | 800 full · 400 medium | Sample behind the gate |
| 5 | المستشار الذكي | `/ai/consult` | 100 | Sample behind the gate |
| 6 | المحاكي الشامل | `/ai/wargaming` | 250 | Screen only |
| 7 | محلل قوة الموقف | `/ai/analyze-strength` | 250 | Sample behind the gate |
| 8 | مراجعة وتدقيق مذكرة | `/ai/brief-check` | 200 | Sent to the team |
| 9 | عصارة المرفقات (absorbs «الموجز القضائي», ٢٨٣) | `/ai/analyze` | 30 for 1–5 pages · 150 for 6–30 pages, OCR included | Coming soon |
| 10 | سؤال قانوني سريع | `/ai/quick-answer` | 20 | Sample behind the gate |
| 11 | منقح ناجز | `/ai/najiz-optimizer` | 15 | Screen only |
| 12 | المتحدث الذكي | `/ai/communicate` | 5 | Sample behind the gate |
| 13 | المساعد المتقدم | `/ai/assistant` | Not priced in the doc | Sample behind the gate |
| 14 | مساعد المكتبة (RAG) | inside `/laws` | 5 flat (٢٥٧) | **Works now**, not charged yet |
| 15 | شرح المادة | inside the law page | — | **Works now** |
| 16 | الكانفاس: AI-generated card | case file | 10 (manual cards free, ٢٩١) | Manual only |
| 17 | القوالب | — | 50 | No screen |
| 18 | الاستجواب | — | 150 | No screen |
| 19 | العناية الواجبة | — | 3,000 | No screen |
| 20 | مراجع العقود · مفاوض العقود | `/ai/contract-reviewer` · `/ai/contract-negotiator` | 300 (+15 per page) · 200 | **On hold**: no price or sale until real (٢٩٦) |
| 21 | المفرّغ الذكي · السكرتير الذكي · المقارن الذكي · المترجم القانوني · داعم الاتجاه | `/ai/transcriber` · `/ai/secretary` · `/ai/compare` · `/ai/legal-translate` · `/ai/direction-support` | 15 · 5 · 10 · 50 · 100 | Coming soon; price stored, hidden (٢٨٣) |
| — | المجمّع البحثي · المرشد القضائي · الحاسبة القانونية · راصد التشريعات | `/ai/collector` · `/ai/procedures` · `/ai/fee-calculator` · `/ai/monitor` | Free | Not AI, or don't need a model |

The founder membership (2,996/yr) includes:
- 6 qualifying drafter works, each one subject, one procedural stage and one output;
- one output from one of: محترف العقود, الرأي الفصل, المحاكي الشامل, داعم الاتجاه (٢٩١ / ٢٩٢).

---

## Individual tools (points: 1 point = 1 SAR, ٢٨٤)

| # | Tool | Page | Price (points) | Same engine as lawyer # |
|:-:|---|---|---|---|
| A | المستشار الذكي (extra question) | `/ai/consult` | 15; one free question a day | 5 |
| B | الفاحص الذكي | `/ai/analyze` | 30 / 150 | 9 |
| C | صائغ الخطابات / الشكوى | `/dashboard/client/letters` | 50 | 12 |
| D | تقييم موقف القضية | service catalogue (`ai-case-eval`) | 75 | 7 |
| E | فحص عقد ذكي | service catalogue (`contract-analyze`) | 250 | part of 2 |
| F | عقد مبسّط ذكي | `/ai/contract-drafter` | 500 | 3 |

**Not in points:** fees for a licensed lawyer, notarisation and transaction follow-up stay in SAR (٢٨٤, SAMA rules).

---

## Suggested build order

**Step 0: the shared foundation, needed before any tool.**
- **One AI service:** a server route that calls the model, picks Haiku or Sonnet per task, and grounds answers in the library through the existing RAG.
- **Real point charging:** wire `debit_points`. Charge after the output is delivered, and refund on failure.
- **Limits:** per-user usage limits and logging.
- **Gating:** the frozen-account gate, and the same honesty rules — no invented percentages or sources.

| Step | Build | Covers |
|:-:|---|---|
| 0 | Shared foundation | — |
| 1 | المستشار الذكي | lawyer #5 and #10, individual A. Reuses the library RAG, so it is the quickest real win |
| 2 | عصارة المرفقات / الفاحص الذكي | lawyer #9, individual B (OCR + summary, two tiers) |
| 3 | الخطابات والمتحدث | individual C, lawyer #12 |
| 4 | تقييم الموقف + محلل قوة الموقف | individual D, lawyer #7 |
| 5 | Contracts: فحص عقد → المختصر → محترف العقود | individual E and F, lawyer #3 and #2 |
| 6 | الصائغ القانوني | lawyer #1: the biggest and most valuable, built on steps 0–5 |
| 7 | الرأي الفصل · المحاكي الشامل · مراجعة المذكرة · منقح ناجز | lawyer #4, #6, #8, #11 |
| Later | الكانفاس AI card, القوالب, الاستجواب, العناية الواجبة, the coming-soon tools, مراجع/مفاوض العقود | lawyer #16–#21 |

**Recommendation:** start with steps 0 and 1 together. They bring three pages to life at once (lawyer consult and quick answer, individual consult) and build the base every later tool needs.

**Decisions before step 0:**
- the AI provider key on the server (Claude);
- whether to charge points from day one or run free for a trial period;
- the daily free-question limit for individuals (owner: one free question a day).
