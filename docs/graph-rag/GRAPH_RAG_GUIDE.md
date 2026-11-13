# Legal GraphRAG — how to switch it on, fill it, test it and see it

Server repo folder: `/www/wwwroot/nzamy/latest-nzamy-full` (every command below runs there unless it says otherwise).

## What it is

- **Graph store**: the `library_graph` schema in Supabase. Every law article, judicial principle, decree and fiqh entry becomes a *node*. Links between them become *edges*: an article that cites another article, an exception, a parent law, a principle that interprets an article, and a shared legal concept. Each node also gets a 768-number vector (`gemini-embedding-2-768`) for meaning-based search.
- **Watchdog**: the PM2 app `nzamy-graph-watchdog` (`scripts/graph-watchdog.mjs`). It checks every 30 s. When the library has changed and then been quiet for 3 minutes, it rebuilds the graph from `library.*` (read-only, it never writes to the library). Then it embeds the nodes that still have no vector.
- **The switch**: `NZAMY_GRAPH_RAG=on` in `.env.local`. While it is off (the default), every AI run uses the keyword search exactly as before. While it is on, a run first asks the graph, giving it at most 2.5 s. It falls back to the keyword search on an error, on a timeout, when the graph is not ready, or when the graph finds nothing.
- **Ready** means all three hold: the graph has nodes, at least one sync pass has finished, and the library has not changed since that pass. While the owner is uploading laws, the graph turns itself off until the next pass.
- **Explorer**: `/dashboard/admin/graph-explorer`, a staff-only page to browse the graph and try questions.

## 1. Apply the two SQL files (once)

Run in this order, from the server repo folder after `git pull`:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261113_10_library_graph_explorer.sql
```

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261114_10_library_graph_rag_fixes.sql
```

What to expect on screen: each file ends with a `check | ok` row where `ok` is `t`. The second file also prints `NOTICE: 20261114_10 verify: OK`.

Then run the shared check:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "graph|ERROR"
```

What to expect on screen: the `library_graph_rag`, `graph explorer` and `20261114_10` rows all show `t`.

## 2. Deploy the code

```bash
bash deploy.sh
```

Safe on its own: the switch is off, so the AI keeps using the keyword search.

## 3. Set the embedding key

Edit `/www/wwwroot/nzamy/latest-nzamy-full/.env.local` and add these lines (use a new key, not one pasted into a chat before):

```
GEMINI_EMBEDDING_API_KEY=<your key>
GRAPH_RAG_EMBEDDING_MODEL_ID=gemini-embedding-2-768
```

`GRAPH_RAG_EMBEDDING_MODEL_ID` must stay equal to the database's default model (`default_model_id` in step 5). Leave `NZAMY_GRAPH_RAG` out for now.

Optional, for the free tier: `GRAPH_RAG_EMBED_BATCH_SIZE=20` sends smaller batches. When Google answers "quota", the watchdog pauses and retries later by itself.

## 4. Start the watchdog (this fills the RAG with the laws)

```bash
mkdir -p logs && df -h /
```

```bash
pm2 start ecosystem.config.js --only nzamy-graph-watchdog && pm2 save
```

Follow it:

```bash
pm2 logs nzamy-graph-watchdog --lines 50
```

On screen you will see the passes: laws, then principles, decrees, fiqh, concepts and edges, then `Embedding…` batches. The first full pass takes minutes. Embedding every node can take hours on a paid key, or days on the free tier. The watchdog keeps going and resumes after restarts and deploys on its own. From now on, `deploy.sh` restarts it on the new code, but only if it is running.

The laws are always taken from the library itself. When the owner uploads or changes laws, the next pass picks them up about 3 minutes after the upload goes quiet. You do nothing.

## 5. Check progress

```bash
npm run graph:status
```

This prints JSON to the screen. Look at:

- `node_counts` / `edge_counts`: how much of the library is in the graph.
- `missing_vectors`: nodes still waiting for a vector. It should fall towards 0.
- `sync_state.last_synced_at` set and `sync_state.dirty` = `false`: the graph is **ready**.
- `recent_runs`: the last passes, with `succeeded` / `failed` and the error, if any.

The same numbers are on the admin page **استخدام الذكاء الاصطناعي** (`/dashboard/admin/ai-usage`), in the GraphRAG panel. Its **طلب مزامنة فورية** button asks for a pass now.

## 6. See the graph

Open `/dashboard/admin/graph-explorer` while logged in as staff. It is also in the admin sidebar as **مستكشف الجراف القانوني**, and there is a **فتح المستكشف** button on the AI usage page.

- **Overview**: counts per type, vector coverage, the most-linked nodes and the concepts.
- **Search**: type an article (for example `المادة 77 نظام العمل`) and open it. The canvas then shows its neighbours one or two hops away, with each link's type and the sentence it came from.
- **Inspector**: click a node to see its full text, status, links and whether it has a vector.
- **Retrieval lab**: type a question as a client would. It runs the same search the AI uses and shows which articles it would cite, and why (direct match, or reached through a link).

## 7. Turn it on for the AI

When step 5 shows the graph ready and `missing_vectors` at or near 0, add this line to `/www/wwwroot/nzamy/latest-nzamy-full/.env.local`:

```
NZAMY_GRAPH_RAG=on
```

Then restart the site:

```bash
pm2 restart nzamy --update-env
```

Test: ask the AI a legal question on the site, such as «هل يحق لصاحب العمل فصلي بدون مكافأة؟». The answer should cite the right articles. In the explorer's retrieval lab, the same question should show the same articles.

## Turning it off

Remove the `NZAMY_GRAPH_RAG=on` line, or set it to `off`, then run `pm2 restart nzamy --update-env`. The AI is back on the keyword search at once. The graph data stays.

To stop filling the graph:

```bash
pm2 stop nzamy-graph-watchdog && pm2 save
```

## Tests for developers

Unit tests (PC, repo folder):

```bash
node --test src/lib/ai/*.test.ts
```

Database tests need Docker and pgvector. Run them on the PC, from the repo folder in Git Bash:

```bash
M=supabase/migrations; PG_IMAGE=pgvector/pgvector:pg16 bash supabase/tests/rls/run.sh supabase/tests/rls/prelude_extensions_schema.sql $M/20260626_legal_library_schema.sql $M/20260730_article_regulations.sql $M/20261110_10_library_graph_rag.sql $M/20261113_10_library_graph_explorer.sql $M/20261114_10_library_graph_rag_fixes.sql supabase/tests/rls/library_graph_rag.test.sql
```

For the explorer's database test, run the same command with `library_graph_explorer.test.sql` as the last file.
