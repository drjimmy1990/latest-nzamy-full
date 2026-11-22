# SECURITY.md — Nezamy MCP / Lawyer API v1 threat model

Status: design + tested client/server code. Platform side (`platform-patch/`) is DRAFT, not applied.

## Principles
1. The MCP server holds no secrets and no database access. It passes the caller's own token to the platform; the platform is the only authority.
2. Every gate the website applies to the paid library must be re-applied on `/api/v1/ext/*` (the proxy only guards cookie sessions).
3. The AI never invents citations; library statuses are library-owned.

## Threats and mitigations
| Threat | Mitigation | Where |
|---|---|---|
| Token theft | Hashed at rest, shown once, scopes, 90-day expiry, revocation, `last_used_at`, per-token rate limit; client never logs/echoes tokens (tested) | migration.sql, client, http.ts |
| Library scraping / quota bypass | Same read quota, device limit and paywall as web; PAT counts as one device; text capped per call (`clip`); per-token 60/min at MCP and platform | REUSE_MAP |
| Prompt injection via library text | Text fenced in `<library_text>` blocks, tag-closing neutralised, "data not instructions" note; no tool can act on fetched text; tools are small and typed | format.ts (tested) |
| Points abuse / double charge | Quote first, `confirm_charge=true` required, deterministic idempotency key, platform daily limit + balance, refund on failure | tools.ts (tested) |
| Cross-tenant leakage | Per-request client built from the caller's token; no shared state/cache between callers; platform queries filtered by token's `user_id` | http.ts, REUSE_MAP |
| Browser-based abuse (DNS rebinding/CSRF) | Origin allowlist (claude.ai, claude.com, nezamy.sa), Bearer only (no cookies), 256KB body cap | http.ts (tested) |
| Token in transit | https enforced by client; plain http only with explicit localhost opt-in | client (tested) |
| Sensitive case data leaving | Tools send only what the lawyer typed; no file tools in v1; audit log stores metadata only | design |
| Open redirect / code interception (OAuth) | PKCE S256 only, exact redirect_uri match, 60s single-use codes | migration.sql (phase 2) |

## Owner decisions needed
- What library text may leave the platform (full article text vs. snippet) and daily read quota per token.
- Who pays points for runs started from Claude/Word (the lawyer's own balance is the assumption).
- Whether a PAT counts as a device and how many PATs a user may hold.
- PAT first (simple) or OAuth first (one-click connector in Claude).
