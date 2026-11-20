# Legal Graph Repository — principles

What the legal graph is, what it holds, how it is built, and where it stops. It is written from the code, not from plans. How to switch the graph on, run its SQL files, fill it and test it is in [`GRAPH_RAG_GUIDE.md`](./GRAPH_RAG_GUIDE.md); this file does not repeat those steps.

## 1. Principles

1. **The library is the only source.** The graph is rebuilt from the `library.*` tables (laws, articles, executive regulations, judicial principles, decrees, fiqh). The builder only reads the library; it never writes to it. Anything wrong in the graph is fixed in the library and rebuilt, never patched in the graph by hand.
2. **Links are read from the text or from the library's own references, never invented.** `src/lib/ai/graphBuilder.ts` is deterministic: it finds «استثناءً من المادة…», «مع مراعاة…», «وفقاً للمادة…», article ranges, defined terms and so on with fixed rules. No language model writes a link. The only links derived from meaning (`SIMILAR_TO`, `REPLACED_BY`) are computed in the database from the stored vectors, with fixed thresholds, and are labelled as such.
3. **Strict resolution or nothing.** A mention, or one of the owner's links, that does not name exactly one law or article is counted and left out, not guessed (`graphOwnerLinks.ts`, `findArticleMentions`).
4. **Every link says where it came from.** `origin` is `auto_watchdog` (built by the rebuild) or `owner_curated` (the owner's own link files). `evidence` keeps the phrase that produced the link when there is one.
5. **Server-only.** The `library_graph` schema has no grants for `anon` or `authenticated`. Only the service role reads it: AI runs, the n8n graph-retrieve endpoint, and the staff-only explorer (`/dashboard/admin/graph-explorer`). No user sees graph rows directly.
6. **The graph never decides alone.** An AI run asks the graph first only when the switch (`NZAMY_GRAPH_RAG=on`) is on and the graph is ready, and gives it at most 2.5 s (`GRAPH_BUDGET_MS`, `src/lib/ai/retrieval.ts`). On an error, a timeout, a graph that is not ready, or no hits, the run uses the keyword search instead. Either way the answer must cite the library texts it was sent.
7. **Nothing personal.** The graph holds only library texts. The call log (`library_graph.call_log`) keeps timings and outcomes, never the question, the user or a vector, and for 30 days only.

## 2. Tables (schema `library_graph`)

| Table | What one row is |
|---|---|
| `nodes` | One library unit: its `node_key`, `node_type`, title, display text, a contextual header (law › chapter › article), status, a SHA-256 of its content, and a generated full-text vector (tashkeel folded). |
| `node_embeddings` | The 768-number vector of a node for one embedding model (`gemini-embedding-2-768`), with an HNSW cosine index over the active corpus. Outline nodes (law, chapter) are never embedded. |
| `embedding_models`, `embedding_vault` | The registered embedding model(s), and the key store the watchdog reads (server-only). |
| `edges` | One typed, directed link `source_key → target_key` with `edge_type`, `origin`, `weight` (0 < w ≤ 5), `evidence` and `metadata`. The primary key is (source, target, type), so a link exists at most once per type. |
| `sync_state`, `sync_runs` | Whether the library changed since the last rebuild, and a log of every rebuild pass. "Ready" needs nodes, at least one finished pass, and no library change since it. |
| `similarity_state`, `replacement_pairs` | Progress of the vector-link pass, and the repealed article → replacing article pairs it found. |
| `call_log` | One row per graph call (AI run, n8n endpoint, explorer lab): path, time, miss reason, seed count, routing section. |

The functions that read and write these tables are `graph_rag_*` and `graph_rag_explore_*`, created by the migrations `20261110_10` to `20261121_10` (`supabase/migrations/*library_graph*.sql`). Each has a database test under `supabase/tests/rls/library_graph_*.test.sql`.

## 3. Node types

| `node_type` | What it is | Embedded |
|---|---|---|
| `article` | An article of a law or of an executive regulation | yes |
| `principle` | A judicial principle (courts, Board of Grievances, committees) | yes |
| `decree` | A royal decree, order or circular | yes |
| `feqh` | A fiqh text | only when the watchdog's fiqh-vectors option is on |
| `concept` | A curated Saudi legal concept (e.g. «الفصل التعسفي») that gathers the articles governing it | yes |
| `term` | A term defined in a law's definitions article («يُقصد بـ…») | yes |
| `law` | A law or regulation as a whole (since `20261115_10`) | no |
| `chapter` | A titled chapter or part of a law (since `20261115_10`) | no |

## 4. Edge types

The 17 types below are the `edge_type` check of `20261116_10`, in the order the explorer shows them (`EXPLORER_EDGE_TYPES`, `src/lib/ai/graphExplorerCore.ts`).

| `edge_type` | Meaning (source → target) | Built from |
|---|---|---|
| `EXEMPTS_FROM` | an exception to the target article | the text («استثناءً من…»، «على الرغم من…»، «فيما عدا…») |
| `SUBJECT_TO` | applies subject to the target («مع مراعاة…»، «مع عدم الإخلال بـ…») | the text |
| `AMENDS_ARTICLE` | a decree or law that amended the target article | the text, and the owner's `affects` links with article numbers |
| `INTERPRETS_ARTICLE` | a judicial principle that applied or interpreted the article | the principle's references |
| `IMPLEMENTED_BY` | a law article → the regulation article that implements it | the library's own article → regulation reference |
| `PENALIZES` | a penalty article → the article (or the whole law) whose breach it punishes | the text |
| `SUPERSEDES_LAW` | a new law that repealed and replaced an older one | the repeal clauses and the owner's `supersedes` / `superseded_by` links |
| `REPLACED_BY` | a repealed article → the closest active article, first in the law that replaced its law | vectors (database), dashed in the explorer |
| `PARENT_LAW` | a regulation or sub-law → the law it was issued under | library metadata |
| `ESTABLISHES_RULE` | a text that lays down a general rule governing another | the text |
| `CITES_ARTICLE` | a general reference («وفقاً للمادة…»، «المنصوص عليها في…») | the text |
| `DECONSTRUCTS_CONCEPT` | a text that sets out the elements of a concept | the curated concept list |
| `HAS_CONCEPT` | a concept → an article that governs it | the curated concept list |
| `DEFINES_TERM` | a definitions article → the defined term; the same term in several laws joins them | the text |
| `SIMILAR_TO` | two articles of different laws, or two principles of different collections, very close in meaning | vectors (database) |
| `NEXT_ARTICLE` | reading order inside one document | structure |
| `PART_OF` | article → chapter → law | structure |

## 5. How it is built

1. **The watchdog** (`scripts/graph-watchdog.mjs`, PM2 app `nzamy-graph-watchdog`; logic in `src/lib/ai/graphWatchdogCore.ts`) checks every 30 s. When the library has changed and then stayed quiet for 3 minutes, it rebuilds.
2. **Rebuild**: `graphBuilder.ts` turns every library unit into a node with a contextual header and a content hash, adds the outline (law, chapter, `PART_OF`, `NEXT_ARTICLE`), reads the citations, exceptions, conditions, penalties and definitions, joins the curated concepts, and adds the owner's own links (`graphOwnerLinks.ts`). Nodes and edges are upserted; a node whose hash did not change keeps its vector.
3. **Embedding**: nodes without a vector are embedded in pages. The key is held server-side.
4. **Vector links**: once at most 0.5% of articles and principles still lack a vector, the database builds `SIMILAR_TO` and `REPLACED_BY`, 150 nodes per call, on quiet polls (thresholds: article 0.80, principle 0.85, repealed → successor law 0.80, → any law 0.90; all can be set in the server environment).
5. **Routing data**: each law node carries its section code and each principle its judicial track (`graphRouting.ts`), used to lower or drop results from another section.

## 6. How a search walks it

- **Seeds**: an article named outright in the question, or open in the reader, leads (`20261117_10`).
- **Hop 0**: articles found by meaning and by keywords.
- **Hop 1**: exceptions, conditions («مع مراعاة»), amendments, interpretations, penalties, rules, citations, the parent law, the implementing regulation, the active replacement of a repealed article, close-meaning links, and the next article of the three strongest results.
- **Hop 2** (half weight), from the six strongest hop-1 results: exceptions, amendments and interpretations always pass; a citation or parent-law link passes only when its target is close in meaning to the question.
- Never walked: `PART_OF`. Never returned: law, chapter, concept and term nodes. Each result says which hop found it and through which link.
- **Routing**: results from another section are lowered (×0.88, or ×0.7 when the section is confident), except procedure; an explicit legal link always crosses sections.

## 7. Limits (what the graph does not do today)

- **No precedence rule between laws in the graph.** Nothing in the graph or the search applies «الخاص يقدَّم على العام» or «اللاحق ينسخ السابق» between two laws that both govern a question (for example traffic and insurance). Both are returned. Merging or ranking such laws in the data is not built (it waits on the owner's graph-merge decision).
- **The precedence rule is in the prompts (batch l11, L6).** The assistant, the library assistant, the legal drafter and the legal opinion are told: when a special text and a general one both govern the question, the special one goes first («الخاص يقدَّم على العام»); between two texts of the same rank the later goes first («اللاحق ينسخ السابق»); both are named with their sources and the reason is given in one sentence. The rule text lives once in `n8n/ai/workflows.mjs` (`LEGAL_TEXT_RULES`).
- **Coverage follows the wording.** A reference written in a form the rules do not know («النظام المشار إليه»، a law named only by its subject) produces no link. Unresolved mentions are counted, not linked.
- **Meaning-based links are estimates.** `SIMILAR_TO` and `REPLACED_BY` come from vector closeness. The principle threshold is calibrated; the article threshold has not been proven across the whole library (see the guide). They are always labelled and never treated as legal links.
- **One-way vector links.** A `SIMILAR_TO` link is stored from the node that was processed; when a target changes, links others made to it stay until those nodes are processed again (the guide gives the full rebuild).
- **Readiness gaps.** While the library is being loaded, the graph turns itself off until the next finished pass; AI runs then use the keyword search.
- **Budget.** The graph gets 2.5 s per run. A slow database answer means a keyword-search answer for that run (logged as `timeout`).
- **Owner links without article numbers** (`affects` a law with no articles, `related`) stay in the library and make no graph link.

## 8. Where to look in the code

| Part | File |
|---|---|
| Node and link extraction | `src/lib/ai/graphBuilder.ts` |
| The owner's own links | `src/lib/ai/graphOwnerLinks.ts` |
| Section and track routing | `src/lib/ai/graphRouting.ts` |
| Graph-first retrieval and the fallback | `src/lib/ai/retrieval.ts`, `src/lib/ai/graphService.ts` |
| The switch | `src/lib/ai/graphRagSwitch.ts` |
| Rebuild loop | `scripts/graph-watchdog.mjs`, `src/lib/ai/graphWatchdogCore.ts` |
| Explorer labels and layout | `src/lib/ai/graphExplorerCore.ts` |
| Call log | `src/lib/ai/graphCallLog.ts` |
| Gold-set check | `scripts/graph-gold.mjs`, `src/lib/ai/graphGoldCore.ts`, `docs/graph-rag/gold-set.json` |
| Database | `supabase/migrations/2026111*_10_library_graph*.sql`, `2026112*_10_library_graph*.sql`, tests `supabase/tests/rls/library_graph_*.test.sql` |
