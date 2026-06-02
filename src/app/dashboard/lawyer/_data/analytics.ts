// ─── Metal Tier System (10 levels — based on CUMULATIVE focus hours since account creation)
// Hours are like XP — they accumulate over time and never reset.
// Tier order (lowest → highest value): نحاس < برونز < فضة < ذهب < بلاتين < زمرد < ياقوت < ألماس < روديوم < أسطوري

export const METAL_TIERS = [
  { min: 600, label: "أسطوري",  color: "#f0abfc", emoji: "⭐", next: null, nextTarget: 600 }, // Legendary — beyond all metals
  { min: 450, label: "روديوم",  color: "#e2e8f0", emoji: "🪨", next: 600,  nextTarget: 600 }, // Rhodium — rarest/most expensive metal on earth
  { min: 300, label: "ألماس",   color: "#7dd3fc", emoji: "💎", next: 450,  nextTarget: 450 }, // Diamond
  { min: 200, label: "ياقوت",   color: "#dc2626", emoji: "🔴", next: 300,  nextTarget: 300 }, // Ruby
  { min: 150, label: "زمرد",    color: "#059669", emoji: "💚", next: 200,  nextTarget: 200 }, // Emerald
  { min: 100, label: "بلاتين",  color: "#94a3b8", emoji: "🔘", next: 150,  nextTarget: 150 }, // Platinum
  { min: 50,  label: "ذهب",     color: "#C8A762", emoji: "🟡", next: 100,  nextTarget: 100 }, // Gold
  { min: 25,  label: "فضة",     color: "#cbd5e1", emoji: "⬜", next: 50,   nextTarget: 50  }, // Silver
  { min: 10,  label: "برونز",   color: "#cd7f32", emoji: "🔶", next: 25,   nextTarget: 25  }, // Bronze
  { min: 0,   label: "نحاس",    color: "#b87333", emoji: "🟤", next: 10,   nextTarget: 10  }, // Copper
] as const;

export type MetalTier = (typeof METAL_TIERS)[number];

export function getMetalTier(hours: number): MetalTier {
  return METAL_TIERS.find(t => hours >= t.min) ?? METAL_TIERS[METAL_TIERS.length - 1];
}

// ─── Work Hours — Cumulative Focus Hours ──────────────────────────────────────
// `total` = accumulated hours since account creation (XP-style, never resets)
// Display separately: thisWeek, thisMonth for short-term progress
export const WORK_HOURS = {
  total: 36.5,      // cumulative since account creation → determines metal tier
  thisWeek: 8.5,    // for weekly stats card
  thisMonth: 31.2,  // for monthly stats card
  streak: 9,        // consecutive active days
  sessions: 87,     // total pomodoro sessions completed
};

// ─── Analytics Period ─────────────────────────────────────────────────────────

export type AnalyticsPeriod = "أسبوع" | "شهر" | "سنة";

// ─── Work Distribution ────────────────────────────────────────────────────────

export const WORK_DIST = [
  { label: "قضايا مدنية",    pct: 38, color: "#0B3D2E", sub: ["استئناف تجاري", "تحكيم", "عقود", "شركات"] },
  { label: "عقود وصفقات",    pct: 27, color: "#C8A762", sub: ["عقود إيجار", "شراكات", "تراخيص", "M&A"] },
  { label: "استشارات فردية", pct: 20, color: "#3b82f6", sub: ["عمالي", "أحوال شخصية", "ميراث", "غير ذلك"] },
  { label: "قضايا جنائية",   pct: 15, color: "#ef4444", sub: ["نيابة", "تمييز جنائي", "تعويض"] },
];

// ─── Win Rate ────────────────────────────────────────────────────────────────

export const WIN_RATE_PCT = 74;
export const WIN = { won: 106, settled: 22, lost: 15, pending: 8 };
export const WIN_TOTAL = WIN.won + WIN.settled + WIN.lost + WIN.pending;

// ─── AI Tools Usage ───────────────────────────────────────────────────────────

export const AI_TOOLS = [
  { label: "الصائغ القانوني", uses: 47, color: "#0B3D2E" },
  { label: "الباراليجل",      uses: 38, color: "#C8A762" },
  { label: "المجيب السريع",   uses: 31, color: "#3b82f6" },
  { label: "الرأي الفصل",     uses: 19, color: "#8b5cf6" },
  { label: "محاكي القضايا",   uses: 14, color: "#f59e0b" },
  { label: "فاحص المذكرات",   uses: 11, color: "#ef4444" },
];

// ─── Professional Development Scores ─────────────────────────────────────────

export const PRO_SCORES = [
  { label: "التواصل",      score: 88, color: "#0B3D2E" },
  { label: "الاستراتيجية", score: 79, color: "#C8A762" },
  { label: "التوثيق",      score: 92, color: "#3b82f6" },
  { label: "الالتزام",     score: 85, color: "#8b5cf6" },
];

// ─── Activity Data (per period) ───────────────────────────────────────────────

export const ACTIVITY_DATA: Record<AnalyticsPeriod, { label: string; cases: number; contracts: number; consult: number }[]> = {
  "أسبوع": [
    { label: "أح", cases: 3, contracts: 1, consult: 2 },
    { label: "إث", cases: 5, contracts: 2, consult: 1 },
    { label: "ث",  cases: 2, contracts: 3, consult: 4 },
    { label: "أر", cases: 4, contracts: 1, consult: 3 },
    { label: "خم", cases: 6, contracts: 2, consult: 2 },
    { label: "جم", cases: 1, contracts: 0, consult: 1 },
    { label: "سب", cases: 0, contracts: 0, consult: 0 },
  ],
  "شهر": [
    { label: "أس١", cases: 12, contracts: 5,  consult: 8  },
    { label: "أس٢", cases: 15, contracts: 7,  consult: 6  },
    { label: "أس٣", cases: 9,  contracts: 4,  consult: 10 },
    { label: "أس٤", cases: 18, contracts: 6,  consult: 5  },
  ],
  "سنة": [
    { label: "يناير",  cases: 22, contracts: 8,  consult: 15 },
    { label: "فبراير", cases: 19, contracts: 6,  consult: 12 },
    { label: "مارس",   cases: 28, contracts: 11, consult: 18 },
    { label: "أبريل",  cases: 24, contracts: 9,  consult: 14 },
    { label: "مايو",   cases: 31, contracts: 12, consult: 20 },
    { label: "يونيو",  cases: 26, contracts: 8,  consult: 16 },
    { label: "يوليو",  cases: 20, contracts: 7,  consult: 11 },
    { label: "أغسطس",  cases: 18, contracts: 5,  consult: 9  },
    { label: "سبتمبر", cases: 29, contracts: 10, consult: 17 },
    { label: "أكتوبر", cases: 33, contracts: 14, consult: 22 },
    { label: "نوفمبر", cases: 27, contracts: 9,  consult: 15 },
    { label: "ديسمبر", cases: 15, contracts: 6,  consult: 8  },
  ],
};

// ─── Financial Data ───────────────────────────────────────────────────────────

export const FINANCIAL_DATA = {
  total: 123450,
  monthly: 10287,
  bestMonth: { name: "نوفمبر", amount: 24300 },
  sources: [
    { label: "قضايا",    pct: 48, color: "#0B3D2E" },
    { label: "عقود",     pct: 27, color: "#C8A762" },
    { label: "استشارات", pct: 25, color: "#3b82f6" },
  ],
};

// ─── Share Privacy Defaults ───────────────────────────────────────────────────

export const SHARE_TOGGLE_DEFAULTS = {
  profile:      true,
  metalLevel:   true,
  achievements: true,
  reviews:      true,
  financial:    false,
  winRate:      true,
};
