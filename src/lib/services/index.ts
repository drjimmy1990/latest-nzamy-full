/**
 * services/index.ts — Barrel export for all dual-mode services
 */

export { isSupabaseMode, apiGet, apiMutate, dualMode, strictDualMode } from "./api";

// Notification service
export {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  TYPE_ICONS,
  SEVERITY_COLOR,
} from "./notificationService";

// Community service
export {
  getCommunityPosts,
  getCommunityPost,
  createCommunityPost,
  addCommunityAnswer,
  voteCommunityPost,
} from "./communityService";

// Group service
export {
  getGroupState,
  getGroups,
  createGroup,
  getGroupMembers,
  inviteToGroup,
  removeGroupMember,
  leaveGroup,
} from "./groupService";

// Cases service
export {
  getCases,
  getActiveCases,
  getCaseDetail,
  getConsultations,
  createConsultation,
  updateConsultation,
  getCaseTypeLabel,
} from "./casesService";

// Chat service
export {
  getChatRooms,
  createChatRoom,
  getChatMessages,
  sendChatMessage,
} from "./chatService";

// Research service
export {
  createSession,
  getActiveSessions,
  getArchivedSessions,
  renameSession,
  archiveSession,
  restoreSession,
  deleteSession,
  addToDesktop,
  addToSession,
  addToInbox,
  getDesktopItems,
  getSessionItems,
  getInbox,
  getUnused,
  getUnusedCount,
  getDesktopUnusedCount,
  markUsed,
  removeFromInbox,
  updateItem,
  clearBySource,
  clearDesktop,
  clearAll,
  mergeItems,
  SOURCE_LABELS,
  SOURCE_COLORS,
  SOURCE_ICONS,
} from "./researchService";

// Workflow service
export {
  getWorkflowRequests,
  getWorkflowRequestsByReceiver,
  createWorkflowRequest,
  updateWorkflowRequestById,
} from "./workflowService";

// Lawyer service
export { getLawyers, getLawyerById } from "./lawyerService";
export type { LawyerProfile, LawyerFilters } from "./lawyerService";

// Document service
export { getDocuments, uploadDocument } from "./documentService";
export type { Document, DocumentInput } from "./documentService";

// Dashboard service
export { getDashboardSummary } from "./dashboardService";
export type { DashboardSummary, SubscriptionSummary } from "./dashboardService";

// Lawyer Dashboard service
export { getLawyerDashboardSummary } from "./lawyerDashboardService";
export type { LawyerDashboardSummary } from "./lawyerDashboardService";

// Lawyer Clients service
export { getLawyerClients } from "./lawyerClientsService";
export type { LawyerClient } from "./lawyerClientsService";

// Lawyer Tasks service
export { getLawyerTasks, updateLawyerTaskStatus } from "./lawyerTasksService";
export type { LawyerTask } from "./lawyerTasksService";

// Lawyer Activity service
export { getLawyerActivity } from "./lawyerActivityService";
export type { LawyerActivity } from "./lawyerActivityService";

// Admin service
export {
  getVerificationRequests,
  approveVerification,
  rejectVerification,
} from "./adminService";
export type {
  VerificationRequest,
  VerificationFilters,
  ProviderType,
  VerificationDisplayStatus,
} from "./adminService";
