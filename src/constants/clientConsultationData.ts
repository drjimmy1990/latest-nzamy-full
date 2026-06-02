import { Buildings, VideoCamera, Phone, ChatsCircle } from "@phosphor-icons/react";

export type ConsultPath = "ai" | "lawyer";
export type LawyerMode = "video" | "in-person" | "text" | "voice";

export const MODE_COPY = {
  "in-person": { label: "حضورية",         Icon: Buildings,    serviceId: "in-person", desc: "في مكتب المحامي" },
  video:        { label: "مرئية (أونلاين)", Icon: VideoCamera,  serviceId: "video-full", desc: "فيديو عبر الإنترنت" },
  voice:        { label: "صوتية (أونلاين)", Icon: Phone,        serviceId: "video-full", desc: "مكالمة عبر الإنترنت" },
  text:         { label: "كتابية",          Icon: ChatsCircle,  serviceId: "written-opinion", desc: "رد خلال 48 ساعة" },
} as const;

export const IS_BETA = true; // Beta flag — system assigns lawyer, client cannot choose

export const STEP_LABELS = ["نوع الاستشارة", "التفاصيل", "التأكيد والدفع"];
