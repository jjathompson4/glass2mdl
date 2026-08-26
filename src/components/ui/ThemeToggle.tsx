"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "glass2mdl-theme";
const EVENT = "glass2mdl-themechange";

/**
 * Theme choice, kept in localStorage rather than React state.
 *
 * The stored value is read before paint by a script in the document head, so
 * the page never flashes the wrong theme. Treating that store as the source of
 * truth through useSyncExternalStore keeps the two in agreement without an
 * effect that would set state on mount.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Private browsing can refuse storage; the OS setting still applies.
  }
  return "system";
}

/** The server cannot know the choice, so it renders the neutral default. */
const getServerSnapshot = (): Theme => "system";

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;

  try {
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Choice still applies for this page view even if it cannot be persisted.
  }
  window.dispatchEvent(new Event(EVENT));
}

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
  { value: "system", label: "System", icon: "◐" },
];

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex rounded-md border border-border-subtle bg-surface-sunken p-0.5"
    >
      {OPTIONS.map((option) => {
        const selected = option.value === theme;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => applyTheme(option.value)}
            className={`rounded px-2 py-1 text-xs leading-none transition ${
              selected ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            <span aria-hidden>{option.icon}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Runs before first paint to avoid a flash of the wrong theme. Kept in sync
 * with the storage key above by hand — it cannot import from this module.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
