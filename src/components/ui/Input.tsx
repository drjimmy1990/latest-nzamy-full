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
            isDark ? "text-gray-200" : "text-gray-700",
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
            ? "bg-[#161b22] border-white/10 text-white focus:border-[#C8A762]"
            : "bg-white border-gray-200 text-gray-800 focus:border-[#0B3D2E] focus:ring-2 focus:ring-[#0B3D2E]/10",
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
