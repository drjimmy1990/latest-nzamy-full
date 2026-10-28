# AI services: what is built and how to test it (2026-10-28)

The code is all on `main` at `cf3584b4`, pushed to GitHub. That one deploy carries:
- AI waves 0, 1 and 2;
- the faster page loading (one shared account read per page);
- the najiz prompt fix.

**No SQL is needed for any of it.**

The plan this follows is `docs/plans/2026-10-26-ai-services-n8n-plan.md` (section 5, "Build order"). The full list of services is `docs/plans/2026-10-26-ai-services-inventory.md`.

---

## 1. How every AI tool works

1. The user presses the tool's button. The site calls `POST /api/v1/ai/runs`.
2. The site checks:
   - that the user is signed in;
   - their account type;
   - the Article 18 consultant block;
   - the tool's on/off setting;
   - the input;
   - the daily limit and the points balance.

   Then it charges the points. All of this happens before anything is sent to the AI.
3. **The library tools (wave 2) also run these steps:**
   - They check the library's closed switch and the Pro-or-higher rule.
   - n8n turns the question into 2–4 short library searches.
   - The site runs those searches and keeps the best articles and principles.
   - The AI answers only from those texts and marks each one it uses, as `[S1]`.
4. n8n (https://n8n.asra3.com) sends the text to **Gemini** (`models/gemini-3.1-flash-lite`) through an AI Agent node. **No Anthropic key is needed.**
5. The site checks the answer before showing it:
   - A source the site did not send is dropped.
   - The points are refunded when the AI fails, times out, finds no matching text, or cites nothing.
6. Every run is recorded in the `ai_runs` table and shown on the admin page `https://nezamy.sa/dashboard/admin/ai-usage`.

**Every tool is OFF until an admin opens it** on that admin page.

---

## 2. What is built

### Wave 0: the foundation
- **The run pipeline:** checks, charging, refunds, and the daily limits.
- **The `ai_runs` table:** run on prod, and the check passed.
- **The admin page** `/dashboard/admin/ai-usage`. Each tool can be set to:
  - «متوقفة»: off;
  - «للمشرفين فقط»: admins only;
  - «مراجعة»: review;
  - «مفعّلة»: live.
- **n8n:** the inbound key check, the callback, and the schedules workflow (every 10 minutes it fails stuck runs; daily, it clears old texts).
- **Two connection-test tools:** `echo-fast` and `echo-job`.

### Wave 1: text tools
| Tool | Page | Points | Who |
|---|---|:-:|---|
| **المتحدث الذكي** (letters, emails, WhatsApp, legal notices, complaint replies) | `/ai/communicate` | 5 | lawyers, firms |
| **منقح ناجز R5** (shortens a memo over Najiz's 10,000-character limit and keeps every article and number) | `/ai/najiz-optimizer` | 5 | lawyers, firms (not consultants) |

### Wave 2: answers from the laws library
| Tool | Page | Points | Who |
|---|---|:-:|---|
| **L3 سؤال قانوني سريع**: one question, a short cited answer | `/ai/quick-answer` | 20 | lawyers, firms on Pro+ |
| **L4 المستشار الذكي**: a chat of up to 5 messages, with 4 contexts (general, case, contract, research) | `/ai/assistant` | 100 per conversation of 5 messages | lawyers, firms on Pro+ |
| **L5 مساعد المكتبة**: the panel on every law page, plus the «اشرح لي» button on each article | `/laws/...` | 5 | every account type on Pro+ |
| **L6 بطاقة الكانفاس الذكية**: «اقترح سنداً نظامياً» on a case board, adding up to 3 law cards linked to library articles | case file board | 10 | lawyers, firms on Pro+ |

Admins can use every tool, and admins are never charged.

### Wave 3: documents
| Tool | Page | Points | Who |
|---|---|:-:|---|
| **L7 عصارة المرفقات / الموجز القضائي**: upload the case papers (PDF or photos, scanned pages included). A background job then returns the case card, the story, the highlights, the assessment (strong / medium / weak), the options, the questions, and what to ask the client for | `/ai/case-brief` | 30 up to 5 pages · 150 up to 30 pages | lawyers, firms |
| **L8 مراجعة وتدقيق مذكرة**: an instant gaps report for a PDF memo. The platform checks every cited article in the library: in force, amended, repealed or not found. The team order is unchanged | `/ai/brief-check` | 200 | lawyers, firms (not consultants) |

**L7 needs one extra step when you deploy it:** run `npm install` before `deploy.sh`, for the new page-counting package `pdf-lib`. The full steps are in `n8n/ai/README.md` («Wave 3, L7»).

### n8n workflows (all switched on, all refuse requests without the inbound key)
| Workflow | Id |
|---|---|
| `NZAMY · AI · communicate (L1 المتحدث الذكي)` | `z9IsIwKfr40hEE4e` |
| `NZAMY · AI · najiz-optimizer (L2 منقح ناجز R5)` | `b3SSd5YoQmIjCgna` |
| `NZAMY · AI · lib-queries (wave 2 search writer)` | `s8MAOg4WTtt1yIUW` |
| `NZAMY · AI · quick-answer (L3 سؤال قانوني سريع)` | `ZigypMIWBhyPHrp7` |
| `NZAMY · AI · library-assistant (L5 مساعد المكتبة)` | `P2wLRQW3ZjlXgNhe` |
| `NZAMY · AI · assistant (L4 المستشار الذكي)` | `iPXmJCQQ1QGzrIRf` |
| `NZAMY · AI · canvas-card (L6 بطاقة الكانفاس الذكية)` | `1g4hsswaWsaafkN5` |
| `NZAMY · AI · case-brief (L7 عصارة المرفقات)`, a job that doesn't save successful runs | `snPDkKndPA9wjIKr` |
| `NZAMY · AI · brief-check (L8 مراجعة وتدقيق مذكرة)`, a job that doesn't save successful runs | `bu9guzNEhaLbyAPd` |
| `NZAMY · AI · schedules (sweep 10 min + retention daily)` | `8Skwnqn9WIPOxcml` |
| `NZAMY · AI · echo-fast (wave 0 test)` / `echo-job` | `m8vLkLlOrmWj6qeO` / `9qqzoHhFfhY3Esdj` |

The import files for every workflow are in `n8n/ai/*.json`. How to update them, or move them to another n8n, is in `n8n/ai/README.md`.

### Tests already done
- **Gemini:** every workflow was tested live with real model calls. Results:
  - cited answers;
  - refusals when the texts don't answer;
  - planted instructions ignored;
  - a 11,491-character memo shortened with all 34 references kept.
- **المتحدث الذكي:** ran end to end on the live site from the admin account.
- **Code:**
  - the type check is clean;
  - the site build passes;
  - the full unit suite has 4,118 tests. The only 6 failures were already failing on `main` before this work.

### Also fixed along the way
- **Page loading:** pages read the account hundreds of times. 490 requests on `/ai/najiz-optimizer` now become about 7.
- **منقح ناجز:** the model used to merge references into a range («من 1 إلى 29»). It no longer does.
- **Error messages:** n8n's error node now keeps Gemini's real reason (for example «Service unavailable»).

---

## 3. Your steps (after the deploy)

**Deploy**, if it isn't done yet (server):
```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && git pull && nohup bash deploy.sh > /root/deploy-20261028.log 2>&1 &
```
```bash
tail -f /root/deploy-20261028.log
```
Wait for `✔ Deployed cf3584b4`, then press Ctrl+C.

### Step 3: open the tools for admins only
At `https://nezamy.sa/dashboard/admin/ai-usage` (as admin), set these 6 to **للمشرفين فقط**, then press **حفظ**:
- `communicate`
- `najiz-optimizer`
- `quick-answer`
- `library-assistant`
- `assistant`
- `canvas-card`

Don't choose «مفعّلة» yet. That opens the tools to everyone, before the privacy notice (D10) is published.

### Step 4: test as admin
Use a private window and sign in first at `https://nezamy.sa/login`.

1. **Page speed:**
   - Press F12 and open the **Network** tab.
   - Open `https://nezamy.sa/ai/najiz-optimizer` and press Ctrl+Shift+R.
   - The form should appear within a few seconds, and the request count should be far below 490.
2. **منقح ناجز** at `https://nezamy.sa/ai/najiz-optimizer`:
   - Open `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\test-najiz-memo.txt`, press Ctrl+A and Ctrl+C, then paste it into the page.
   - Press «تنقيح وتهيئة للناجز», then «اختصر بالذكاء الاصطناعي».
   - Expect a memo of 9,000 characters or fewer, and the line «تحقق النظام من بقاء المراجع المكتوبة بالأرقام».
3. **المتحدث الذكي** at `https://nezamy.sa/ai/communicate`:
   - Pick «رسالة واتساب», write two lines, and press «اكتب الرسالة».
4. **سؤال قانوني سريع** at `https://nezamy.sa/ai/quick-answer`:
   - Ask «متى يحق للمؤجر فسخ عقد الإيجار وإخلاء المستأجر؟». Expect a short answer with numbered links and a «المصادر» list.
   - Ask «ما عقوبة تهريب المخدرات؟». Expect a refusal («لم أجد…» or «لم تُجب…») with the points refunded.
5. **مساعد المكتبة** at `https://nezamy.sa/laws/civil-transactions-law`:
   - Ask a question in the «مساعد المكتبة — ذكاء نظامي» panel.
   - On an article, press «اشرح لي» and ask «اشرح لي هذه المادة». Expect a plain explanation that cites that article as source 1.
6. **المستشار الذكي** at `https://nezamy.sa/ai/assistant`:
   - Pick «قضية محددة» and ask «متى يحق للمؤجر فسخ عقد الإيجار؟».
   - Then ask «وماذا لو مات المستأجر؟».
   - Expect numbered sources and the footer «الرسالة ٢ من ٥». After 5 messages, «ابدأ محادثة جديدة» starts a new one.
7. **بطاقة الكانفاس الذكية**, on a lawyer case file's board (the board with «استيراد من القضية»):
   - Add two cards, e.g. «طلب المؤجر فسخ عقد الإيجار» and «المستأجر يرفض الإخلاء».
   - Select them, then press «اقترح سنداً نظامياً».
   - Expect up to 3 gold law cards, marked «اقتراح نظامي AI — راجعه قبل الاعتماد». Each card's notes hold the library link.
8. **Other pages still look right**, after the loading change:
   - `https://nezamy.sa/dashboard/admin`;
   - a lawyer dashboard (`https://nezamy.sa/dashboard/lawyer`), if you have a lawyer test account.

   Each should show its normal sidebar, with no «صلاحيات غير كافية».

Send screenshots. Every run can be checked in n8n and in the «آخر التشغيلات» table on the admin page.

**If anything breaks after the deploy**, this switches the site back to the previous build at once:
```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && bash deploy.sh --rollback
```

### Step 5: afterwards
- Leave the tools on «للمشرفين فقط», or set them back to «متوقفة», until the owner approves the privacy notice.
- n8n keeps a full copy of every successful run: the user's text, and the site's key in the request headers. Before lawyers use the tools, turn that off on the AI workflows: Settings → «Save successful production executions» → off. Failed runs are still kept, for fixing problems.

---

## 4. Open questions for the owner
1. **D10, privacy:** Gemini processes the text outside Saudi Arabia. The privacy policy, the terms and every AI screen must say so before lawyers get the tools.
2. **Lawyers below Pro:** may they use the library tools (L3–L6)? Today only Pro or higher, plus admins, can.
3. **منقح ناجز price:** 5 points (the pricing table) or 15 (the older plan)?
4. **المستشار الذكي:** 100 points per conversation of 5 messages (decision D3). Confirm.

---

## 5. What comes next

### Option A: the individual tools (easiest; they reuse the engines already built)
| Tool | Uses the engine of | Points |
|---|---|:-:|
| المستشار الذكي للأفراد (`/ai/consult`) | L3/L4, plus one free question a day | 15 |
| صائغ الخطابات / الشكوى (`/dashboard/client/letters`) | L1 المتحدث الذكي | 50 |

### Option B: wave 3, documents (larger: file upload, reading PDFs, jobs that run in the background)
| Tool | Page | Points |
|---|---|:-:|
| L7 عصارة المرفقات (includes «الموجز القضائي») | `/ai/analyze` | 30 for 1–5 pages · 150 for 6–30 pages |
| L8 مراجعة وتدقيق مذكرة (a gaps report and a citation check) | `/ai/brief-check` | 200 |

### After that
- **Wave 4, analysis:**
  - المحاكي الشامل: 250 points;
  - محلل قوة الموقف: 250 points.
- **Wave 5, writing documents:**
  - محترف العقود المختصر: 500 points;
  - الرأي الفصل: 400 or 800 points;
  - محترف العقود: 1,000 points;
  - الصائغ القانوني: 500 to 1,500 points.
