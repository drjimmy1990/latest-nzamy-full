import { type ReactNode } from "react";

type Padding = "none" | "sm" | "md" | "lg";

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: Padding;
  isDark?: boolean;
  hover?: boolean;
}

const paddingClasses: Record<Padding, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export default function Card({
  children,
  className = "",
  padding = "md",
  isDark = false,
  hover = false,
}: CardProps) {
  return (
    <div
      className={[
        "rounded-2xl border",
        isDark ? "bg-[#161b22] border-white/10" : "bg-white border-gray-200",
        paddingClasses[padding],
        hover ? "transition-shadow hover:shadow-lg" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
