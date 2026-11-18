# Comparing our graph with the owner's graph file (question ٣٩)

The owner sent `LEGAL_GRAPH_EDGES_CLEAN.json` (15,709 edges, 3,306 nodes) and his `compare_graphs.py`. He asked
us to compare our graph with his file and send him the differences. **Nothing is imported, merged or deleted.** His
edges go nowhere near `library_graph`. The only thing that touches the server is one read-only SQL file.

| Piece | File |
|---|---|
| Server export (READ ONLY, ends with ROLLBACK) | `supabase/one-time/graph_owner_compare_export.sql` |
| PC mapper: `export`, `annotate`, `snapshot` | `scripts/graph-owner-compare.mjs` |
| Pure helpers + unit tests | `src/lib/ai/graphOwnerCompareCore.ts`, `src/lib/ai/graphOwnerCompareCore.test.ts` |

`<package>` below is the owner's delivery folder. His files sit in `<package>/05_الجراف`. Never edit them; copy them.
All PC commands are Git Bash, run from the repo root unless they `cd`.

## 1. Server: export our graph (read-only)

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -q -At -v ON_ERROR_STOP=1 < supabase/one-time/graph_owner_compare_export.sql > /root/graph-owner-export.jsonl
head -c 600 /root/graph-owner-export.jsonl; echo; wc -l /root/graph-owner-export.jsonl
```

- The first line must start with `{"kind" : "snapshot"`. Every line is one JSON object with a `kind`: `snapshot`
  (edge and node counts, `sync_state.last_synced_at`, library row counts), `doc` (our document identities) or `edge`
  (the five exported edge types with both ends' identities).
- Copy `/root/graph-owner-export.jsonl` to the PC as `D:\nzwt\graph-compare\data\graph-owner-export.jsonl`.
  Keep it out of the repo.

## 2. PC: copies of his files

```bash
mkdir -p D:/nzwt/graph-compare/{tool,data,out,out-h2}
cp "<package>/05_الجراف/compare_graphs.py" D:/nzwt/graph-compare/tool/
cp "<package>/05_الجراف/LEGAL_GRAPH_EDGES_CLEAN.json" D:/nzwt/graph-compare/data/
sha256sum D:/nzwt/graph-compare/data/LEGAL_GRAPH_EDGES_CLEAN.json D:/nzwt/graph-compare/tool/compare_graphs.py
```

The hashes must be:

- `9fd6ddf22cc2025e95c4806f9c758b2a8a15a9a606c736204e4abae46f595961` for the JSON (his report §9);
- `fe4bbe0b5e28dc3833857699fbe4200e3eafac7110d46b5476034028052b2078` for the script.

If either differs, stop and ask.

H2 (his script against his own file) runs in its own folder, because the script overwrites its TSVs in the current folder:

```bash
cd D:/nzwt/graph-compare/out-h2 && python -I ../tool/compare_graphs.py ../data/LEGAL_GRAPH_EDGES_CLEAN.json --ours ../data/LEGAL_GRAPH_EDGES_CLEAN.json
```

Expected output: `ours 14383 theirs 14383 common(type,from,to,article) 14383` and `pairs … only ours 0 only theirs 0`.

## 3. PC: our graph in his format

```bash
node --import tsx scripts/graph-owner-compare.mjs export \
  --db D:/nzwt/graph-compare/data/graph-owner-export.jsonl \
  --owner D:/nzwt/graph-compare/data/LEGAL_GRAPH_EDGES_CLEAN.json \
  --out D:/nzwt/graph-compare/data
```

This step writes:

- `our_graph.json`: UTF-8 with no BOM, `{"meta":{…},"edges":[…]}`;
- `coverage.tsv`;
- `unmapped_owner_nodes.tsv`: each of his nodes with no document of ours, and why.

It also prints the id coverage per family. Put that table in the report **before** any diff.

**The bridge check.** His `regulation_of` edges come from the same `parent_law_id` as our `PARENT_LAW`. When fewer
than 50% of them match ours, the law-id bridge is broken, not the graph. In that case the step stops (exit 3) and does
not write `our_graph.json`. Read `unmapped_owner_nodes.tsv` before anything else. Use `--min-parent-match=<0..1>` to
change the threshold, and `0` only to diagnose.

How his ids are bridged:

| His folder | Bridge, in order |
|---|---|
| أنظمة ولوائح | 1. `laws.instrument_id` = his id. 2. The slug parse-laws.ts gives his file name (NFC, `slugifyArabic` when it holds Arabic or a space) = `laws.slug` |
| أوامر وتعاميم | `toUuid(file name)` = `decrees_circulars.id`. The same two law rules also apply, for instruments we hold as laws |
| مبادئ وسوابق قضائية | `principles.metadata->>'id'`, then `judicial_collections.metadata->>'id'`, then `collection_id`, then `principles.id` |

A file name that two of his files share is left out of the bridge. An end of ours that does not map is written
`OURS:law:<slug>`, `OURS:decree:<uuid>`, `OURS:principle:<id>` or `OURS:collection:<id>`. It is never dropped.

How our types are exported (the other twelve types are only counted, in `meta.excluded_counts`):

| Ours | His type | Direction |
|---|---|---|
| `INTERPRETS_ARTICLE` | `cites_article` | principle's document → law, with `to.article` |
| `AMENDS_ARTICLE` | `amended_by` | **reversed**: amended law, with `from.article` → the amending decree or law |
| `SUPERSEDES_LAW` | `superseded_by` | **reversed**: old → new. Ours cannot tell a repeal from a supersession |
| `PARENT_LAW` | `regulation_of` + the mirror `regulated_by` | regulation → system. The enabling article is dropped |
| `IMPLEMENTED_BY` | `OURS:IMPLEMENTED_BY` (our label kept) | system → regulation |

There is never a top-level `article`: his script would read it as the target article. Article numbers are written in
Latin digits.

## 4. PC: his script, unmodified, on the copies

```bash
cd D:/nzwt/graph-compare/out && python -I ../tool/compare_graphs.py ../data/our_graph.json --ours ../data/LEGAL_GRAPH_EDGES_CLEAN.json | tee summary.txt
```

- Use the default column names only. His `--from/--to/--type/--article` options rename the columns in **both** files
  and break the read of his file (his report §7-د).
- **The naming trap:** inside his script, «ours» means HIS file. So `only_ours.tsv` = in his file and not in ours, and
  `only_theirs.tsv` = in our graph and not in his. Tell him this in one sentence.

## 5. PC: annotate the differences

```bash
node --import tsx scripts/graph-owner-compare.mjs annotate \
  --tsv-dir D:/nzwt/graph-compare/out \
  --owner D:/nzwt/graph-compare/data/LEGAL_GRAPH_EDGES_CLEAN.json \
  --ours D:/nzwt/graph-compare/data/our_graph.json \
  --summary D:/nzwt/graph-compare/out/summary.txt \
  --out D:/nzwt/graph-compare/out
```

It first recomputes both difference sets itself. If they do not equal the two TSVs, it stops: the TSVs came from other
files. It then writes:

- `diff_annotated.tsv`: his four columns plus `side` (`his_only` | `ours_only`), `reason`, `his_edge_ids` and
  `our_types`;
- `diff_summary.md`: his two lines verbatim, the coverage, a type × reason table for each side, and the reason codes
  in English and Arabic.

| Reason | Meaning |
|---|---|
| `kind_not_in_ours` | `contains_merged_regulation`, `related_to`, `cites_precedent`: no counterpart in our graph |
| `owner_node_unmapped` / `ours_node_unmapped` | one end has no counterpart document (see the coverage) |
| `regulation_block` | his `to.regulation_ref`: an article of a regulation merged inside the system's file |
| `article_flagged_308` | his edge carries `article_check` |
| `article_differs` | same type and documents, another article number |
| `pair_matched_other_type` | the documents are linked on the other side under another type |
| `inverse_of_matched_pair` | his new→old edge (`supersedes`/`repeals`/`replaces`/`amends`) whose old→new twin matched |
| `reversed` | the link exists on the other side in the opposite direction |
| `kind_not_in_his` | our own label (`OURS:IMPLEMENTED_BY`) with no pair on his side |
| `true_miss` | both documents are known to both sides, and the other side has no link between them |

## 6. H4: nothing deleted, nothing merged

After the compare (or when he answers), run step 1 again into a second file, for example
`/root/graph-owner-export-after.jsonl`. Copy it over, then:

```bash
node --import tsx scripts/graph-owner-compare.mjs snapshot \
  --before D:/nzwt/graph-compare/data/graph-owner-export.jsonl \
  --after D:/nzwt/graph-compare/data/graph-owner-export-after.jsonl
```

It prints the edge counts by type × origin before and after, and `last_synced_at` both times. The watchdog rebuilds the
graph by itself when the library changes, so counts can move for reasons unrelated to this compare. The line «the
watchdog rebuilt the graph between the two runs» says so. `owner_curated` must stay at none: nothing writes it.

## 7. What goes to the owner

Put these in `docs/audits/2026-11-18-graph-compare/`, plus a section in the Arabic owner report:

- his two lines verbatim, and the naming-trap sentence;
- `only_ours.tsv`, `only_theirs.tsv`, `diff_annotated.tsv`, `diff_summary.md`;
- the coverage table and `unmapped_owner_nodes.tsv`;
- our counts by type from `meta.db_snapshot`, and how our graph is built: fixed text rules, his own frontmatter links,
  `parent_law_id`, `article_regulations`, no LLM. Vector links are not exported;
- the H4 before/after.

The known structural differences, which are not misses:

- His merged-regulation self-loops are dropped by our upsert.
- `related_to` is skipped by our owner-links reader.
- Article and principle edges are rolled up to documents.
- An article «12 مكرر» folds into 12.
- His p2f chose law versions by date.
- Library drift since his 2026-11-05 build.
- One of his nodes sits in `_deleted_backups_archive`.

Wait for his answer before any import. An import needs its own table keyed by his `edge_id`, because
`library_graph.edges` cannot hold his file.
