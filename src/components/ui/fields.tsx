"use client";

import { useId, useState, type ReactNode } from "react";

const inputClass =
  "h-10 w-full rounded-lg border border-border-strong/70 bg-background px-3 text-[15px] text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50";

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
      <span className="text-[13px] font-medium text-muted">{label}</span>
      {children}
      {error ? (
        <span className="text-[13px] text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[13px] leading-snug text-muted">{hint}</span>
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
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  // While focused the raw text is authoritative, so half-typed values like
  // "0." or "" survive keystrokes. Unfocused, the committed value is shown.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="relative">
      <input
        type="number"
        className={`${inputClass} ${suffix ? "pr-10" : ""} font-mono tabular-nums`}
        aria-label={ariaLabel}
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
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-muted">
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
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <select
      className={inputClass}
      aria-label={ariaLabel}
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

/**
 * The standard card action: a real, visibly-accented button. `active` marks
 * an open panel (the button then reads "Done"); `danger` is for Remove.
 */
export function ActionButton({
  onClick,
  active = false,
  danger = false,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  const styles = danger
    ? "border-border-strong text-muted hover:border-danger hover:text-danger"
    : active
      ? "border-accent bg-accent text-white hover:opacity-90"
      : "border-border-strong text-foreground hover:border-accent hover:text-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 shrink-0 rounded-lg border px-3 text-[13px] font-medium transition ${styles}`}
    >
      {children}
    </button>
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
      className="inline-flex max-w-full flex-wrap rounded-[10px] border border-border-strong/70 bg-background p-[3px]"
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
            className={`h-9 rounded-[7px] px-3.5 text-sm transition ${
              selected
                ? "bg-accent font-semibold text-white shadow-sm"
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
        className="h-10 w-12 cursor-pointer rounded-lg border border-border-strong/70 bg-background p-1 disabled:opacity-50"
      />
      <code className="font-mono text-sm uppercase text-muted">{value}</code>
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

/** The round "?" that opens a panel's explanation. */
export function HelpButton({
  open,
  onToggle,
  label,
  small = false,
}: {
  open: boolean;
  onToggle: () => void;
  /** What the help is about, e.g. "data sheet values". */
  label: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} help for ${label}`}
      onClick={onToggle}
      className={`${small ? "h-7 w-7 text-[13px]" : "h-8 w-8 text-sm"} shrink-0 rounded-full border transition ${
        open
          ? "border-accent bg-accent-soft text-accent"
          : "border-border-strong/70 text-muted hover:border-accent hover:text-accent"
      }`}
    >
      ?
    </button>
  );
}

/** The explanation a HelpButton reveals. */
export function HelpNote({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-[10px] bg-surface-sunken px-3.5 py-3 text-sm leading-snug text-muted">
      {children}
    </div>
  );
}

/**
 * Explanations stay one click away instead of sitting on the page: the form
 * is used far more often than it is read.
 */
export function useHelp(label: string, small = false) {
  const [open, setOpen] = useState(false);
  return {
    open,
    button: <HelpButton open={open} onToggle={() => setOpen(!open)} label={label} small={small} />,
    note: (children: ReactNode) => (open ? <HelpNote>{children}</HelpNote> : null),
  };
}

export function Section({
  id,
  title,
  help,
  helpLabel,
  children,
  action,
}: {
  /** Anchor for the diagram panel's jump-to-card scrolling. */
  id?: string;
  title: ReactNode;
  /** Shown behind the "?" button. */
  help?: ReactNode;
  helpLabel?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <section
      id={id}
      className="scroll-mt-32 rounded-xl border border-border-subtle bg-surface p-4 lg:scroll-mt-4 lg:rounded-none lg:border-0 lg:border-t lg:bg-transparent lg:p-0 lg:pt-6 lg:first:border-t-0 lg:first:pt-0"
    >
      <header className="mb-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-[17px] font-semibold text-foreground">{title}</h2>
        <div className="flex items-center gap-2.5">
          {action}
          {help ? (
            <HelpButton
              open={helpOpen}
              onToggle={() => setHelpOpen(!helpOpen)}
              label={helpLabel ?? "this step"}
            />
          ) : null}
        </div>
      </header>
      {help && helpOpen ? (
        <div className="mb-3.5">
          <HelpNote>{help}</HelpNote>
        </div>
      ) : null}
      {children}
    </section>
  );
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
