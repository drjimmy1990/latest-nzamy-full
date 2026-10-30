# Owner's AI live test (29 Oct, prod = waves 0–3) — what each finding was and what changed

Source: the owner's 2026-10-30 handoff package (AI section). Prod had waves 0–3; waves 4–5 are merged but not deployed.
Branch `fix/ai-owner-30oct`. Nothing here is closed until it is deployed and the owner has re-tested it (owner wording: «مُصلَح في الكود — بانتظار النشر واختبار القبول»).

| # | Owner saw | Root cause (verified) | Fix | Status |
|---|---|---|---|---|
| 1 | case-brief / brief-check: «أرفق ملفاً واحداً على الأقل» with a file attached | `attachments.id` is a bigserial; PostgREST returns numbers (prod ids 37–39). `parseFileIds` accepted UUIDs only, so every vault file was refused | `aiFiles.ts` accepts positive safe integers (number or canonical digit string) as well as UUIDs; duplicates and junk still refused | code ✓, tests ✓ |
| 2 | quick-answer / assistant «ungrounded» for «تعريف عقد البيع» | The tsquery ANDs every word; «تعريف» never appears in م٣٠٧ «البيع عقد…», so the definition was excluded. (The 5,000-match cap was NOT the cause — every probe query was ranked) | `questionRefs.stripFraming` drops framing words from each search (app side) + the lib-queries prompt tells the writer not to write them | code ✓; prompt LIVE on n8n `s8MAOg4WTtt1yIUW`; prod probe: م٣٠٧ now S2 |
| 3 | «ما هي المادة الأولى من نظام العمل» answered from another regulation | No direct lookup: the article was only reachable by search | `articleRefs` (المادة + number/ordinal + named law) → law by name (`lawNamePattern`/`rankLaws`) → article by number, version in force first; read before any search; a named article is enough to answer when the writer returns no searches | code ✓; prod probe: نظام العمل م١ is S1 |
| 4 | Library assistant gave the same labour-law answer on two different law pages | The chat searched the whole library | `_library-assistant.ts` sends `law_slug` from `/laws/<slug>`; tools.ts validates it (`scopeFrom`); retrieval searches that law first (its hits all before the library's), and «المادة الأولى» with no law named means the page's law | code ✓; prod probe on social-security-law: S1–S6 all from that law |
| 5 | najiz-optimizer added a demand not in the memo | Prompt allowed it implicitly | Prompt: the closing requests are the original's own — none added, none dropped, amounts unchanged | LIVE on n8n `b3SSd5YoQmIjCgna` (prompt only; no app-side check of requests) |
| 6 | brief-check «اعرض تقرير الثغرات الآن» does nothing | Button is disabled until a PDF memo AND the client's capacity are set, with no reason shown; and with a file, #1 refused it | Reason line under the button; #1 | code ✓ |
| 7 | wargaming / analyze-strength human-only | Wave 4 not deployed | deploy | waits for deploy |
| 8 | echo `model_error` | not investigated (wave-0 test tool) | — | open |
| 9 | canvas-card entry point | entry is `src/app/dashboard/business/kanban/_graph-ai-card.ts`; not re-checked live | — | open |
| 10 | usage shows 0 tokens | the n8n Parse nodes report 0 (cosmetic) | — | open, cosmetic |

Probe: `retrieveLibrary` with the new code against the prod library (read-only, service key from `.env.local`, never printed), 30 Oct.

Tests: `node --test src/lib/ai/*.test.ts src/components/ai/*.test.ts` 155/155; `src/app/laws/[slug]/*.test.ts` 56/56; `tsc --noEmit` clean.
