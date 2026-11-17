"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * A small WAI-ARIA tablist for the /founder page (the two memos, the
 * professional tools). Roving tabindex; in this RTL page ArrowLeft moves to
 * the next tab and ArrowRight to the previous one; Home/End jump.
 */
export interface TabItem {
  id: string;
  label: string;
  panel: ReactNode;
}

export function Tabs({
  items,
  label,
  tone = "light",
  onChange,
}: {
  items: readonly TabItem[];
  label: string;
  tone?: "light" | "dark";
  onChange?: (id: string) => void;
}) {
  const [active, setActive] = useState(items[0]?.id);
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (i: number) => {
    const item = items[(i + items.length) % items.length];
    setActive(item.id);
    onChange?.(item.id);
    refs.current[(i + items.length) % items.length]?.focus();
  };

  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === "ArrowLeft") select(i + 1);
    else if (e.key === "ArrowRight") select(i - 1);
    else if (e.key === "Home") select(0);
    else if (e.key === "End") select(items.length - 1);
    else return;
    e.preventDefault();
  };

  const tabClass = (on: boolean) =>
    tone === "dark"
      ? `min-h-[44px] rounded-full border px-[18px] py-2 text-sm motion-safe:transition ${
          on ? "border-[#C8A762] bg-[#C8A762] font-bold text-[#2A1F07]" : "border-white/30 bg-transparent text-[#F2F5F1]"
        }`
      : `min-h-[44px] rounded-full border-[1.5px] px-[18px] py-2 text-sm motion-safe:transition ${
          on ? "border-[#0B3D2E] bg-[#0B3D2E] font-bold text-white" : "border-[#D9E1DB] bg-white text-[#14261F]"
        }`;

  return (
    <div>
      <div role="tablist" aria-label={label} className="mb-5 flex flex-wrap gap-2.5">
        {items.map((item, i) => {
          const on = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.id}`}
              aria-selected={on}
              aria-controls={`${base}-panel-${item.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={tabClass(on)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${base}-panel-${item.id}`}
          aria-labelledby={`${base}-tab-${item.id}`}
          hidden={item.id !== active}
        >
          {item.panel}
        </div>
      ))}
    </div>
  );
}
