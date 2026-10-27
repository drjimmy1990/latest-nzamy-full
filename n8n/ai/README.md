# AI tool workflows (n8n)

One self-contained workflow per AI tool. The plan is `docs/plans/2026-10-26-ai-services-n8n-plan.md`.

| File | What it is |
|---|---|
| `n8n/ai/workflows.mjs` | The single source: every tool's Code nodes and the shared workflow shape |
| `n8n/ai/<tool>.json` | The import file, written by `node scripts/n8n-ai-export.mjs` |
| `src/lib/ai/n8nWorkflows.test.ts` | Runs every Code node against fake packages and fake model replies |

On n8n.asra3.com (all created **inactive**):

| Tool | Workflow | Id | Webhook path |
|---|---|---|---|
| L1 المتحدث الذكي | `NZAMY · AI · communicate (L1 المتحدث الذكي)` | `z9IsIwKfr40hEE4e` | `nzamy-ai/communicate` |
| L2 منقح ناجز R5 | `NZAMY · AI · najiz-optimizer (L2 منقح ناجز R5)` | `b3SSd5YoQmIjCgna` | `nzamy-ai/najiz-optimizer` |

**The model.** Each workflow calls the model through an **AI Agent** node (no tools, one call) with a chat-model sub-node named **Model**.
- Today that is **Google Gemini** (`models/gemini-3.1-flash-lite`), on the instance's existing credential `Google Gemini(PaLM) Api account`.
- The other credential is `NZAMY AI · inbound`, on the Webhook.
- **No Anthropic key is needed.**

**Switching to Claude later** takes one node, with no app change:
1. Delete the **Model** node.
2. Add an **Anthropic Chat Model** node with an Anthropic credential.
3. Connect it to the Agent's *Chat Model* input.

To make that permanent, change `MODEL` in `n8n/ai/workflows.mjs` and re-export.

Gemini, like Claude, processes the text outside the Kingdom, so decision D10 applies the same way.

**Updating an existing workflow from its file** (keeps its id and webhook):
1. Open `n8n/ai/<tool>.json` in Notepad, then press Ctrl+A and Ctrl+C.
2. In n8n, open the workflow.
3. Click the empty canvas, press Ctrl+A, then Delete.
4. Press Ctrl+V, then **Save**.

**Moving to our own n8n:**
1. Workflows → Import from File, then pick `n8n/ai/<tool>.json`.
2. Open the **Webhook** node and select the inbound credential.
3. Open the **Model** node and select the Gemini (or other model) credential.
4. Save, then switch the workflow on.

---

## Wave 1: your steps (after wave 0's steps 1–8)

Wave 1 has no SQL and no new server variables.

1. **Deploy** (after we merge `feat/ai-wave1` into `main`), on the server:
   ```bash
   cd /www/wwwroot/nzamy/latest-nzamy-full && git pull && nohup bash deploy.sh > /root/deploy-wave1.log 2>&1 &
   ```
   ```bash
   tail -f /root/deploy-wave1.log
   ```
2. **n8n** (https://n8n.asra3.com): open each of the two workflows above and flip **Active** on. This needs the inbound key (wave-0 step 5, first row) but not the Anthropic key.
3. **Switch the tools on for admins only** at `https://nezamy.sa/dashboard/admin/ai-usage` (as admin): set `communicate` and `najiz-optimizer` to **للمشرفين فقط**, then press **حفظ**.
   - In this mode only admin accounts can run the tools. Lawyers still get «هذه الأداة غير متاحة حالياً», so no lawyer's data goes to the AI provider before the notice (decision D10) is published.
   - **Don't choose مفعّلة yet.** That opens the tools to every lawyer, and while charging is off they would be free.
4. **Test المتحدث الذكي.** Open `https://nezamy.sa/ai/communicate` in a **private window**. Browsers keep the old redirect to `/ai/legal-opinion`, and a private window has no memory of it.
   - Pick «رسالة واتساب», write two lines, and press «اكتب الرسالة».
   - A real message should appear in a few seconds, and «أرسل عبر واتساب» opens WhatsApp with the text.
5. **Test منقح ناجز.** Open `https://nezamy.sa/ai/najiz-optimizer` and paste a memo longer than 10,000 characters that cites a few articles («المادة (٧٧)») and judgment numbers («الحكم رقم ...»).
   - Press «تنقيح وتهيئة للناجز». This is free and instant.
   - The card «ما زال النص فوق ١٠٬٠٠٠ حرف» appears. Press «اختصر بالذكاء الاصطناعي».
   - The result is 9,000 characters or fewer, followed by the line «تحقق النظام من بقاء المراجع المكتوبة بالأرقام». The check covers only references written with digits; a spelled-out «المادة الخامسة» is not checked.
6. **Afterwards**, leave both on «للمشرفين فقط» or set them back to «متوقفة» → حفظ. They open to lawyers («مفعّلة») only after the AI-provider notice (D10) is in the privacy policy and the terms.
7. Send us a screenshot of each result and of the «آخر التشغيلات» table.
