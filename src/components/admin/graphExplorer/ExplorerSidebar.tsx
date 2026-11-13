"use client";

/**
 * ExplorerSidebar.tsx — three ways into the graph:
 *   البحث          find any node by title, key or text (type filters)
 *   نقاط البداية    corpus coverage, link mix, the 32 legal concepts, top hubs
 *   مختبر البحث     run a real question through the same hybrid retrieval the
 *                   AI tools use and see what it would cite, and why
 */

import { useRef, useState, type RefObject } from "react";
import {
  MagnifyingGlass, Compass, Flask, CircleNotch, Lightning, Graph, ArrowElbowDownLeft, Warning,
} from "@phosphor-icons/react";
import {
  EDGE_TYPE_META,
  EXPLORER_EDGE_TYPES,
  EXPLORER_NODE_TYPES,
  NODE_TYPE_META,
  isExplorerEdgeType,
  isRepealedNode,
  type ExplorerNodeType,
} from "@/lib/ai/graphExplorerCore";
import { explorerApi, type LabResult, type OverviewData, type SearchResult } from "./explorerApi";

export type SidebarTab = "search" | "start" | "lab";

interface Props {
  tab: SidebarTab;
  onTab: (t: SidebarTab) => void;
  overview: OverviewData | null;
  onFocus: (key: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  lab: LabResult | null;
  labLoading: boolean;
  labError: string | null;
  labActive: boolean;
  onRunLab: (question: string, keywords: string) => void;
  onShowLab: () => void;
  onLabSelect: (key: string) => void;
}

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString("en-US");

export default function ExplorerSidebar(props: Props) {
  const { tab, onTab } = props;
  const tabs: Array<{ id: SidebarTab; label: string; icon: typeof MagnifyingGlass }> = [
    { id: "search", label: "البحث", icon: MagnifyingGlass },
    { id: "start", label: "نقاط البداية", icon: Compass },
    { id: "lab", label: "مختبر البحث", icon: Flask },
  ];
  return (
    <div className="flex h-full flex-col">
      <div role="tablist" className="grid grid-cols-3 gap-1 border-b border-zinc-800/80 p-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11.5px] font-bold transition ${
              tab === id ? "bg-[#C8A762]/12 text-[#C8A762] shadow-[inset_0_0_0_1px_rgba(200,167,98,0.35)]" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
            }`}
          >
            <Icon size={14} weight={tab === id ? "fill" : "regular"} /> {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "search" && <SearchTab {...props} />}
        {tab === "start" && <StartTab {...props} />}
        {tab === "lab" && <LabTab {...props} />}
      </div>
    </div>
  );
}

// ─── Search ──────────────────────────────────────────────────────────────────

function SearchTab({ onFocus, searchInputRef }: Props) {
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<ExplorerNodeType[]>([]);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  function run(query: string, typeList: ExplorerNodeType[]) {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const mine = ++seq.current;
      const res = await explorerApi.search(query.trim(), typeList);
      if (mine !== seq.current) return;
      setLoading(false);
      if (res.ok) {
        setResults(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
    }, 280);
  }

  function toggleType(t: ExplorerNodeType) {
    const next = types.includes(t) ? types.filter((x) => x !== t) : [...types, t];
    setTypes(next);
    run(q, next);
  }

  return (
    <div className="p-3">
      <label className="relative block">
        <MagnifyingGlass size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          ref={searchInputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            run(e.target.value, types);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results?.[0]) onFocus(results[0].node_key);
          }}
          placeholder="ابحث: «نظام العمل 77»، «الفصل التعسفي»، معرّف عقدة…"
          className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900/80 py-2.5 pl-9 pr-9 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:border-[#C8A762]/60 focus:outline-none focus:ring-2 focus:ring-[#C8A762]/20"
        />
        {loading ? (
          <CircleNotch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-zinc-500" />
        ) : (
          <kbd className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded border border-zinc-700 px-1.5 font-mono text-[10px] text-zinc-500">/</kbd>
        )}
      </label>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {EXPLORER_NODE_TYPES.map((t) => {
          const on = types.includes(t);
          const c = NODE_TYPE_META[t].color;
          return (
            <button
              key={t}
              onClick={() => toggleType(t)}
              aria-pressed={on}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold transition"
              style={on ? { borderColor: c, color: c, background: `${c}18` } : { borderColor: "#3f3f46", color: "#a1a1aa" }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} /> {NODE_TYPE_META[t].label}
            </button>
          );
        })}
      </div>

      {error && <p className="mt-3 text-[12px] text-red-300">{error}</p>}

      {results === null ? (
        <p className="mt-6 px-1 text-center text-[12px] leading-relaxed text-zinc-500">
          اكتب حرفين على الأقل. <span className="text-zinc-400">Enter</span> يفتح أول نتيجة.
        </p>
      ) : results.length === 0 ? (
        <p className="mt-6 text-center text-[12px] text-zinc-500">لا نتائج. جرّب كلمة أقصر أو أزل فلتر النوع.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {results.map((r) => {
            const c = r.node_type === "query" ? "#C8A762" : NODE_TYPE_META[r.node_type].color;
            return (
              <li key={r.node_key}>
                <button
                  onClick={() => onFocus(r.node_key)}
                  className="group relative w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5 pr-3.5 text-right transition hover:border-zinc-600 hover:bg-zinc-900"
                >
                  <span aria-hidden className="absolute inset-y-2 right-0 w-[3px] rounded-l-full" style={{ background: c }} />
                  <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500">
                    <span style={{ color: c }} className="font-bold">{r.node_type !== "query" && NODE_TYPE_META[r.node_type].label}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono">{r.degree}</span> رابط
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={r.has_vector ? { background: "#C8A762" } : { border: "1px solid #52525b" }} />
                    </span>
                  </div>
                  <p className={`mt-1 line-clamp-2 text-[12.5px] font-bold leading-snug ${isRepealedNode(r) ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{r.title}</p>
                  {r.snippet && <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">{r.snippet}</p>}
                  <ArrowElbowDownLeft size={12} className="absolute bottom-2.5 left-2.5 text-zinc-600 opacity-0 transition group-hover:opacity-100" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Starting points (overview) ──────────────────────────────────────────────

function StartTab({ overview, onFocus }: Props) {
  if (!overview) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-xl bg-zinc-900/70" />
        ))}
      </div>
    );
  }
  const totalNodes = Object.values(overview.node_counts).reduce((s, n) => s + (n ?? 0), 0);
  const totalEdges = Object.values(overview.edge_counts).reduce((s, n) => s + (n ?? 0), 0);
  const maxEdge = Math.max(1, ...Object.values(overview.edge_counts).map((n) => n ?? 0));

  return (
    <div className="space-y-6 p-4">
      <section>
        <div className="flex items-baseline justify-between">
          <h3 className="font-heading text-[13px] font-bold text-zinc-200">التغطية الدلالية</h3>
          <span className="font-mono text-[10.5px] text-zinc-500">{overview.default_model_id ?? "—"}</span>
        </div>
        <div className="mt-3 space-y-2.5">
          {EXPLORER_NODE_TYPES.map((t) => {
            const total = overview.node_counts[t] ?? 0;
            if (total === 0) return null;
            const embeddable = overview.embeddable_counts[t] ?? 0;
            const embedded = overview.embedded_counts[t] ?? 0;
            const pct = embeddable > 0 ? Math.min(100, (embedded / embeddable) * 100) : 0;
            const c = NODE_TYPE_META[t].color;
            return (
              <div key={t}>
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} /> {NODE_TYPE_META[t].plural}
                  </span>
                  <span className="font-mono text-[10.5px] text-zinc-500">
                    {embeddable > 0 ? `${fmt(embedded)} / ${fmt(embeddable)}` : `${fmt(total)} · نصي فقط`}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: c }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-zinc-500">
          {fmt(totalNodes)} عقدة · {fmt(totalEdges)} رابط · {fmt(overview.repealed_nodes)} ملغاة
          {overview.last_synced_at && ` · آخر مزامنة ${new Date(overview.last_synced_at).toLocaleString("ar-SA-u-nu-latn")}`}
        </p>
      </section>

      <section>
        <h3 className="font-heading text-[13px] font-bold text-zinc-200">أنواع الروابط</h3>
        <div className="mt-3 space-y-2">
          {EXPLORER_EDGE_TYPES.filter((t) => (overview.edge_counts[t] ?? 0) > 0).map((t) => {
            const n = overview.edge_counts[t] ?? 0;
            const m = EDGE_TYPE_META[t];
            return (
              <div key={t} title={m.hint}>
                <div className="flex items-center justify-between text-[11.5px]">
                  <span style={{ color: m.color }} className="font-bold">{m.label}</span>
                  <span className="font-mono text-[10.5px] text-zinc-500">{fmt(n)}</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-zinc-800">
                  <div className="h-full rounded-full" style={{ width: `${(n / maxEdge) * 100}%`, background: m.color, opacity: 0.8 }} />
                </div>
              </div>
            );
          })}
          {totalEdges === 0 && <p className="text-[12px] text-zinc-500">لا روابط بعد — تُبنى عند أول مزامنة.</p>}
        </div>
      </section>

      {overview.concepts.length > 0 && (
        <section>
          <h3 className="font-heading text-[13px] font-bold text-zinc-200">المفاهيم القانونية</h3>
          <p className="mt-1 text-[11px] text-zinc-500">كل مفهوم يجمع المواد التي تحكمه عبر الأنظمة.</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {overview.concepts.map((c) => (
              <button
                key={c.node_key}
                onClick={() => onFocus(c.node_key)}
                className="rounded-full border border-[#7FA8DC]/35 bg-[#7FA8DC]/[0.06] px-2.5 py-1 text-[11px] text-[#a9c4e8] transition hover:border-[#7FA8DC]/70 hover:bg-[#7FA8DC]/15"
              >
                {c.title} <span className="font-mono text-[9.5px] text-[#7FA8DC]/70">{c.degree}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {overview.top_hubs.length > 0 && (
        <section>
          <h3 className="font-heading text-[13px] font-bold text-zinc-200">أكثر النصوص ترابطاً</h3>
          <ol className="mt-2.5 space-y-1">
            {overview.top_hubs.map((h, i) => (
              <li key={h.node_key}>
                <button onClick={() => onFocus(h.node_key)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-right hover:bg-zinc-800/60">
                  <span className="w-5 font-mono text-[10.5px] text-zinc-600">{String(i + 1).padStart(2, "0")}</span>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: NODE_TYPE_META[h.node_type]?.color }} />
                  <span className="line-clamp-1 flex-1 text-[12px] text-zinc-300">{h.title}</span>
                  <span className="font-mono text-[10.5px] text-[#C8A762]">{h.degree}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

// ─── Retrieval lab ───────────────────────────────────────────────────────────

const LAB_EXAMPLES = ["طردوني من الشركة فجأة بدون سبب ولا تعويض", "صاحب العمل ما سلّمني راتبي ثلاثة أشهر", "هل يجوز فسخ عقد الإيجار قبل انتهاء المدة؟"];

function LabTab({ lab, labLoading, labError, labActive, onRunLab, onShowLab, onLabSelect }: Props) {
  const [question, setQuestion] = useState("");
  const [keywords, setKeywords] = useState("");

  return (
    <div className="p-3">
      <p className="mb-2.5 px-1 text-[11.5px] leading-relaxed text-zinc-500">
        يشغّل السؤال على نفس محرّك البحث الهجين الذي تستخدمه أدوات الذكاء الاصطناعي (نصي + دلالي + رابط واحد عبر الجراف)، ويعرض ما كانت ستستشهد به ولماذا.
      </p>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="اكتب سؤالاً كما يكتبه المستخدم، بالعامية أو الفصحى…"
        className="w-full resize-none rounded-xl border border-zinc-700/80 bg-zinc-900/80 p-3 text-[13px] leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-[#C8A762]/60 focus:outline-none focus:ring-2 focus:ring-[#C8A762]/20"
      />
      <input
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
        placeholder="كلمات بحث اختيارية مفصولة بفواصل (مثل: فصل تعسفي، تعويض)"
        className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/50 focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {LAB_EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => setQuestion(ex)} className="rounded-full border border-zinc-800 px-2.5 py-1 text-[10.5px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200">
            {ex}
          </button>
        ))}
      </div>
      <button
        disabled={labLoading || question.trim().length < 3}
        onClick={() => onRunLab(question, keywords)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#C8A762] py-2.5 text-[12.5px] font-black text-black transition hover:bg-[#d4b87a] disabled:opacity-40"
      >
        {labLoading ? <CircleNotch size={15} className="animate-spin" /> : <Lightning size={15} weight="fill" />} تشغيل البحث
      </button>

      {labError && <p className="mt-3 text-[12px] text-red-300">{labError}</p>}

      {lab && (
        <div className="mt-5">
          <div className="flex flex-wrap gap-1.5 text-[10.5px] font-bold">
            <span className={`rounded-full px-2 py-0.5 ${lab.vector_used ? "bg-[#C8A762]/12 text-[#C8A762]" : "bg-zinc-800 text-zinc-400"}`}>
              {lab.vector_used ? "دلالي + نصي + جراف" : "نصي + جراف (بلا متجه)"}
            </span>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-zinc-400">{lab.elapsed_ms}ms</span>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">{lab.hits.length} نتيجة</span>
          </div>
          {lab.embedding !== "used" && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-200">
              <Warning size={13} className="mt-0.5 shrink-0" />
              {lab.embedding === "no_key"
                ? "لا يوجد مفتاح تضمين على الخادم (GEMINI_EMBEDDING_API_KEY)، فجرى البحث نصياً وعبر الروابط فقط."
                : "تعذّر حساب متجه السؤال الآن (حد المزوّد أو انقطاع)، فجرى البحث نصياً وعبر الروابط فقط."}
            </p>
          )}
          <p className="mt-2 text-[11px] text-zinc-500">
            كلمات البحث: {lab.queries.length ? lab.queries.map((q) => `«${q}»`).join("، ") : "—"}
          </p>

          {!labActive && lab.hits.length > 0 && (
            <button onClick={onShowLab} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#C8A762]/40 py-2 text-[11.5px] font-bold text-[#C8A762] hover:bg-[#C8A762]/10">
              <Graph size={13} /> عرض النتائج على الخريطة
            </button>
          )}

          <ol className="mt-3 space-y-1.5">
            {lab.hits.map((h, i) => {
              const c = NODE_TYPE_META[h.kind].color;
              const via = h.via_edge_type && isExplorerEdgeType(h.via_edge_type) ? EDGE_TYPE_META[h.via_edge_type] : null;
              return (
                <li key={h.node_key}>
                  <button onClick={() => onLabSelect(h.node_key)} className="relative w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5 pr-3.5 text-right hover:border-zinc-600">
                    <span aria-hidden className="absolute inset-y-2 right-0 w-[3px] rounded-l-full" style={{ background: c }} />
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1.5">
                        <span className="rounded bg-[#C8A762] px-1.5 font-mono font-black text-black">S{i + 1}</span>
                        <span style={{ color: c }} className="font-bold">{NODE_TYPE_META[h.kind].label}</span>
                      </span>
                      <span className="font-mono text-zinc-500">{h.score.toFixed(4)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12.5px] font-bold leading-snug text-zinc-100">{h.title}</p>
                    {via && (
                      <p className="mt-1 text-[10.5px]" style={{ color: via.color }}>
                        ↳ عبر «{via.label}» من {h.via_from_title}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          {lab.hits.length === 0 && <p className="mt-4 text-center text-[12px] text-zinc-500">لا نتائج. جرّب كلمات بحث صريحة.</p>}
        </div>
      )}
    </div>
  );
}
