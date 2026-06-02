// ─── Pomodoro Pro — Types ─────────────────────────────────────────────────────

export type PomodoroMode = "focus" | "short" | "long";

export type NoiseChannel =
  | "rain" | "heavy_rain" | "train" | "cafe"
  | "ac"   | "fire"       | "ocean" | "wind"
  | "birds";

export interface ActiveNoise {
  channel: NoiseChannel;
  volume: number; // 0–1
}

export interface PomodoroSession {
  id:          string;
  mode:        PomodoroMode;
  startedAt:   string;  // ISO string (serializable)
  endedAt:     string;
  taskTitle?:  string;
  completed:   boolean;
  durationMin: number;
  noises:      NoiseChannel[];
}

// ─── Rank Level System (Metals & Gems) ───────────────────────────────────────

export interface RankLevel {
  level:    number;
  name:     string;
  nameEn:   string;
  emoji:    string;
  color:    string;
  desc:     string;
  minSessions: number;
}

export const RANK_LEVELS: RankLevel[] = [
  { level:1,  name:"نحاس",      nameEn:"Copper",    emoji:"🟤", color:"#b87333", desc:"البداية — أساس صلب للعمل",           minSessions:0   },
  { level:2,  name:"برونز",     nameEn:"Bronze",    emoji:"🔶", color:"#cd7f32", desc:"أولى خطوات الانضباط والمثابرة",      minSessions:5   },
  { level:3,  name:"فضة",       nameEn:"Silver",    emoji:"⬜", color:"#cbd5e1", desc:"تركيز مصقول وقيمة عالية",            minSessions:15  },
  { level:4,  name:"ذهب",       nameEn:"Gold",      emoji:"🟡", color:"#C8A762", desc:"اللمعان والتميز — إنتاجية عالية",    minSessions:30  },
  { level:5,  name:"بلاتين",    nameEn:"Platinum",  emoji:"🔘", color:"#94a3b8", desc:"نادر وصلب — ثبات في التركيز",        minSessions:50  },
  { level:6,  name:"زمرد",      nameEn:"Emerald",   emoji:"💚", color:"#059669", desc:"عمق وصفاء ذهني كالأحجار الكريمة",    minSessions:75  },
  { level:7,  name:"ياقوت",     nameEn:"Ruby",      emoji:"🔴", color:"#dc2626", desc:"شغف وتركيز ناري يلفت الأنظار",       minSessions:100 },
  { level:8,  name:"ألماس",     nameEn:"Diamond",   emoji:"💎", color:"#7dd3fc", desc:"أعلى درجات الصلابة — قمة التركيز",   minSessions:150 },
  { level:9,  name:"روديوم",    nameEn:"Rhodium",   emoji:"🪨", color:"#e2e8f0", desc:"نادر وثمين جداً — تركيز خارق",       minSessions:200 },
  { level:10, name:"أسطوري",    nameEn:"Legendary", emoji:"⭐", color:"#f0abfc", desc:"أسطورة الإنتاجية — لا يُقهر",         minSessions:300 },
];

export function getRankLevel(totalSessions: number): RankLevel {
  for (let i = RANK_LEVELS.length - 1; i >= 0; i--) {
    if (totalSessions >= RANK_LEVELS[i].minSessions) return RANK_LEVELS[i];
  }
  return RANK_LEVELS[0];
}

export function getNextRankLevel(current: RankLevel): RankLevel | null {
  const next = RANK_LEVELS.find(r => r.level === current.level + 1);
  return next ?? null;
}

// ─── Noise Config ─────────────────────────────────────────────────────────────

export interface NoiseConfig {
  key:   NoiseChannel;
  label: string;
  icon:  string;  // emoji (server-safe)
}

export const NOISE_CONFIG: NoiseConfig[] = [
  { key:"rain",       label:"مطر خفيف", icon:"🌧" },
  { key:"heavy_rain", label:"مطر غزير", icon:"⛈" },
  { key:"train",      label:"قطار",     icon:"🚆" },
  { key:"cafe",       label:"مقهى",     icon:"☕" },
  { key:"ac",         label:"تكييف",    icon:"❄" },
  { key:"fire",       label:"نار",      icon:"🔥" },
  { key:"ocean",      label:"أمواج",    icon:"🌊" },
  { key:"wind",       label:"هواء",     icon:"💨" },
  { key:"birds",      label:"طيور",     icon:"🐦" },
];

// ─── Mode Config ─────────────────────────────────────────────────────────────

export const DURATIONS: Record<PomodoroMode, number> = {
  focus: 25 * 60,
  short: 5  * 60,
  long:  15 * 60,
};

export const MODE_LABELS: Record<PomodoroMode, string> = {
  focus: "تركيز",
  short: "استراحة قصيرة",
  long:  "استراحة طويلة",
};

export const MODE_COLORS: Record<PomodoroMode, string> = {
  focus: "#0B3D2E",
  short: "#10b981",
  long:  "#C8A762",
};

export const MIN_SAVE_DURATION = 5; // minutes
