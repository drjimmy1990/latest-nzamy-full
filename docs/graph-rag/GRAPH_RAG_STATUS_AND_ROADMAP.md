# Legal GraphRAG — what we built, where it stands, what comes next

Last updated: 2026-11-15. Read it with the operator guide, [`GRAPH_RAG_GUIDE.md`](GRAPH_RAG_GUIDE.md). The guide covers how to run the system. This file covers what the system is, how good it is, and what to build next.

---

## 1. In one paragraph

Every article, judicial principle, decree and fiqh entry in the Nzamy library becomes a **node** in a graph. Links between them become **edges**: an article that cites another, an exception, a decree that amends an article, a principle that interprets one, a regulation and its parent law. Each node also gets a **vector** (a 768-number meaning fingerprint) so search can match by meaning, not only by words. When the AI answers a question, it first finds the best articles directly. It then follows the graph one or two steps to pull in what a lawyer would also check: the exception to the rule, the amendment, the court's interpretation. Everything is built from the library text by fixed rules. No AI writes the links, so they cost nothing and are never invented.

---

## 2. The parts

| Part | Where | What it does |
|---|---|---|
| Graph store | `library_graph` schema (Supabase). Migrations `20261110_10` → `20261113_10` → `20261114_10` → `20261115_10` | Tables: nodes, edges, vectors, sync state and runs. Server-only: no access for `anon` or `authenticated`, and no foreign keys into `library.*`, so a library wipe never breaks it. |
| Builder | `src/lib/ai/graphBuilder.ts` | Pure functions that turn library rows into nodes and edges: citation reading, law structure, concepts. |
| Watchdog | `scripts/graph-watchdog.mjs` + `src/lib/ai/graphWatchdogCore.ts`, PM2 app `nzamy-graph-watchdog` | Checks every 30 s. When the library has changed and then been quiet for 3 min, it rebuilds the graph, prunes stale nodes, then embeds nodes that still have no vector. When the embedding quota runs out it pauses (15 min, doubling up to 6 h) and keeps every vector already stored. |
| Retrieval | SQL function `public.graph_rag_retrieve`; called from `src/lib/ai/retrieval.ts` (`retrieveLibrary`, `useGraph`) and `src/lib/ai/graphService.ts` | Hybrid search: keywords plus vectors plus concepts, fused by rank, then a graph walk of up to two steps. |
| Switch | `NZAMY_GRAPH_RAG=on` in `.env.local` (default **off**) | While off, the AI uses the old keyword search. While on, the graph gets **2.5 s** (`GRAPH_BUDGET_MS`). On an error, a timeout, a graph that is not ready, or no hits, it falls back to keyword search. |
| n8n endpoint | `POST /api/v1/ai/graph-retrieve` (`X-Nzamy-Key`, compared in constant time) | The same retrieval for n8n workflows. |
| Explorer | `/dashboard/admin/graph-explorer`, staff only | Overview, search, neighbourhood map, node inspector, and a retrieval lab that runs the AI's real search on a question. |
| Status | `npm run graph:status`; GraphRAG panel on `/dashboard/admin/ai-usage` | Node and edge counts, missing vectors, readiness, recent runs. |
| Benchmark | `npm run graph:benchmark` | Compares embedding models on colloquial Saudi questions. It measures embeddings only, not the graph. |

**Ready** means three things together: the graph has nodes, a pass has finished, and the library has not changed since that pass. While the owner uploads laws, the graph is "not ready" and the AI falls back on its own.

---

## 3. Timeline

| Date | What happened |
|---|---|
| 2026-11-10 | Another agent shipped the first version (`20261110_10`). It was on prod with 0 nodes, and the watchdog had never started. |
| 2026-11-13 | The review found 8 blockers. Among them: calls to functions pgvector does not have (`halfvec_dims`, `pg_catalog.greatest`), and a readiness check that could report a stale graph as ready. |
| 2026-11-14 | Fixes in `20261114_10`, plus the switch, the 2.5 s budget and the fallback. The explorer was integrated (`20261113_10`). Deployed. The deploy also needed a font fix: JetBrains Mono is now shipped from the repo. |
| 2026-11-14/15 | First full build on prod: **364,376 nodes, 6,667 links, 32 concepts**. Watchdog memory limit raised to 1500M, because 400M restarted it in the middle of a pass. The free Gemini key embedded 1,000 nodes per day. |
| 2026-11-15 | **Depth batch A + B + C** (`20261115_10`, commit `0c8cc788`). Deployed, SQL run, `_verify` all `t`. |
| 2026-11-15 | Explorer step badges («مباشر / خطوة ١ / خطوة ٢»), commit `178ae36a`. Pushed; not deployed yet. |
| 2026-11-15 | The retrieval lab now says «الجراف قيد إعادة البناء» while the graph is not ready. Before, a rebuild looked like «لا نتائج», as if the question were wrong. Pushed with this document; not deployed yet. |
| 2026-11-15 | Decree text cleaned (`src/lib/text/markdownToPlain.ts`). The preamble's layout (identity table, `<details>` blocks, headings, emoji, links) becomes plain `key: value` text, and the «موجز» is no longer stored twice. On the local library: 4,393 of 4,398 decree nodes had markup and now 0 do, the decree text to embed shrank 8.6% (14.5M → 13.3M characters), and amendment links are unchanged at 469. The explorer inspector shows every node's text through the same cleaner (display only). Needs `mark_dirty_now` after the deploy, so the decrees are rebuilt and their few existing vectors redone. |
| 2026-11-15 | Embeddings moved to Google Cloud Vertex AI (Cloud billing), several calls at once (`b4720339`). Deployed; the vectors filled to about 123k. |
| 2026-11-16 | **Links + routing batch** (`20261116_10`, commit `35970cd6`). Defined terms, «مع مراعاة» conditions, penalties, the library's own article → regulation links, vector links, and routing by section and judicial track (section 4.6). Deployed 2026-11-15, SQL run. |
| 2026-11-17 | **Seeds + gold set** (`20261117_10`, section 4.8). An article the question names leads the graph answer and its links follow it; the lab does the same lookup as the AI; a 39-question gold set and `npm run graph:gold` measure recall and the switch-on timing. Not merged or deployed yet. |

---

## 4. The depth batch (A + B + C) in detail

### 4.1 Before: what the graph missed

Links came from a few regular expressions:

- **Spelled-out numbers were missed.** «نصت المادة الخامسة عشرة» only linked after a lead-in like «وفقاً». Saudi laws mostly spell numbers out.
- **Lists and ranges were missed.** «المواد (5، 6، 7)» and «المواد من 3 إلى 7» produced at most one link.
- **Duals were missed.** «المادتين الثالثة والرابعة».
- **There was no document structure.** No law or chapter nodes, and no link from an article to its neighbours.
- **Principles and decrees needed the exact words «من نظام».** «من اللائحة التنفيذية…» gave no link.
- **Retrieval walked one step only.**

### 4.2 A — reading citations properly

`findArticleMentions` and `readArticleNumbers` in `graphBuilder.ts` replaced the old patterns with one scanner:

- **Nouns:** المادة / مادة / المادتين / المادتان / المواد, with prefixes (و، ف، ب، ل، ك، ال، بال، لل) and diacritics allowed between letters.
- **Numbers:**
  - Digits, including `12/1`, Arabic-Indic digits, and the number on the next line.
  - Words: الأولى … العاشرة, teens (الحادية عشرة), tens and hundreds (الخامسة والعشرون، المائة).
  - Lists joined by و، أو، ، and ranges with «من … إلى/حتى», expanded to at most 30 articles. At most 40 numbers per plural mention, 2 per dual, 1 per singular.
- **Stops:** the reader stops at a sentence break (`. : ; ؛`), at «من» once a list has started, and 140 characters after the noun. This keeps it from reading numbers out of unrelated text.
- **Which document a mention points to** (`targetLawFor`):

  | Text after the mention | Resolved to |
  |---|---|
  | «من هذا النظام / من هذه اللائحة / من النظام هذا» | the current document |
  | bare «من النظام» inside a regulation | the regulation's **parent law**; no link if it has none |
  | bare «من النظام» inside a law | the current law |
  | bare «من اللائحة / من القواعد / من الاتفاقية …» | the current document if its title has that word; otherwise no link |
  | «من نظام العمل», «من اللائحة التنفيذية لنظام …» | looked up by title fragment; a regulation reference never resolves to a law whose title lacks «لائح» |
  | nothing | the current document |

- **Exemptions:** `EXEMPTS_FROM` comes from three lead-ins in the 60 characters before the noun: «استثناءً من (حكم/أحكام/نص)», «مع عدم الإخلال / دون الإخلال ب…» and «ما لم ينص (عليه) في». Every other mention becomes `CITES_ARTICLE`. «فيما عدا» and «خلافاً ل» are not read yet; they are a cheap addition to A.
- **Principles and decrees** use the same reader (`namedArticleEdges`):
  - `INTERPRETS_ARTICLE`, weight 1.15.
  - `AMENDS_ARTICLE`, weight 1.2, only after «تعديل / إضافة / حذف / إلغاء».
- **Evidence:** every link stores the sentence it came from (`evidence`, on the same line, at most 180 characters). The explorer shows it.

**Measured** by running the new builder over the full local copy of the library, not on prod: article-to-article links went from **5,163 to 16,484 (×3.2)**. We spot-checked samples of new links and they were correct. Most of the links the old code had and the new code drops were wrong links. The rest were fixed during testing: a number on the next line, and bare «من التنظيم» / «من اللائحة».

### 4.3 B — law structure

`buildLawStructure` adds:

- **Nodes:**
  - One `law:<slug>` node per law or regulation. Its text holds the title, type, status, article count and chapter list.
  - One `chapter:<id>` node per titled chapter that holds articles.
  - Both are `is_embeddable = false`: no embedding cost, and they never count as missing vectors.
- **Edges**, all weight 1.0:
  - `PART_OF`: article → chapter → law, or article → law when the article has no titled chapter.
  - `NEXT_ARTICLE`: each article → the next built article, in reading order.

These come to about 190k links on the full library, about 4k+ law and chapter nodes, and no extra cost.

### 4.4 C — two-step retrieval

`graph_rag_retrieve` keeps the same nine-argument signature, so the grants and callers are unchanged. It now works in three legs:

1. **Hop 0, direct hits:**
   - Keyword search (FTS, up to 6 query strings, top 40 per type per query).
   - Vector search (global top 65, plus top 15 within the law the user named).
   - The concept bridge: the 5 best-matching concepts and the articles they tag.
   - These are fused by reciprocal rank. Only article, principle, decree and fiqh nodes can be hits.
2. **Hop 1:** from the 8 strongest hits, along legal links. Each link passes on part of the seed's score:

   | Link | Transfer |
   |---|---|
   | `EXEMPTS_FROM` | 0.58 |
   | `AMENDS_ARTICLE` | 0.55 |
   | `INTERPRETS_ARTICLE` | 0.52 |
   | `ESTABLISHES_RULE` | 0.48 |
   | `PARENT_LAW` | 0.36 |
   | `CITES_ARTICLE` | 0.32 |
   | `NEXT_ARTICLE` (top 3 seeds only) | 0.30 |

   Citation and parent-law hops must be close in meaning to the question (cosine ≥ 0.38) when the node has a vector. This stops a much-cited article from flooding the results.
3. **Hop 2:** from the 6 strongest hop-1 results that came through a legal link, not a neighbouring article. Transfer is **half** the table above.
   - Exception, amendment and interpretation links always pass.
   - Citation and parent-law links need meaning ≥ 0.38, and are **not taken at all without vectors**.
   - A node already found at hop 0 or 1 is never repeated.

Rules for every leg:

- `PART_OF` is never walked. A law node has thousands of links.
- Law, chapter and concept nodes are never returned.
- Every result carries `hop` (0, 1 or 2), `via_edge_type` and `via_from_title`.

**The chain this was built for:** article → the article that exempts it → the principle that interprets that exception.

### 4.5 Explorer changes that came with it

- New node types «نظام / لائحة» and «باب / فصل», and new dashed links «ضمن» and «المادة التالية».
- "Most-linked nodes" ignores structural links.
- In a neighbourhood, legal links sort before structural ones, and hop 2 never fans out through a law, chapter or concept node.
- The retrieval lab puts second-step results on the outer ring, linked to the result that led to them. It shows a step badge (deploy pending).

### 4.6 The links + routing batch (`20261116_10`)

New links:

| Link | From → to | Source |
|---|---|---|
| `DEFINES_TERM` | definitions article → `term` node | the law's definitions article («يقصد بـ… »). A term defined in two documents bridges them. |
| `SUBJECT_TO` | article → the article it is subject to | «مع مراعاة», «مع عدم الإخلال», «بما لا يتعارض مع» |
| `PENALIZES` | penalty article → the article or law it punishes | the penalty wording |
| `IMPLEMENTED_BY` | system article → regulation article | the library's own `article_regulations.ref` + `reg_num`. Only a `reg_num` that is all digits (about 13.3k of 15.7k rows; «9/2», «9.1», «جدول الغرامات رقم 9» are not one article), only one in-force document with that title, never the same law. |
| `SIMILAR_TO` | article ↔ article of another law; principle ↔ principle of another collection | vectors (guide: "Links from the vectors") |
| `REPLACED_BY` | repealed article → the closest active article | vectors, the replacing law first |

Routing:

- Each law node stores its section (`section_code`, `00`–`29`).
- Each principle stores its track: `admin` (Board of Grievances), `ordinary` or `semi` (committees). Board volumes of a commercial or criminal circuit also store their subject (`04` / `01`). Committees store their governing laws: the laws of their committee family (21 families in `src/lib/ai/graphRouting.ts`), plus the laws their own principles cite most (at least 2 citations and 5% of the collection's citations, at most 30 laws; 60 in all).
- `graph_rag_retrieve_scoped(…, p_scope)` does the work. The nine-argument `graph_rag_retrieve` calls it with `auto`, so there is still one function per name for PostgREST.
- `library_graph.route_factor` scores each result. The rules are in the guide ("Routing by section and judicial track") and in the migration header.

On the local copy of the library, 209 collections:

- 127 are Board of Grievances: 79 administrative, 38 commercial circuits, 10 criminal circuits.
- 50 are ordinary.
- 32 are committees. All 32 match a committee family, using 13 of the 21 families, and every family resolves to at least one law.

Tests:

- Database: `library_graph_links.test.sql` and `library_graph_routing.test.sql` (R0–R6: the vote, confidence, each track, the scopes, explicit links crossing).
- Unit: `graphRouting.test.ts`, plus the routing pass in `graphWatchdogCore.test.ts`.

### 4.8 Seeds and the gold set (`20261117_10`)

**Seeds.** The AI already read the articles a question names («المادة ٧٧ من نظام العمل»; «المادة ٧٧» on a law page; the open article) and put them first. The graph never knew about them: it searched the words, so the named article's exceptions and regulations came only if the words happened to find the article itself. Now:

- `retrieveLibrary` looks the named articles up **before** the graph call and sends them as `p_seed_keys` (`article:<id>`) to `graph_rag_retrieve_scoped`. Before `20261117_10` that call answers `PGRST202`, and the code asks the nine-argument `graph_rag_retrieve` instead, inside the same 2.5 s.
- In SQL, a seed (at most four) enters just above the strongest search result, first named first. It votes for the section, is never routed away, and its law counts as one of the question's laws. It seeds hop 1 and hop 2 like any strong result. Every item carries `seed`, and `routing` carries `seeds`.
- With no seeds the call is the nine-argument one, unchanged.
- The retrieval lab uses the same lookup (`questionRefLookups`): the named law becomes the pinned law, the named articles become seeds. Badge «مذكورة في السؤال».

**Gold set.** `docs/graph-rag/gold-set.json` has 39 client-style questions in labour, civil, personal status, evidence, procedure, criminal, commercial, data protection and the legal profession. Three of them name an article. Each expected article was checked against its text in the owner's corpus. `must_contain` keeps another article that shares the number from counting: one export holds two rows numbered 80 in the labour law. **DRAFT** until the owner approves it (question ٥١٤).

**The measure.** `npm run graph:gold` (`scripts/graph-gold.mjs`, scoring in `src/lib/ai/graphGoldCore.ts`) is read-only. Per question it gets n8n's search phrases, embeds the question, runs `retrieveLibrary` with the graph and without it, then repeats the exact graph call in auto / section / all. It reports Recall@8 and Hit@8 for graph vs keyword (also over the questions the graph itself answered), the cold AI-path call and the warm replays, and `GO` / `NO-GO`.

**First reading (2026-11-15, two questions, from the PC over the internet, `--no-n8n`; not the gate).**

- Cold, each question's first graph call was cut at 2.5 s, and the keyword relevance functions themselves hit statement timeouts (`57014`).
- Run again at once, the same calls took 0.4–0.8 s, and the warm scope replays 0.3–0.6 s.
- Warm, «شخص صدم سيارتي وتضررت، هل يلزمه يعوضني؟» found the civil transactions article 120 first through the graph. The keyword search did not find it in its top 8.
- So the switch-on question is the cold first call, which only the server run can answer.

Tests: `library_graph_seeds.test.sql` (S0–S7), the seed and fallback cases in `retrieval.test.ts`, `graphGoldCore.test.ts`, and the 20261117_10 contract in `graphSchemaContract.test.ts`. `_verify.sql` has the block `verify:library_graph_seeds`. The three earlier graph rows now accept the eleven-argument signature.

### 4.7 Tests and checks (depth batch)

- **Unit:** `graphBuilder.test.ts`, `graphWatchdogCore.test.ts` (a mock that enforces foreign-key order), `graphExplorerCore.test.ts`, and `graphSchemaContract.test.ts`. The contract test checks that the migration's type lists equal the explorer's, that the signature and readiness check are unchanged, and that no forbidden pgvector calls appear.
- **Database (Docker, `PG_IMAGE=pgvector/pgvector:pg16`):** `library_graph_depth.test.sql` D1–D3 (types accepted and rejected; two-step retrieve rules; explorer). The existing `library_graph_rag.test.sql` and `library_graph_explorer.test.sql` also pass on top of the new migration.
- **Prod:** `_verify.sql` block `verify:library_graph_depth`.

---

## 5. Where it stands (2026-11-15)

| Item | State |
|---|---|
| Graph build with depth | Deployed. The first rebuild pass was running at the time of writing. |
| Link counts after the rebuild | **To fill in** (`select edge_type, count(*) …`, section 8). Expected about 200k, mostly `PART_OF` / `NEXT_ARTICLE`, and roughly 3× the old `CITES_ARTICLE`. |
| Retrieve timing on prod | **To measure**. Must stay well under 2.5 s, or every call falls back silently. |
| Vectors | About 123k (Vertex AI, 2026-11-15). |
| Switch `NZAMY_GRAPH_RAG` | **Off.** Keep it off until vectors are nearly complete: hop 2 and the citation guard need them. |
| Step badges in the explorer | Pushed (`178ae36a`), not deployed. |

---

## 6. Gaps that remain

From the original review, with what A + B + C closed:

| Gap | State |
|---|---|
| Spelled-out numbers, lists, ranges, duals | ✅ closed (A) |
| «من اللائحة / من النظام / من هذه اللائحة» | ✅ closed (A) |
| No law/chapter structure, no neighbouring articles | ✅ closed (B) |
| One-step retrieval | ✅ closed (C), as a 2-step walk with shrinking scores |
| **Fiqh blocks have no links** | ❌ open. They are searchable as nodes but connected to nothing. Fix: D. |
| **Concepts are a fixed list of 32** | ❌ open. Fix: D. |
| `ESTABLISHES_RULE` / `DECONSTRUCTS_CONCEPT` are never created | ❌ open. Retrieval already weighs `ESTABLISHES_RULE` (0.48), but nothing writes it. Fix: D. |
| `PARENT_LAW` / `SUPERSEDES_LAW` only where the library fields are filled | ⚠ data, not code. The owner's export decides it. |
| Citations to documents that are not in the library | ⚠ by design, no link. Better nothing than a wrong target. |
| Chapters without a title get no chapter node | ⚠ by design. Those articles link straight to their law. |
| Hop 2 over citations is inactive without vectors | ✅ closed: the vectors are filled (Vertex AI) |
| A labour question pulled administrative principles, and the reverse | ✅ closed in code (`20261116_10` routing), waits for deploy |
| Regulation articles were not linked to the article they implement | ✅ closed in code (`IMPLEMENTED_BY`), waits for deploy |
| The owner's own metadata links (`superseded_by`, `repealed_by`, `related_laws`, `affected_laws`, cross references) are not read | ❌ open. Next candidate after this batch. |
| No quality measurement of answers | ✅ closed in code: the gold set and `npm run graph:gold` (4.8). The set waits for the owner's approval. |
| A named article did not seed the graph | ✅ closed in code (`20261117_10` seeds), waits for deploy |

Known small issues:

- The keyword leg takes `limit 1500` candidates per query string **without `order by`**. Law and chapter nodes now compete for those slots too. Their own type ranks keep them out of the results, but a very common word could push some articles out of the 1,500. The fix is an ordered candidate pick, or filtering `node_type` inside the lateral.
- The website PM2 app `nzamy` has `max_memory_restart` 512M and has restarted several times. Raise it.
- The old Gemini key was pasted in a chat. Rotate it.

---

## 7. What comes next

### 7.1 Before turning the switch on (needed)

1. **Measure the rebuild:** link counts by type, and connected versus isolated nodes per type (section 8).
2. **Measure timing and quality:** `npm run graph:gold` on the server, after a quiet spell (4.8). Every p95 must be under 2.5 s, with no cold AI-path timeout. If only the cold call fails, the next step is warming the database cache (for example `pg_prewarm` on the graph's tables and vector index), not changing the graph.
3. **Paid embedding key:**
   - About 152.6M characters are left to embed, which is about **$8–13 one time** for `gemini-embedding-2-768`.
   - Steps: swap `GEMINI_EMBEDDING_API_KEY`, delete `GRAPH_RAG_EMBED_BATCH_SIZE=20`, then run `pm2 restart nzamy-graph-watchdog --update-env`.
   - Don't rotate free keys to get around the quota: Google's terms forbid it, and at 1,000 per day it would take about 120 days.
4. **The gold set:** built (4.8), 39 questions. The owner approves or corrects it (question ٥١٤). It is the yardstick for every change below.
5. **Turn it on:** set `NZAMY_GRAPH_RAG=on`, then run `pm2 restart nzamy --update-env`. Watch the fallback rate for the first days.

### 7.2 D — AI-extracted links and concepts (recommended next build)

A cheap Flash-class model reads each article **once** and returns structured JSON:

- **Concepts and definitions:** what the article defines («يقصد بالعامل…») and which legal concepts it uses.
- **Obligations, rights and penalties:** who must do what, and what the penalty is.
- **Actors:** employer, worker, the ministry, the court…

Design:

- Results are cached by a hash of the article text, so a rebuild never pays twice. Only new or changed articles cost anything.
- New edge types need a small migration: for example `IMPOSES_OBLIGATION`, plus finally writing `ESTABLISHES_RULE`. (Definitions and penalties are now rule-based since `20261116_10`; D would widen them.)
- Concept nodes become thousands instead of 32. Fiqh blocks connect to the same concepts, which closes the fiqh gap.
- Precision control:
  - Every AI link keeps its `origin` (for example `ai_extract_v1`) and the quoted sentence as evidence.
  - Spot-check about 200 links before using them in retrieval.
  - AI links can get a lower weight than rule-based ones.
- **Cost estimate:** about $10–30 one time for the whole library on a Flash-class model. The exact figure depends on the model and the prompt size.

### 7.3 E — summaries per law and chapter

An AI-written summary for every law and chapter node, embedded so search can match it. This answers broad questions like «ما التزامات صاحب العمل؟» from one summary instead of 40 scattered articles. It is the "community summary" idea of Microsoft GraphRAG, but our communities are the real law and chapter structure, so no clustering is needed.

- Law and chapter nodes become embeddable, with the summary as their text. Retrieval would then return them for broad questions only, which needs one rule change in `graph_rag_retrieve`.
- **Cost estimate:** a few dollars one time. Re-summarize only a law that changes.

### 7.4 Other options, smaller or later

| Option | What it gives | Effort |
|---|---|---|
| **Personalized PageRank** instead of fixed hops | Spreads weight from the best hits along every legal link and ranks by where it settles. Finds chains longer than 2 without hand-tuned limits. | One SQL function, or a precomputed score; needs timing care |
| ~~Direct article lookup~~ | Done in `20261117_10` as seeds (4.8) | — |
| **Reranker** after retrieval | A cross-encoder re-sorts the top 20. `searchLegalGraphWith` already has an optional rerank hook. | Small code; per-question cost |
| **Repealed-chain awareness** | When a hit is repealed, follow `SUPERSEDES_LAW` to the article in force | Small, once the library fields are filled |
| **Explorer: whole-chapter view** | Open a chapter node and read its articles in order along `NEXT_ARTICLE` | Small UI |

**Suggested order:**

1. 7.1, all of it.
2. ~~Direct article lookup~~: done as seeds (4.8).
2a. The owner's own metadata links (`superseded_by`, `repealed_by`, `related_laws`, `affected_laws`, cross references): its own batch, timed with the owner's next library load.
3. D.
4. E.
5. PageRank, only if the gold set shows that two steps are not enough.

---

## 8. Checking it yourself (server, read-only, results are screen output)

All of these run in `/www/wwwroot/nzamy/latest-nzamy-full`.

Everything at once, nodes and links by type plus vectors:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c "
select 'node: ' || node_type as what, count(*) from library_graph.nodes group by 1
union all select 'link: ' || edge_type, count(*) from library_graph.edges group by 1
union all select 'total nodes', count(*) from library_graph.nodes
union all select 'total links', count(*) from library_graph.edges
union all select 'vectors', count(*) from library_graph.node_embeddings
union all select 'missing vectors', count(*) from library_graph.nodes n
 where n.is_embeddable and not exists (select 1 from library_graph.node_embeddings e where e.node_key = n.node_key)
order by 1;"
```

Connected versus isolated nodes per type:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c "select n.node_type, count(*) as nodes, count(*) filter (where exists (select 1 from library_graph.edges e where e.source_key = n.node_key) or exists (select 1 from library_graph.edges e where e.target_key = n.node_key)) as connected from library_graph.nodes n group by 1 order by 2 desc;"
```

Timing of one search. Run it only after a pass has finished; otherwise the graph is "not ready" and the call returns at once:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres <<'SQL'
\timing on
select length(public.graph_rag_retrieve(array['فصل & العامل'], null, null, null, 8, 4, 0, 0, true)::text);
SQL
```

The same search with routing (after `20261116_10`). The last argument is `auto`, `section` or `all`. Look at the `routing` part of the answer:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres <<'SQL'
\timing on
select public.graph_rag_retrieve_scoped(array['فصل & العامل'], null, null, null, 8, 4, 0, 0, true, 'section')->'routing';
SQL
```

Progress of the watchdog:

```bash
npm run graph:status
```

```bash
pm2 logs nzamy-graph-watchdog --lines 0
```
