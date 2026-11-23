/**
 * featureFlags.ts — server-side feature switches (O22 / file 15 #53, batch
 * l11-misc).
 *
 * BEFORE: /dashboard/admin/features kept five invented switches in browser
 * state (INITIAL_FLAGS) — toggling them changed nothing, and nothing in the
 * platform read them.
 *
 * NOW: one platform_settings row, `feature_flags` = {"<flag>": true|false},
 * edited by the admin page through PATCH /api/v1/admin/settings (staff
 * settings.write, validated by featureFlagsIssue, audited by logAdminAction)
 * and read on the server by featureFlagsServer.ts (60-second cache, cleared on
 * every write in the same process).
 *
 * THE LIST IS CLOSED: a flag is added here only together with the server code
 * that reads it, so the page never shows a switch that does nothing. A key the
 * list does not know is refused on write and ignored on read; a missing or
 * malformed value reads as the flag's default.
 *
 * The two beta gates (BETA_REVIEW_MODE, BETA_MONOPOLY_MODE in betaConfig.ts)
 * are compile-time constants read by client components in 14 files. They stay
 * code constants and the page shows them read-only (FIXED_FLAGS); moving them
 * here is a separate change.
 *
 * Pure (no imports: betaConfig.ts re-exports a component constant, so the
 * page reads the two gates' values itself), so node --test loads it and the
 * client page can import it.
 */

export const FEATURE_FLAGS_SETTING = "feature_flags";

export interface FeatureFlagDef {
  /** Arabic name shown on the admin page. */
  readonly nameAr: string;
  /** What switching it off does, in plain Arabic. */
  readonly descriptionAr: string;
  /** The value when the row or the key is missing or malformed. */
  readonly defaultOn: boolean;
}

export const FEATURE_FLAGS = Object.freeze({
  // Read by GET/POST /api/v1/chatbot and the site widget (O20 / A21).
  site_assistant: Object.freeze({
    nameAr: "«مساعد نظامي» في الموقع",
    descriptionAr:
      "نافذة أسئلة الزوار عن المنصة والباقات والأسعار والعروض وطريقة التسجيل. تجيب من بيانات المنصة نفسها، ولا تقدّم استشارة قانونية. إيقافه يخفي النافذة من كل الصفحات خلال دقيقة.",
    defaultOn: true,
  }),
  // Batch l12 (owner Q133, register 14 item 17): read by GET /api/library/laws/[slug]/citations.
  // (Batch l12's library_auto_link_tag switch is gone: owner Q171, 22 Nov — no such label at all.
  // A stored value for it is ignored on read; the admin page writes known flags only.)
  library_similar_links: Object.freeze({
    nameAr: "قسم «مواد متقاربة في المعنى» للقارئ",
    descriptionAr:
      "يعرض تحت كل مادة قسماً مستقلاً بالمواد المتقاربة معها في المعنى من أنظمة أخرى. يقترحها النظام حسب المعنى، وليست علاقة نظامية بين المادتين. إيقافه يخفي القسم من القارئ خلال دقيقة، ويبقى في مستكشف الجراف للفريق.",
    defaultOn: true,
  }),
} satisfies Record<string, FeatureFlagDef>);

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
export type FeatureFlagValues = Readonly<Record<FeatureFlagKey, boolean>>;

export const FEATURE_FLAG_KEYS = Object.freeze(Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]);

export function isFeatureFlagKey(key: unknown): key is FeatureFlagKey {
  return typeof key === "string" && Object.hasOwn(FEATURE_FLAGS, key);
}

export function defaultFeatureFlags(): FeatureFlagValues {
  const out = {} as Record<FeatureFlagKey, boolean>;
  for (const k of FEATURE_FLAG_KEYS) out[k] = FEATURE_FLAGS[k].defaultOn;
  return Object.freeze(out);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The stored value → every known flag's state (default where missing or not a boolean; unknown keys ignored). */
export function parseFeatureFlags(value: unknown): FeatureFlagValues {
  const out = { ...defaultFeatureFlags() } as Record<FeatureFlagKey, boolean>;
  if (isPlainObject(value)) {
    for (const k of FEATURE_FLAG_KEYS) {
      const v = Object.hasOwn(value, k) ? value[k] : undefined;
      if (typeof v === "boolean") out[k] = v;
    }
  }
  return Object.freeze(out);
}

/** The admin write validator: an object of known flags → booleans, nothing else. */
export function featureFlagsIssue(value: unknown): string | null {
  if (!isPlainObject(value)) return 'قيمة feature_flags يجب أن تكون كائناً بالشكل {"site_assistant": true}';
  for (const [k, v] of Object.entries(value)) {
    if (!isFeatureFlagKey(k)) return `مفتاح ميزة غير معروف: ${k}`;
    if (typeof v !== "boolean") return `قيمة ${k} يجب أن تكون true أو false`;
  }
  return null;
}

/**
 * The beta gates: code constants (betaConfig.ts BETA_REVIEW_MODE /
 * BETA_MONOPOLY_MODE), shown read-only on the admin page, which pairs each id
 * with its constant.
 */
export interface FixedFlag {
  readonly id: "review" | "single-provider";
  readonly nameAr: string;
  readonly descriptionAr: string;
}

export const FIXED_FLAGS: readonly FixedFlag[] = Object.freeze([
  Object.freeze({
    id: "review",
    nameAr: "مراجعة مخرجات الذكاء الاصطناعي للمحامين",
    descriptionAr: "تُعرض مخرجات أدوات الصياغة للمحامي والمكتب بعد مراجعتها خلال المرحلة التجريبية.",
  }),
  Object.freeze({
    id: "single-provider",
    nameAr: "نظامي مقدّم الخدمة الوحيد",
    descriptionAr: "سوق المحامين الخارجيين مغلق خلال المرحلة التجريبية، ونظامي هو مقدّم الخدمة.",
  }),
]);

// ── the server cache (pure; featureFlagsServer.ts gives it the database read) ──

export const FEATURE_FLAGS_TTL_MS = 60_000;

export interface FeatureFlagCache {
  get(): Promise<FeatureFlagValues>;
  clear(): void;
}

/**
 * A TTL cache over `load` (one read per ttl, concurrent callers share it). A
 * failed load answers the defaults and is cached for a short 5 s, so a
 * database blip neither hammers the table nor sticks for a minute.
 */
export function createFeatureFlagCache(
  load: () => Promise<unknown>,
  opts: { ttlMs?: number; now?: () => number } = {},
): FeatureFlagCache {
  const ttl = opts.ttlMs ?? FEATURE_FLAGS_TTL_MS;
  const now = opts.now ?? Date.now;
  let cached: { value: FeatureFlagValues; expiresAt: number } | null = null;
  let inflight: Promise<FeatureFlagValues> | null = null;
  let generation = 0;
  return {
    async get() {
      if (cached && cached.expiresAt > now()) return cached.value;
      if (inflight) return inflight;
      const gen = generation;
      inflight = load()
        .then((raw) => ({ value: parseFeatureFlags(raw), life: ttl }))
        .catch(() => ({ value: defaultFeatureFlags(), life: Math.min(ttl, 5_000) }))
        .then(({ value, life }) => {
          if (gen === generation) cached = { value, expiresAt: now() + life };
          return value;
        })
        .finally(() => {
          if (gen === generation) inflight = null;
        });
      return inflight;
    },
    clear() {
      generation += 1;
      cached = null;
      inflight = null;
    },
  };
}
