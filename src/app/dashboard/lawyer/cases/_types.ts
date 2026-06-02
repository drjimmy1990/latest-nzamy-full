// ─── Lawyer Cases — Shared Types ────────────────────────────────────────────
// Extracted from page.tsx (PR-7 decomposition)

export type CaseStatus   = "active" | "pending" | "suspended" | "closed" | "archived";
export type CaseType     = "commercial" | "labor" | "civil" | "criminal" | "family" | "real_estate" | "admin";
export type CourtDegree  = "primary" | "appeal" | "supreme" | "admin" | "labor" | "criminal";
export type Priority     = "critical" | "high" | "normal" | "low";
export type KanbanCol    = "new" | "docs_prep" | "hearing" | "appeal" | "closed";
export type CollabFilter = "all" | "solo" | "shared" | "team";
export type ViewMode     = "list" | "kanban" | "archive";
export type KanbanGroupBy = "status" | "degree" | "priority" | "team";

export interface Case {
  id:            string;
  title:         string;
  client:        string;
  court:         string;
  type:          CaseType;
  status:        CaseStatus;
  priority:      Priority;
  nextDate?:     string;
  nextDateSort?: number;
  filedDate:     string;
  degree:        CourtDegree;
  stage:         string;
  kanbanCol:     KanbanCol;
  team:          string[];
  hasDeadline?:  boolean;
  value?:        string;
  lastActivity?: string;
  tags?:         string[];
  collab:        "solo" | "shared" | "team";
}
