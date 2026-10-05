"use client";

import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";

export interface TabItem<Key extends string> {
  key: Key;
  label: string;
  /** Small text after the label, e.g. a count or "on". */
  badge?: string | null;
}

interface TabsProps<Key extends string> {
  label: string;
  items: TabItem<Key>[];
  active: Key;
  onChange: (key: Key) => void;
  variant?: "underline" | "pill";
  children: ReactNode;
}

/** Accessible tab list (arrow keys move between tabs) with a single panel. */
export function Tabs<Key extends string>({ label, items, active, onChange, variant = "underline", children }: TabsProps<Key>) {
  const baseId = useId();
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.key === active);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    const target = items[next]!;
    onChange(target.key);
    buttons.current[target.key]?.focus();
  }

  return (
    <div className={`tabs tabs--${variant}`}>
      <div className="tabs__list" role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
        {items.map((item) => (
          <button
            key={item.key}
            ref={(element) => {
              buttons.current[item.key] = element;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.key}`}
            aria-selected={item.key === active}
            aria-controls={`${baseId}-panel`}
            tabIndex={item.key === active ? 0 : -1}
            className="tabs__tab"
            onClick={() => onChange(item.key)}
          >
            {item.label}
            {item.badge ? <span className="tabs__badge">{item.badge}</span> : null}
          </button>
        ))}
      </div>
      <div className="tabs__panel" role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${active}`}>
        {children}
      </div>
    </div>
  );
}
