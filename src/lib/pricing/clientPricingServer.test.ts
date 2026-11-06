import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CLIENT_SERVICE_CATALOG } from "../../constants/clientServiceCatalog.ts";
import {
  getClientServiceById,
  getClientServiceCategories,
  getClientServicesByCategory,
  mergeAdminPricingCatalogRows,
  type AdminPricingCatalogRow,
} from "../pricingRepository.ts";
import { CLIENT_PRICING_REST_QUERY, loadClientPricingCatalog } from "./clientPricingServer.ts";

// ── fixtures ──────────────────────────────────────────────────────────────

/** The 27 rows of the 20260518 seed, parsed from the migration itself. */
function seedRows(): AdminPricingCatalogRow[] {
  const sql = readFileSync(
    new URL("../../../supabase/migrations/20260518_client_workflow_backend_ready.sql", import.meta.url),
    "utf8",
  );
  const block = sql.slice(
    sql.indexOf("insert into public.admin_pricing_catalog"),
    sql.indexOf("on conflict (service_id) do update"),
  );
  const re =
    /\('([^']+)', '([^']+)', '([^']+)', '([^']+)', (\d+), '([^']+)', '([^']+)', '([^']+)', (true|false), (true|false),\s*'(\{[^\n]*?\})'::jsonb\)/g;
  const rows: AdminPricingCatalogRow[] = [];
  for (const m of block.matchAll(re)) {
    rows.push({
      service_id: m[1],
      audience: m[2],
      category_id: m[3] as AdminPricingCatalogRow["category_id"],
      label_ar: m[4],
      base_price: m[5],
      price_mode: m[6] as AdminPricingCatalogRow["price_mode"],
      receiver_type: m[7] as AdminPricingCatalogRow["receiver_type"],
      beta_visibility: m[8] as AdminPricingCatalogRow["beta_visibility"],
      requires_payment: m[9] === "true",
      enabled: m[10] === "true",
      metadata: JSON.parse(m[11]),
    });
  }
  return rows;
}

/**
 * What PostgREST returns for each query, row by row. The new filter is
 * `or=(enabled.eq.true,metadata->>adminHidden.eq.true)` — checked live on
 * postgrest/postgrest:v12.2.3 + postgres:16 (task-3 report).
 */
const OLD_QUERY = (r: AdminPricingCatalogRow) => (r.audience ?? "individual") === "individual" && r.enabled !== false;
const NEW_QUERY = (r: AdminPricingCatalogRow) =>
  ["individual", "corporate"].includes(r.audience ?? "individual") &&
  (r.enabled !== false || String((r.metadata as Record<string, unknown> | undefined)?.adminHidden) === "true");

/** The card list of /dashboard/client/services (every category is public). */
const cardIds = (catalog: ReturnType<typeof mergeAdminPricingCatalogRows>) =>
  getClientServiceCategories({ includeBeta: true }).flatMap((c) =>
    getClientServicesByCategory(c.categoryId, catalog).map((s) => s.serviceId),
  );

const ALL_27 = [
  "ai-consult", "video-short", "video-full", "in-person", "written-opinion",
  "contract-draft", "ai-letter", "contract-analyze", "contract-review",
  "ai-case-eval", "case-study", "second-opinion", "legal-research",
  "file-lawsuit", "appeal", "cassation", "defense", "admin-objection",
  "mediation", "full-arbitration", "settlement",
  "legal-notice", "power-of-attorney", "inheritance", "enforce-judgment", "translation", "general",
];

const BUSINESS_ROW: AdminPricingCatalogRow = {
  service_id: "contract-review-business",
  audience: "corporate",
  category_id: "contracts",
  label_ar: "مراجعة من محام متخصص",
  base_price: "800",
  price_mode: "starting_from",
  receiver_type: "lawyer",
  beta_visibility: "public",
  requires_payment: true,
  enabled: true,
  metadata: { variantOf: "contract-review", priceNote: "سعر الأعمال؛ يُؤكَّد بعد الاطلاع على العقد" },
};

// ── the loader ──────────────────────────────────────────────────────────────

async function withEnv<T>(fn: () => Promise<T>): Promise<T> {
  const saved = {
    url: process.env.SUPABASE_URL,
    pub: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = "https://db.example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    return await fn();
  } finally {
    for (const [k, v] of [
      ["SUPABASE_URL", saved.url],
      ["NEXT_PUBLIC_SUPABASE_URL", saved.pub],
      ["SUPABASE_SERVICE_ROLE_KEY", saved.key],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("S6: the loader asks for both audiences and falls back to the code catalogue", async () => {
  await withEnv(async () => {
    const urls: string[] = [];
    const fail = (async (url: string | URL | Request) => {
      urls.push(String(url));
      return new Response("boom", { status: 500 });
    }) as typeof fetch;
    const down = await loadClientPricingCatalog(fail);
    assert.ok(urls[0].endsWith(`/rest/v1/admin_pricing_catalog?${CLIENT_PRICING_REST_QUERY}`), urls[0]);
    assert.ok(urls[0].startsWith("https://db.example.invalid/"));
    assert.equal(down.source, "admin-seed");
    assert.equal(down.catalog.find((s) => s.serviceId === "contract-review-business")?.basePrice, 800);

    const empty = await loadClientPricingCatalog((async () => Response.json([])) as typeof fetch);
    assert.equal(empty.source, "backend");
    assert.equal(empty.catalog.length, CLIENT_SERVICE_CATALOG.length);

    const thrown = await loadClientPricingCatalog((async () => {
      throw new Error("network");
    }) as typeof fetch);
    assert.equal(thrown.source, "admin-seed");

    const notArray = await loadClientPricingCatalog((async () => Response.json({ message: "x" })) as typeof fetch);
    assert.equal(notArray.source, "admin-seed");

    const db = await loadClientPricingCatalog((async () => Response.json([{ ...BUSINESS_ROW, base_price: "850" }])) as typeof fetch);
    assert.equal(db.source, "backend");
    assert.equal(db.catalog.find((s) => s.serviceId === "contract-review-business")?.basePrice, 850);
  });
});

test("S6: the loader sends the service-role key, never caches, and needs both env values", async () => {
  await withEnv(async () => {
    let init: RequestInit | undefined;
    await loadClientPricingCatalog((async (_u: unknown, i?: RequestInit) => {
      init = i;
      return Response.json([]);
    }) as typeof fetch);
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.apikey, "service-role-test");
    assert.equal(headers.Authorization, "Bearer service-role-test");
    assert.equal(init?.cache, "no-store");

    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    let called = false;
    const noKey = await loadClientPricingCatalog((async () => {
      called = true;
      return Response.json([]);
    }) as typeof fetch);
    assert.equal(called, false);
    assert.equal(noKey.source, "admin-seed");
  });
});

test("S6: the query — both audiences; disabled rows only when an admin hid them on purpose", () => {
  assert.equal(
    CLIENT_PRICING_REST_QUERY,
    "select=*&audience=in.(individual,corporate)&or=(enabled.eq.true,metadata->>adminHidden.eq.true)&order=category_id.asc,service_id.asc",
  );
});

// ── no customer-visible change (coordinator ruling on the S6-T3 stop) ────────

test("S6: visible cards before and after the query change are EQUAL for the 20260518 seed", () => {
  const rows = seedRows();
  assert.equal(rows.length, 27, "the fixture parses the whole seed");
  assert.equal(rows.filter((r) => r.enabled === false).length, 15, "the 15 legacy disabled rows");
  const before = cardIds(mergeAdminPricingCatalogRows(rows.filter(OLD_QUERY)));
  const after = cardIds(mergeAdminPricingCatalogRows(rows.filter(NEW_QUERY)));
  assert.deepEqual(before, ALL_27);
  assert.deepEqual(after, ALL_27);
  // With the business row (20261103_20) too: still the same 27 cards.
  const withBusiness = [...rows, BUSINESS_ROW];
  assert.deepEqual(cardIds(mergeAdminPricingCatalogRows(withBusiness.filter(NEW_QUERY))), ALL_27);
  // And the legacy disabled rows' stale values (49 / «شائع») stay out of
  // every by-id lookup: the code entries still win.
  const merged = mergeAdminPricingCatalogRows(rows.filter(NEW_QUERY));
  for (const id of ["ai-letter", "appeal", "general"]) {
    assert.deepEqual(getClientServiceById(id, merged), CLIENT_SERVICE_CATALOG.find((s) => s.serviceId === id), id);
  }
});

test("S6: an enabled=false row with metadata.adminHidden=true hides its card", () => {
  const hidden = { ...seedRows().find((r) => r.service_id === "appeal")!, metadata: { adminHidden: true } };
  assert.equal(NEW_QUERY(hidden), true, "the query fetches it");
  const ids = cardIds(mergeAdminPricingCatalogRows([hidden]));
  assert.ok(!ids.includes("appeal"));
  assert.equal(ids.length, 26);
});

test("S6: an enabled=false row without adminHidden does not hide its card", () => {
  for (const metadata of [{}, { adminHidden: false }]) {
    const legacy = { ...seedRows().find((r) => r.service_id === "appeal")!, metadata };
    assert.equal(NEW_QUERY(legacy), false, "the query never fetches it");
    const ids = cardIds(mergeAdminPricingCatalogRows([legacy].filter(NEW_QUERY)));
    assert.ok(ids.includes("appeal"));
  }
});

test("fix round 1 (M6): a hung catalogue read times out to the code catalogue (3 s by default)", async () => {
  const { CLIENT_PRICING_TIMEOUT_MS } = await import("./clientPricingServer.ts");
  assert.equal(CLIENT_PRICING_TIMEOUT_MS, 3000);
  await withEnv(async () => {
    let signal: AbortSignal | undefined;
    // Never answers; rejects only when the signal aborts (as real fetch does).
    const hung = ((_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        signal = init?.signal ?? undefined;
        signal?.addEventListener("abort", () => reject(signal?.reason));
      })) as typeof fetch;
    const started = Date.now();
    const out = await loadClientPricingCatalog(hung, 30);
    assert.ok(signal, "the loader passes an AbortSignal");
    assert.equal(signal?.aborted, true);
    assert.equal(out.source, "admin-seed");
    assert.equal(out.catalog.find((s) => s.serviceId === "contract-review-business")?.basePrice, 800);
    assert.ok(Date.now() - started < 2000, "returned on the timeout, not later");
  });
});
