import { mm, type Millimeters } from "@/engine";

/**
 * Millimetres are canonical everywhere in the engine; this is display only.
 * Glass is specified in metric even on US cutsheets (6mm lite, 12mm airspace),
 * but sheets quoting inches do exist, hence the toggle.
 */
export type DisplayUnit = "mm" | "in";

const MM_PER_INCH = 25.4;

export function toDisplay(value: Millimeters, unit: DisplayUnit): number {
  return unit === "mm" ? value : value / MM_PER_INCH;
}

export function fromDisplay(value: number, unit: DisplayUnit): Millimeters {
  return mm(unit === "mm" ? value : value * MM_PER_INCH);
}

export function formatLength(value: Millimeters, unit: DisplayUnit): string {
  const display = toDisplay(value, unit);
  return unit === "mm" ? `${round(display, 2)}mm` : `${round(display, 3)}"`;
}

export function unitLabel(unit: DisplayUnit): string {
  return unit === "mm" ? "mm" : "in";
}

/** Sensible input step for each unit. */
export function unitStep(unit: DisplayUnit): number {
  return unit === "mm" ? 0.5 : 0.03125; // 1/32"
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
