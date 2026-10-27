# AI tool workflows (n8n)

One self-contained workflow per AI tool. The plan is `docs/plans/2026-10-26-ai-services-n8n-plan.md`.

| File | What it is |
|---|---|
| `n8n/ai/workflows.mjs` | The single source: every tool's Code nodes and the shared workflow shape |
| `n8n/ai/<tool>.json` | The import file, written by `node scripts/n8n-ai-export.mjs` |
| `src/lib/ai/n8nWorkflows.test.ts` | Runs every Code node against fake packages and fake Claude replies |

On n8n.asra3.com (all created **inactive**):

| Tool | Workflow | Id | Webhook path |
|---|---|---|---|
| L1 المتحدث الذكي | `NZAMY · AI · communicate (L1 المتحدث الذكي)` | `z9IsIwKfr40hEE4e` | `nzamy-ai/communicate` |
| L2 منقح ناجز R5 | `NZAMY · AI · najiz-optimizer (L2 منقح ناجز R5)` | `b3SSd5YoQmIjCgna` | `nzamy-ai/najiz-optimizer` |

Both use the same two credentials as wave 0: `NZAMY AI · inbound` and `NZAMY Anthropic (x-api-key)`. **No new credential is needed.**

**Moving to our own n8n:**
1. Workflows → Import from File, then pick `n8n/ai/<tool>.json`.
2. Open the **Webhook** node and select the inbound credential.
3. Open the **Claude** node and select the Anthropic credential.
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
2. **n8n** (https://n8n.asra3.com): open each of the two workflows above and flip **Active** on. This works only after wave-0 step 5 (the four secret values) is done.
3. **Switch the tools on for the test** at `https://nezamy.sa/dashboard/admin/ai-usage` (as admin): set `communicate` and `najiz-optimizer` to **مفعّلة**, then press **حفظ**.
4. **Test المتحدث الذكي.** Open `https://nezamy.sa/ai/communicate` in a **private window**. Browsers keep the old redirect to `/ai/legal-opinion`, and a private window has no memory of it.
   - Pick «رسالة واتساب», write two lines, and press «اكتب الرسالة».
   - A real message should appear in a few seconds, and «أرسل عبر واتساب» opens WhatsApp with the text.
5. **Test منقح ناجز.** Open `https://nezamy.sa/ai/najiz-optimizer` and paste a memo longer than 10,000 characters that cites a few articles («المادة (٧٧)») and judgment numbers («الحكم رقم ...»).
   - Press «تنقيح وتهيئة للناجز». This is free and instant.
   - The card «ما زال النص فوق ١٠٬٠٠٠ حرف» appears. Press «اختصر بالذكاء الاصطناعي».
   - The result is 9,000 characters or fewer, followed by the line «تحقق النظام من بقاء كل المراجع».
6. **Switch both back to متوقفة → حفظ.** They stay off for lawyers until the AI-provider notice (decision D10) is in the privacy policy and the terms.
7. Send us a screenshot of each result and of the «آخر التشغيلات» table.
