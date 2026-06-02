// ─── Types ───────────────────────────────────────────────────────────────────

export type ServiceCategory =
  | "all"
  | "taqeeb"       // تعقيب دوائر
  | "tawtheeq"     // توثيق / وكالة
  | "drafting"     // صياغة قانونية / مذكرة
  | "arbitration"  // تحكيم
  | "translation"  // ترجمة قانونية
  | "consultation" // استشارة متخصصة
  | "court-rep";   // تمثيل قضائي في دائرة

export type RequestStatus = "open" | "in-progress" | "completed" | "cancelled";
export type MainTab = "my-requests" | "browse" | "post-request";

export interface ServiceRequest {
  id: number;
  category: ServiceCategory;
  title: string;
  description: string;
  city: string;
  urgency: "urgent" | "normal" | "flexible";
  budgetMin: number;
  budgetMax: number;
  postedBy: string;
  postedByType: "lawyer" | "firm" | "corporate" | "micro" | "individual";
  postedAt: string;
  status: RequestStatus;
  offersCount: number;
  views: number;
  isVerified: boolean;
  tags: string[];
  requiredSpecialties: ServiceCategory[];
}

export interface ProviderOffer {
  id: number;
  requestId: number;
  requestTitle: string;
  requestCategory: ServiceCategory;
  requesterName: string;
  requesterType: "lawyer" | "firm" | "corporate" | "micro" | "individual";
  city: string;
  offerAmount: number;
  message: string;
  submittedAt: string;
  status: "pending" | "accepted" | "rejected" | "in-progress" | "completed";
  requestUrgency: "urgent" | "normal" | "flexible";
}
