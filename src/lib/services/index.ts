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
