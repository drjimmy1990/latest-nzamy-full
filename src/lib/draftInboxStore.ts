// ─── draftInboxStore — Session-based Research Collector ─────────────────────
// Architecture:
//   "desktop" = shared public space (team-visible, no expiry)
//   "session" = named private session (auto-archived after 7 days)
//
// Consumers: Collector page, StepLaws (Drafter), wargame, direction-support

// ─── Types ────────────────────────────────────────────────────────────────────

export type InboxSource =
  | "direction-support"   // داعم الاتجاه
  | "wargame"             // محاكي الخصم
  | "legal-library"       // المكتبة القانونية
  | "case-brief"          // محلّل الملف
  | "research"            // بحث قانوني
  | "legal-opinion"       // الرأي الفصل
  | "study"               // دراسة قانونية
  | "attachment-squeezer" // عصارة المرفقات
  | "manual"              // إضافة يدوية
  | "other";

export type InboxItemType =
  | "text"       // نص نظامي
  | "precedent"  // سابقة / مبدأ قضائي
  | "case"       // وقائع قضية
  | "principle"  // قاعدة فقهية
  | "argument"   // حجة / موقف
  | "summary"    // ملخص / توصية
  | "research";  // نتيجة بحث

export type CollectorSpace = "desktop" | "session";

export interface CollectorSession {
  id: string;
  name: string;           // user-provided name (or auto "جلسة DD/MM")
  createdAt: string;      // ISO
  isArchived: boolean;
  archivedAt?: string;    // ISO — set when manually or auto archived
}

export interface InboxItem {
  id:        string;
  space:     CollectorSpace;
  sessionId?: string;      // required when space === "session"
  source:    InboxSource;
  type:      InboxItemType;
  title:     string;
  content:   string;
  sentAt:    string;       // ISO
  used:      boolean;
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const ITEMS_KEY    = "nzamy_collector_items";
const SESSIONS_KEY = "nzamy_collector_sessions";

// ─── Raw I/O ──────────────────────────────────────────────────────────────────

function readItems(): InboxItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(ITEMS_KEY) ?? "[]"); } catch { return []; }
}
function writeItems(items: InboxItem[]) {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

function readSessions(): CollectorSession[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]"); } catch { return []; }
}
function writeSessions(sessions: CollectorSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

// ─── Auto-archive helper (7 days) ─────────────────────────────────────────────

const ARCHIVE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export function runAutoArchive() {
  const sessions = readSessions();
  const now = Date.now();
  let changed = false;
  const updated = sessions.map(s => {
    if (!s.isArchived && now - new Date(s.createdAt).getTime() > ARCHIVE_AFTER_MS) {
      changed = true;
      return { ...s, isArchived: true, archivedAt: new Date().toISOString() };
    }
    return s;
  });
  if (changed) writeSessions(updated);
}

// ─── Session API ──────────────────────────────────────────────────────────────

/** Create a new session. Returns its id. */
export function createSession(name?: string): CollectorSession {
  const now = new Date();
  const defaultName = `جلسة ${now.toLocaleDateString("ar-SA", { day: "2-digit", month: "2-digit" })}`;
  const session: CollectorSession = {
    id: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    name: name?.trim() || defaultName,
    createdAt: now.toISOString(),
    isArchived: false,
  };
  writeSessions([...readSessions(), session]);
  return session;
}

/** Get all active (non-archived) sessions, newest first */
export function getActiveSessions(): CollectorSession[] {
  runAutoArchive();
  return readSessions()
    .filter(s => !s.isArchived)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Get archived sessions, newest first */
export function getArchivedSessions(): CollectorSession[] {
  runAutoArchive();
  return readSessions()
    .filter(s => s.isArchived)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Rename a session */
export function renameSession(sessionId: string, name: string) {
  writeSessions(readSessions().map(s => s.id === sessionId ? { ...s, name } : s));
}

/** Manually archive a session */
export function archiveSession(sessionId: string) {
  writeSessions(readSessions().map(s =>
    s.id === sessionId
      ? { ...s, isArchived: true, archivedAt: new Date().toISOString() }
      : s
  ));
}

/** Restore an archived session */
export function restoreSession(sessionId: string) {
  writeSessions(readSessions().map(s =>
    s.id === sessionId ? { ...s, isArchived: false, archivedAt: undefined } : s
  ));
}

/** Delete a session AND all its items */
export function deleteSession(sessionId: string) {
  writeSessions(readSessions().filter(s => s.id !== sessionId));
  writeItems(readItems().filter(i => i.sessionId !== sessionId));
}

// ─── Item API ─────────────────────────────────────────────────────────────────

/** Add an item to the desktop */
export function addToDesktop(
  source:  InboxSource,
  type:    InboxItemType,
  title:   string,
  content: string,
): InboxItem {
  return _addItem({ space: "desktop", source, type, title, content });
}

/** Add an item to a specific session */
export function addToSession(
  sessionId: string,
  source:    InboxSource,
  type:      InboxItemType,
  title:     string,
  content:   string,
): InboxItem {
  return _addItem({ space: "session", sessionId, source, type, title, content });
}

/**
 * Legacy compat: addToInbox → goes to desktop by default.
 * Callers that now target a session should use addToSession directly.
 */
export function addToInbox(
  source:  InboxSource,
  type:    InboxItemType,
  title:   string,
  content: string,
  opts?: { sessionId?: string },
): InboxItem {
  if (opts?.sessionId) {
    return _addItem({ space: "session", sessionId: opts.sessionId, source, type, title, content });
  }
  return addToDesktop(source, type, title, content);
}

function _addItem(
  partial: Omit<InboxItem, "id" | "sentAt" | "used">
): InboxItem {
  const item: InboxItem = {
    ...partial,
    id:    `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sentAt: new Date().toISOString(),
    used:   false,
  };
  const all = readItems();
  const trimmed = all.length >= 500 ? all.slice(-499) : all;
  writeItems([...trimmed, item]);
  return item;
}

/** Get all desktop items, newest first */
export function getDesktopItems(): InboxItem[] {
  return readItems()
    .filter(i => i.space === "desktop")
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
}

/** Get items for a specific session, newest first */
export function getSessionItems(sessionId: string): InboxItem[] {
  return readItems()
    .filter(i => i.space === "session" && i.sessionId === sessionId)
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
}

/** Legacy compat: getInbox → all items newest first */
export function getInbox(): InboxItem[] {
  return readItems().sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
}

export function getUnused(): InboxItem[] {
  return getInbox().filter(i => !i.used);
}

export function getUnusedCount(): number {
  return getUnused().length;
}

/** Desktop unread count (for badge) */
export function getDesktopUnusedCount(): number {
  return getDesktopItems().filter(i => !i.used).length;
}

export function markUsed(ids: string[]) {
  writeItems(readItems().map(i => ids.includes(i.id) ? { ...i, used: true } : i));
}

export function removeFromInbox(id: string) {
  writeItems(readItems().filter(i => i.id !== id));
}

export function updateItem(id: string, title: string, content: string) {
  writeItems(readItems().map(i => i.id === id ? { ...i, title, content } : i));
}


export function clearBySource(source: InboxSource) {
  writeItems(readItems().filter(i => i.source !== source));
}

export function clearDesktop() {
  writeItems(readItems().filter(i => i.space !== "desktop"));
}

export function clearAll() {
  writeItems([]);
  writeSessions([]);
}

/**
 * Merge selected items into one item on the desktop.
 * Original items are removed.
 */
export function mergeItems(ids: string[], mergedTitle: string, targetSpace: CollectorSpace = "desktop", targetSession?: string): InboxItem {
  const all = readItems();
  const toMerge = all.filter(i => ids.includes(i.id));
  const remaining = all.filter(i => !ids.includes(i.id));
  const mergedContent = toMerge.map(i => `• ${i.title}\n${i.content}`).join("\n\n");
  const merged: InboxItem = {
    id:        `${Date.now()}-merged`,
    space:     targetSpace,
    sessionId: targetSpace === "session" ? targetSession : undefined,
    source:    "manual",
    type:      "text",
    title:     mergedTitle,
    content:   mergedContent,
    sentAt:    new Date().toISOString(),
    used:      false,
  };
  writeItems([...remaining, merged]);
  return merged;
}

// ─── Display metadata ────────────────────────────────────────────────────────

export const SOURCE_LABELS: Record<InboxSource, string> = {
  "direction-support":  "داعم الاتجاه",
  "wargame":            "محاكي الخصم",
  "legal-library":      "المكتبة القانونية",
  "case-brief":         "محلّل الملف",
  "research":           "بحث قانوني",
  "legal-opinion":      "الرأي الفصل",
  "study":              "دراسة قانونية",
  "attachment-squeezer":"عصارة المرفقات",
  "manual":             "إضافة يدوية",
  "other":              "أداة أخرى",
};

export const SOURCE_COLORS: Record<InboxSource, string> = {
  "direction-support":  "teal",
  "wargame":            "red",
  "legal-library":      "blue",
  "case-brief":         "amber",
  "research":           "purple",
  "legal-opinion":      "indigo",
  "study":              "violet",
  "attachment-squeezer":"orange",
  "manual":             "zinc",
  "other":              "slate",
};

export const SOURCE_ICONS: Record<InboxSource, string> = {
  "direction-support":  "Compass",
  "wargame":            "Sword",
  "legal-library":      "BookOpen",
  "case-brief":         "Scan",
  "research":           "MagnifyingGlass",
  "legal-opinion":      "Brain",
  "study":              "Student",
  "attachment-squeezer":"FunnelSimple",
  "manual":             "PencilSimple",
  "other":              "Package",
};

// ─── Legacy alias ─────────────────────────────────────────────────────────────
/** @deprecated use addToDesktop or addToSession */
export function getAllGroupedBySource(): Record<string, InboxItem[]> {
  const all = getInbox();
  const grouped: Record<string, InboxItem[]> = {};
  for (const item of all) {
    if (!grouped[item.source]) grouped[item.source] = [];
    grouped[item.source].push(item);
  }
  return grouped;
}
