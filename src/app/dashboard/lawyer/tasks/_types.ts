// ─── Types ────────────────────────────────────────────────────────────────────

export type Priority = "urgent" | "high" | "normal" | "low";
export type TaskStatus = "todo" | "in_progress" | "done" | "archived";
export type TaskCategory = "case" | "document" | "admin" | "deadline" | "client";
export type ViewMode = "list" | "kanban";
export type TimeRange = "all" | "today" | "week" | "month" | "quarter" | "year";
export type KanbanGroupBy = "status" | "priority" | "category" | "due";

export interface Task {
  id: string;
  title: string;
  category: TaskCategory;
  priority: Priority;
  status: TaskStatus;
  due?: string;
  dueDate?: string;
  caseRef?: string;
  caseId?: string;
  assignedTo?: string;
  /** «المحامي المُكلَّف» (owner item 59): tasks.assignee_user_id resolved to a name by the route. Undefined = none. */
  assigneeName?: string;
  ownerId?: string;   // undefined = mine; set to team member id = team task
  notes?: string;
  subtasks?: { id: string; title: string; done: boolean }[];
  timeTracked?: number;
}
