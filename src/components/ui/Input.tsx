"use client";
import { type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  isDark?: boolean;
  fullWidth?: boolean;
}

export default function Input({
  label,
  error,
  isDark = false,
  fullWidth = false,
  className = "",
  id,
  ...rest
}: InputProps) {
  const inputId = id ?? (label ? label.replace(/\s+/g, "-").toLowerCase() : undefined);

  return (
    <div className={fullWidth ? "w-full" : ""}>
      {label && (
        <label
          htmlFor={inputId}
          className={[
            "block text-sm font-semibold mb-1.5",
            isDark ? "text-gray-200" : "text-gray-700 dark:text-zinc-200",
          ].join(" ")}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={[
          "rounded-xl px-4 py-3 border text-sm outline-none transition-colors",
          fullWidth ? "w-full" : "",
          isDark
            ? "bg-[#161b22] border-white/10 text-white focus:border-[#C8A762] focus-visible:ring-2 focus-visible:ring-gold"
            : "bg-white dark:bg-[#161b22] border-gray-200 dark:border-white/10 text-gray-800 dark:text-zinc-100 focus:border-[#0B3D2E] dark:focus:border-gold focus:ring-2 focus:ring-[#0B3D2E]/10 dark:focus:ring-gold/20 focus-visible:ring-2 focus-visible:ring-royal dark:focus-visible:ring-gold",
          error
            ? "border-red-400 focus:border-red-400"
            : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
      {error && (
        <p className="mt-1.5 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
