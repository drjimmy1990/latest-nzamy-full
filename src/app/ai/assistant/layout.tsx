import { Metadata } from "next";

export const metadata: Metadata = {
  title: "نظامي أسيستنت — مساعدك القانوني الذكي",
  description: "تحدث مع نظامي أسيستنت — مساعد قانوني ذكي يجيبك على أسئلتك القانونية، يساعد في الصياغة، البحث، والاستراتيجية القانونية",
};

export default function AssistantLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
