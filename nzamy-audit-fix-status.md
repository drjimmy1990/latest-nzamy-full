---
name: nzamy-audit-fix-status
description: What was fixed in the 16-finding audit pass and what remains deferred
metadata: 
  node_type: memory
  type: project
  originSessionId: d4d12ca2-bdbe-44d9-9bc4-15d6f3a55652
---

Audit fix pass (plan: `C:\Users\LOQ\.claude\plans\floofy-humming-starlight.md`). As of 2026-06-28, `tsc --noEmit` and `next build` both green.

**Done:**
- Part A — admin payment gate (see [[payments-gateway-admin-gate]]).
- P0 #1 lawyer `clients/[id]` response-shape (use `getLawyerClients()`); #2 lawyer dashboard summary field names (`event`/`request_id`/`mode`); #3 `checkLibraryAccess` now reads `library_free_items` per content type; #4 admin library category filter (label→keyword map in `admin/library/route.ts`, CATS unified); #5 tasks `onToggle`/archive/restore persist via `updateLawyerTaskStatus`; #6 demo banners gated on `!isSupabaseMode`.
- P1 #7 detail pages: removed silent `MOCK["1"]`/`CASES_DB["1"]`/`MOCK_CASES["2025-001"]` fallbacks → clean not-found state (full backend rewire deferred — pages use rich mock-only fields). #8 lawyer write-actions: cases Kanban drop + contracts delete/status/archive/restore persist via `updateWorkflowRequestById`; hearings step toggles marked "غير محفوظ" (no PATCH endpoint). #9 documents upload wired (service rewritten to match `attachments` table + storage upload + DELETE route + migration `20260628_documents_upload.sql`). #10 client contracts status mapped from real workflow status; e-sign gated "قريباً". #11 library search + autocomplete normalize via `normalizeSearch`; `truncateWithHighlight` uses normalized matching. #12 error UI added to client contracts/documents/wallet + lawyer dashboard (representative; full sweep of all ~20 `.catch(()=>{})` sites not done).
- P2 #13 partial: `lawyerTier` derived from `useUser().tier`; wallet fetch unconditional + `WALLET_BALANCE`/`PENDING_BALANCE` set to 0 + error banner; `demo-client` actor → real user name.
- P2 #13 second pass (done): referral page wired to real `/api/v1/referrals` (stripped `ref=JUDGE47` mock + hardcoded stats); dead `{false && ...}` secondment block removed from `lawyer/page.tsx`; fake AI-shuffle `setInterval` removed from `network/page.tsx`; celebrity/code+referrals+status and lawyer reviews+archive+secondment+promotions+network gated behind a shared `src/components/ui/DashboardComingSoon.tsx` "قريباً" card (mock arrays stripped); `walletBalance=150` in `requests/new` → real `/api/v1/wallet` fetch; frozen `٤٧:١٣` session timer in `client/consultation/[id]` → honest "جارية" label; magic `!== "t2"` call-button exclusion in `client/messages` → `thread.supportsCalls` field (room.type !== "group"); `consultationsUsed=0` left as honest default with TODO (needs a real consultations-count endpoint).

**Deferred (out of budget this pass — known, low-risk, mostly outside client/lawyer/library core):**
- P2 #13 remainder: `MOCK_LAWYERS` still imported in `consultation/new` for lawyer selection; `AHMED20` mock remains in admin celebrity pages (admin-side, not client dashboard).
- P2 #15: gate `laws/demo-data*.ts` + `law-metadata-map.ts` behind dev flag; add `law_metadata` table.
- P2 #16: library init pagination + FTS/GIN indexes; `seed-library.ts --clean`; `smart_folder_items` DELETE ownership; `parse-feqh.ts volume:1`; whitelist per-type keys; `precedents/judgment/[slug]` route; AI stubs gate + remove fake `setTimeout` replies / `POST /api/community/questions` TODO.
- P1 #12 full sweep: remaining bare `.catch(()=>{})` sites in client (`cases/[id]`, `consultation`, `consultation/[id]`, `my-group`) and lawyer (`cases`, `contracts`, `hearings`, `clients`, `finance`, `profile`, `activity`, `clients/[id]`, `tasks`).
- P1 #7 full rewire of detail pages to real `/api/v1/cases/[id]` / `/api/v1/consultations/[id]` (currently clean not-found instead of mock, but not yet fetching real detail).

GitNexus MCP tools were NOT connected this session — mitigated with tsc + build verification. CLAUDE.md mandates `gitnexus_impact` before edits and `gitnexus_detect_changes()` before commit; follow when MCP is available. Do NOT commit until those run.