"use client";

import { useSyncExternalStore, type ReactNode } from "react";

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

/* Drawn by hand at 14px with currentColor: the Unicode glyphs (☀ ☾ ◐) take
   emoji presentation in mobile browsers, and the VS15 text selector is
   ignored by some Android emoji fonts, so glyphs cannot render reliably
   monochrome. Stroke style matches VerdictChip's inline icons. */
function SunIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="block h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="8" cy="8" r="3.25" />
      <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" className="block h-3.5 w-3.5" aria-hidden>
      <path d="M13.2 9.7A5.6 5.6 0 0 1 6.3 2.8a5.6 5.6 0 1 0 6.9 6.9Z" fill="currentColor" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 16 16" className="block h-3.5 w-3.5" aria-hidden>
      <circle cx="8" cy="8" r="5.75" fill="none" stroke="currentColor" strokeWidth={1.25} />
      <path d="M8 2.25a5.75 5.75 0 0 1 0 11.5Z" fill="currentColor" />
    </svg>
  );
}

const OPTIONS: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
  { value: "system", label: "System", icon: <SystemIcon /> },
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
            {option.icon}
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
