# TECHNICAL.md

## Packages
- `nezamy-client` (`@nezamy/client`): typed SDK for `/api/v1/ext/*` (zod schemas, Arabic errors, retry/backoff, idempotent runs). Shared by the MCP server and the Word add-in.
- `nezamy-mcp`: tools-only MCP server. 8 tools: search_library, get_article, graph_neighbors, check_citations, account_standing, run_legal_drafter, run_contract_drafter, get_run.
- `platform-patch`: spec + draft code for the platform (migration, route drafts, reuse map). Not applied.

## Architecture
tools.ts (SDK-independent registry) → served by `mini-mcp.ts` (dependency-free JSON-RPC, tested) over stdio.ts and http.ts (stateless Streamable-HTTP, JSON mode). `server-sdk.ts` adapts the same registry to the official `@modelcontextprotocol/sdk`; it is UNCOMPILED and UNTESTED because npm installs are blocked in this environment. Run `npm i` then compile it before relying on it.

## Auth
- Phase 1: PAT `nzy_pat_…` in `NEZAMY_TOKEN` (stdio) or `Authorization: Bearer` (HTTP).
- Phase 2: OAuth 2.1. The MCP server is a resource server: `/.well-known/oauth-protected-resource` points to nezamy.sa as authorization server. The platform must add: `/.well-known/oauth-authorization-server`, `/oauth/register` (RFC 7591), `/oauth/authorize` (login + consent page, PKCE S256), `/oauth/token` (code and refresh), revocation; tables are in migration.sql.

## Paid-tool flow
run_* without `confirm_charge` → `POST /ext/ai/runs/quote` (free) → user confirms → same call with `confirm_charge=true` → `POST /ext/ai/runs` with deterministic key → `get_run` polls.

## Tests (run with `npx tsx --test test/*.test.ts`)
client 19/19, mcp 29/29 (tools 19, transport 10: stdio child-process session, HTTP auth/Origin/rate/size). Typecheck clean. Mock server uses synthetic fixtures only; nothing was tested against the real platform.
