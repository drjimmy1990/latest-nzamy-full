import { type ReactNode } from "react";

type BadgeVariant = "green" | "gold" | "red" | "gray" | "blue" | "amber";
type BadgeSize = "sm" | "md";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  green:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  gold: "bg-[#C8A762]/15 text-[#C8A762]",
  red: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  gray: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  amber:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: "text-[10px] px-2 py-0.5 rounded-full font-semibold",
  md: "text-xs px-3 py-1 rounded-full font-semibold",
};

export default function Badge({
  children,
  variant = "green",
  size = "md",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
