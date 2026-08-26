"use client";

import { useId, useState, type ReactNode } from "react";

const inputClass =
  "w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted/80">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * A number input that lets you type freely.
 *
 * Editing is tracked as text so intermediate states ("0.", "", "-") survive
 * keystrokes instead of being rewritten mid-word, and the committed value is
 * pushed up only when it actually parses.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
}) {
  // While focused the raw text is authoritative, so half-typed values like
  // "0." or "" survive keystrokes. Unfocused, the committed value is shown.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="relative">
      <input
        type="number"
        className={`${inputClass} ${suffix ? "pr-10" : ""} tabular-nums`}
        value={draft ?? String(round(value))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onFocus={(event) => setDraft(event.target.value)}
        onBlur={() => setDraft(null)}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = Number.parseFloat(event.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

/** Percent in the UI, fraction in the model. */
export function PercentInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (fraction: number) => void;
  disabled?: boolean;
}) {
  return (
    <NumberInput
      value={value * 100}
      onChange={(percent) => onChange(percent / 100)}
      min={0}
      max={100}
      step={0.5}
      suffix="%"
      disabled={disabled}
    />
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      type="text"
      className={inputClass}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      className={inputClass}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; title?: string }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-border-subtle bg-surface-sunken p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              selected
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ColorInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="color"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-10 cursor-pointer rounded border border-border-subtle bg-surface p-0.5 disabled:opacity-50"
      />
      <code className="font-mono text-xs uppercase text-muted">{value}</code>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm text-foreground"
    >
      <span
        className={`relative h-5 w-9 rounded-full transition ${
          checked ? "bg-accent" : "bg-border-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-4.5" : "left-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

export function Section({
  id,
  title,
  description,
  children,
  action,
}: {
  /** Anchor for the diagram panel's jump-to-card scrolling. */
  id?: string;
  title: ReactNode;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-lg border border-border-subtle bg-surface p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * A collapsible row for the fine-tuning group.
 *
 * The closed state has to carry enough that most people never open it: a
 * leading visual (swatches), a plain-language description, and a summary of
 * the current state on the right.
 */
export function DisclosureRow({
  title,
  description,
  summary,
  leading,
  open,
  onToggle,
  children,
}: {
  title: string;
  description?: string;
  summary?: string;
  leading?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border-subtle">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground">{title}</p>
            {description ? <p className="mt-0.5 text-xs leading-snug text-muted">{description}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {summary ? <span className="text-xs text-muted/80">{summary}</span> : null}
          <svg
            viewBox="0 0 14 14"
            className={`h-3.5 w-3.5 text-muted transition-transform ${open ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden
          >
            <path d="M5 3.5 L9 7 L5 10.5" />
          </svg>
        </div>
      </button>
      {open && children ? (
        <div className="border-t border-border-subtle px-3.5 py-3">{children}</div>
      ) : null}
    </div>
  );
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
