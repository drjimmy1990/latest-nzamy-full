import { Metadata } from "next";

export const metadata: Metadata = {
  // N06-23: one name for /ai/assistant everywhere — «المساعد المتقدم», as in the sidebar.
  title: "المساعد المتقدم — نظامي",
  description: "المساعد المتقدم في نظامي: محادثة قانونية تجيب من نصوص الأنظمة ومبادئ القضاء في مكتبة نظامي، مع رابط كل نص.",
};

export default function AssistantLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
