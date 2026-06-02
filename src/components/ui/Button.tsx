"use client";
import { motion } from "framer-motion";
import { type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-[#0B3D2E] text-white hover:bg-[#0a3328]",
  secondary:
    "border border-[#0B3D2E]/30 text-[#0B3D2E] hover:bg-[#0B3D2E]/5 dark:border-white/20 dark:text-white",
  ghost:
    "text-[#0B3D2E] hover:bg-[#0B3D2E]/5 dark:text-gray-300 dark:hover:bg-white/5",
  danger: "bg-red-600 text-white hover:bg-red-700",
  gold: "bg-[#C8A762] text-[#0B3D2E] hover:bg-[#b8974f] font-bold",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-5 py-2.5 text-sm rounded-xl",
  lg: "px-7 py-3.5 text-base rounded-2xl",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  fullWidth = false,
  onClick,
  type = "button",
  className = "",
}: ButtonProps) {
  const isInert = disabled || loading;

  return (
    <motion.button
      type={type}
      onClick={!isInert ? onClick : undefined}
      whileHover={{ scale: isInert ? 1 : 1.02 }}
      whileTap={{ scale: isInert ? 1 : 0.98 }}
      className={[
        "inline-flex items-center justify-center gap-2 font-semibold transition-colors focus:outline-none",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? "w-full" : "",
        isInert ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={isInert}
    >
      {loading ? (
        <>
          <span
            className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
            aria-hidden="true"
          />
          <span>جارٍ التحميل...</span>
        </>
      ) : (
        children
      )}
    </motion.button>
  );
}
