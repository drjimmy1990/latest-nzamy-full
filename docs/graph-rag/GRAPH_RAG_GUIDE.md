# Legal GraphRAG — how to switch it on, fill it, test it and see it

Server repo folder: `/www/wwwroot/nzamy/latest-nzamy-full` (every command below runs there unless it says otherwise).

## What it is

- **Graph store**: the `library_graph` schema in Supabase. Every law article, judicial principle, decree and fiqh entry becomes a *node*. Links between them become *edges*: an article that cites another article, an exception, a parent law, a principle that interprets an article, a decree that amends an article, and a shared legal concept. Each node also gets a 768-number vector (`gemini-embedding-2-768`) for meaning-based search.
- **Structure** (since `20261115_10`): each law or regulation also has a `law` node, and each titled chapter a `chapter` node. Every article is linked `PART_OF` its chapter (or its law), and `NEXT_ARTICLE` to the article after it. These outline nodes are never embedded, so they add no embedding cost and no missing vectors.
- **Depth**: a search finds articles directly (hop 0), then follows links one step (hop 1: exceptions, amendments, interpretations, citations, the parent law, and the next article of the three strongest results), then one more step from the six strongest hop-1 results (hop 2, at half the weight). An exception, amendment or interpretation always passes on hop 2. A citation or parent-law link passes only when its text is close in meaning to the question, so hop 2 needs vectors. The search never walks `PART_OF` and never returns law, chapter or concept nodes. Each result says which hop found it.
- **Watchdog**: the PM2 app `nzamy-graph-watchdog` (`scripts/graph-watchdog.mjs`). It checks every 30 s. When the library has changed and then been quiet for 3 minutes, it rebuilds the graph from `library.*` (read-only, it never writes to the library). Then it embeds the nodes that still have no vector.
- **The switch**: `NZAMY_GRAPH_RAG=on` in `.env.local`. While it is off (the default), every AI run uses the keyword search exactly as before. While it is on, a run first asks the graph, giving it at most 2.5 s. It falls back to the keyword search on an error, on a timeout, when the graph is not ready, or when the graph finds nothing.
- **Ready** means all three hold: the graph has nodes, at least one sync pass has finished, and the library has not changed since that pass. While the owner is uploading laws, the graph turns itself off until the next pass.
- **Explorer**: `/dashboard/admin/graph-explorer`, a staff-only page to browse the graph and try questions.

## 1. Apply the SQL files (once)

Run in this order, from the server repo folder after `git pull`:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261113_10_library_graph_explorer.sql
```

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261114_10_library_graph_rag_fixes.sql
```

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261115_10_library_graph_depth.sql
```

What to expect on screen: each file ends with a `check | ok` row where `ok` is `t`. The second and third files also print `NOTICE: 20261114_10 verify: OK` and `NOTICE: 20261115_10 verify: OK`.

`20261115_10` must run **before** deploying the code that ships with it: that code writes the new `law` / `chapter` nodes and `PART_OF` / `NEXT_ARTICLE` links, which the old lists refuse. After that deploy, ask for one full rebuild:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c "select public.graph_rag_sync_control('mark_dirty_now', '{\"reason\":\"graph_depth_20261115\"}'::jsonb);"
```

Then run the shared check:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "graph|ERROR"
```

What to expect on screen: the `library_graph_rag`, `graph explorer`, `20261114_10` and `20261115_10` rows all show `t`.

### 1b. The links and routing file (`20261116_10`)

It adds defined terms, «مع مراعاة» conditions, penalties, the library's own article → regulation links, links found from the vectors, and routing by section and judicial track (see "Routing" below). Like `20261115_10`, run it **before** deploying the code that ships with it:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261116_10_library_graph_links.sql
```

What to expect on screen: `NOTICE: 20261116_10 verify: OK` and a `check | ok` row with `t`. Then deploy (step 2), then ask for one full rebuild:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c "select public.graph_rag_sync_control('mark_dirty_now', '{\"reason\":\"graph_links_20261116\"}'::jsonb);"
```

Until that rebuild has finished, routing changes nothing. The law nodes don't carry their section yet, and the principles don't carry their track. When the graph is settled, the vector links (`SIMILAR_TO`, `REPLACED_BY`) build by themselves, a page of 150 nodes at a time, on quiet polls. They wait until at most 0.5% of articles and principles are still missing a vector. Until then the watchdog log shows `Vector links wait: …`. A link built against half the vectors would not be revisited.

The neighbour search filters by law (or collection) inside the vector index. That needs pgvector **0.8 or newer**, so the index keeps scanning until it finds neighbours outside the node's own law. On an older pgvector, a node in a large law or collection may find none. Check the version (screen output):

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c "select extversion from pg_extension where extname = 'vector';"
```

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

### Or: Google Cloud Vertex AI (bills the Cloud account, where Cloud credits apply)

The AI Studio key bills a separate prepaid balance; Google Cloud welcome/trial credit does not pay for it. Vertex AI bills the Cloud billing account instead, and its limits are far higher. Same model family, same 768 numbers per text.

1. In the Google Cloud project: enable the **Vertex AI API**, create a service account with the role **Agent Platform User** (`roles/aiplatform.user`), and create a JSON key for it. (An organization with "secure by default" policies blocks key creation: lift `iam.disableServiceAccountKeyCreation` for the project, create the key, then restore the policy. The key keeps working.)
2. Put the key in `.env.local` as one base64 line, never as a file in the project folder:

```
GRAPH_RAG_EMBEDDING_BACKEND=vertex
VERTEX_SERVICE_ACCOUNT_JSON_B64=<the JSON key, base64-encoded on one line>
GRAPH_RAG_EMBED_CONCURRENCY=8
GRAPH_RAG_BATCH_DELAY_MS=0
```

Optional: `VERTEX_LOCATION` (default `global`), `VERTEX_EMBEDDING_MODEL` (default `gemini-embedding-2`), `VERTEX_PROJECT_ID` (default: the key's project).

`GRAPH_RAG_EMBED_CONCURRENCY` sends that many batches of 100 at once (1–16, default 1). Both the watchdog and the website read these lines: the website embeds each question the same way, so restart both after a change. Vectors made by the AI Studio preview model are not mixed with Vertex ones: delete them once when switching (`delete from library_graph.node_embeddings where model_id = 'gemini-embedding-2-768'` and the same on `library_graph.embedding_vault`), and the watchdog re-embeds them.

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

## Routing by section and judicial track (since `20261116_10`)

- **The question's section.** If the question names a law, that law's section wins. Otherwise the twelve strongest results vote, weighted by score: an article votes for its law's section, and a Board of Grievances principle votes for `02` (administrative) or for its circuit's subject (`04` commercial, `01` criminal). Procedure (`00`) and international agreements (`29`) never vote. The section is decided at half the vote weight, and **confident** at two thirds with at least two votes. When the vote is split, there is no section and nothing is routed. "Section only" then shows almost the same results as "auto".
- **Articles** from another section are kept, but lowered: ×0.88, or ×0.7 when the section is confident. Procedure (`00`) is never lowered.
- **Board of Grievances principles** (administrative track) count fully for an administrative question, or when they cite a law of the question's strongest articles, or that law governs them. They are dropped when the section is confidently something else. Board volumes from the commercial or criminal circuits are judged like articles of `04` / `01`.
- **Ordinary courts** (the principles and decisions, the Court of Cassation reports, the Ministry of Justice precedents): every question except a confidently administrative one.
- **Committees** (quasi-judicial): each committee is tied to its governing laws (21 known committee families, plus the laws its own principles cite most). A committee principle needs one of those laws among the question's laws.
- **Explicit legal links always cross sections.** A result reached through an exception, condition, amendment, interpretation, penalty, citation, regulation, replacement or parent-law link is never lowered or dropped.

The AI always uses **auto**. The explorer's retrieval lab has three buttons to compare: **تلقائي** (auto), **القسم فقط** (section only: drops everything outside the section, while explicit links still cross) and **كل الأقسام** (no routing). A chip shows the section the question was routed to, and whether it was confident.

## Links from the vectors (since `20261116_10`)

- `SIMILAR_TO`: an article and an article **of another law**, or a principle and a principle **of another collection**, whose texts are very close in meaning. The retrieve walks it only when the question is close to the target too.
- `REPLACED_BY`: a repealed article goes to the closest active article, first in the law that replaced its law.

Options in `/www/wwwroot/nzamy/latest-nzamy-full/.env.local` (restart the watchdog after a change):

| Line | Default | Meaning |
|---|---|---|
| `GRAPH_RAG_SIMILARITY=off` | on | stops the step |
| `GRAPH_RAG_SIMILARITY_PAGE` | 150 (max 500) | nodes per database call |
| `GRAPH_RAG_SIMILAR_ARTICLE_MIN` | 0.80 | article ↔ article |
| `GRAPH_RAG_SIMILAR_PRINCIPLE_MIN` | 0.85 | principle ↔ principle |
| `GRAPH_RAG_REPLACED_SUCCESSOR_MIN` | 0.80 | repealed article → the replacing law |
| `GRAPH_RAG_REPLACED_ANY_MIN` | 0.90 | repealed article → any other active law |

How the thresholds were chosen, on a sample of the real library embedded with the same model:

- Two random articles of different laws never reached 0.80 (highest 0.79).
- 94% of repealed articles and their new versions did reach it.
- Principles of different collections never reached 0.85.
- Principles of the **same** collection did in 57% of pairs. That is why the same collection is never linked (repeated wording, not new knowledge).

The principle threshold is calibrated. The article threshold is **not proven** against the tail of the whole library: a random sample cannot show how many of ~100,000 articles have one close neighbour by chance. Watch the watchdog log: each step prints `Vector links: +N nodes (similar=S, replaced=R)`. If `S` runs well above `N` (roughly three times or more), the article threshold is too loose. Raise `GRAPH_RAG_SIMILAR_ARTICLE_MIN` (for example to 0.83), restart the watchdog, then rebuild every vector link:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c "truncate library_graph.similarity_state;"
```

A `SIMILAR_TO` link is stored one way, from the node that was processed. When a node's text changes, its own links are rebuilt, but links other nodes made to it stay until those nodes are processed again. The truncate above rebuilds them all.

## 7. Turn it on for the AI

**Go / no-go first:** in the explorer's retrieval lab, run the test questions with each of the three buttons (auto, section only, all sections). Each run shows its time. Every run should stay under **2500 ms**, which is the AI's limit, after which it falls back to the keyword search. If auto is slower than that, leave the switch off and tell the developers.

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
M=supabase/migrations; PG_IMAGE=pgvector/pgvector:pg16 bash supabase/tests/rls/run.sh supabase/tests/rls/prelude_extensions_schema.sql $M/20260626_legal_library_schema.sql $M/20260730_article_regulations.sql $M/20261110_10_library_graph_rag.sql $M/20261113_10_library_graph_explorer.sql $M/20261114_10_library_graph_rag_fixes.sql $M/20261115_10_library_graph_depth.sql $M/20261116_10_library_graph_links.sql supabase/tests/rls/library_graph_rag.test.sql
```

For the other database tests, run the same command with `library_graph_explorer.test.sql`, `library_graph_depth.test.sql`, `library_graph_links.test.sql` or `library_graph_routing.test.sql` as the last file.
