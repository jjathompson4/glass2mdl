"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import {
  fraction,
  hexToLinearRGB,
  linearRGBToHex,
  patternCoverage,
  type FritPattern,
  type SurfaceNumber,
} from "@/engine";
import { useAppStore } from "@/lib/store";
import { readTextureFile } from "@/lib/textureUpload";
import { surfaceOptions } from "@/lib/surfaces";
import { fromDisplay, toDisplay, unitLabel, unitStep } from "@/lib/units";
import {
  ColorInput,
  Field,
  NumberInput,
  PercentInput,
  SegmentedControl,
  Select,
} from "@/components/ui/fields";

type PatternKind = FritPattern["kind"];

/** The frit card's body. On/off lives with the card's Add and Remove. */
export function FritControls() {
  const frit = useAppStore((s) => s.system.frit);
  const lites = useAppStore((s) => s.system.lites);
  const unit = useAppStore((s) => s.unit);
  const uploadedMask = useAppStore((s) => s.uploadedMask);
  const updateFrit = useAppStore((s) => s.updateFrit);
  const setFritPattern = useAppStore((s) => s.setFritPattern);
  const setUploadedMask = useAppStore((s) => s.setUploadedMask);

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string>();
  // "Custom map" chosen but nothing uploaded yet: the pattern kind can't
  // switch until bytes exist, so the pending choice lives here and the drop
  // zone renders in the meantime.
  const [pendingTexture, setPendingTexture] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const coverage = frit
    ? frit.pattern.kind === "texture" && uploadedMask
      ? uploadedMask.coverage
      : patternCoverage(frit.pattern)
    : 0;

  const changeKind = (kind: PatternKind) => {
    if (!frit) return;
    if (kind !== "texture") setPendingTexture(false);
    if (kind === "dots") {
      setFritPattern({ kind: "dots", dotDiameter: fromDisplay(6, "mm"), spacing: fromDisplay(12, "mm") });
    } else if (kind === "lines") {
      setFritPattern({
        kind: "lines",
        lineWidth: fromDisplay(3, "mm"),
        spacing: fromDisplay(10, "mm"),
        orientation: "horizontal",
      });
    } else if (kind === "uniform") {
      setFritPattern({ kind: "uniform", coverage: fraction(0.4) });
    } else if (uploadedMask) {
      setFritPattern({
        kind: "texture",
        fileName: uploadedMask.fileName,
        bytes: uploadedMask.bytes,
      });
    } else {
      setPendingTexture(true);
    }
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(undefined);
    try {
      const texture = await readTextureFile(file);
      setUploadedMask(texture);
      setFritPattern({ kind: "texture", fileName: texture.fileName, bytes: texture.bytes });
      setPendingTexture(false);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "That file could not be read.");
    }
  };

  if (!frit) return null;

  return (
    <div className="space-y-3">
          <SegmentedControl<PatternKind>
            ariaLabel="Frit pattern"
            value={pendingTexture ? "texture" : frit.pattern.kind}
            onChange={changeKind}
            options={[
              { value: "dots", label: "Dots" },
              { value: "lines", label: "Lines" },
              { value: "texture", label: "Custom map" },
              { value: "uniform", label: "Coverage only" },
            ]}
          />

          {frit.pattern.kind === "dots" && !pendingTexture ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Dot diameter (${unitLabel(unit)})`}>
                <NumberInput
                  value={toDisplay(frit.pattern.dotDiameter, unit)}
                  onChange={(value) =>
                    setFritPattern({
                      kind: "dots",
                      dotDiameter: fromDisplay(value, unit),
                      spacing: (frit.pattern as Extract<FritPattern, { kind: "dots" }>).spacing,
                    })
                  }
                  min={0}
                  step={unitStep(unit)}
                />
              </Field>
              <Field label={`Spacing, center to center (${unitLabel(unit)})`}>
                <NumberInput
                  value={toDisplay(frit.pattern.spacing, unit)}
                  onChange={(value) =>
                    setFritPattern({
                      kind: "dots",
                      dotDiameter: (frit.pattern as Extract<FritPattern, { kind: "dots" }>).dotDiameter,
                      spacing: fromDisplay(value, unit),
                    })
                  }
                  min={0}
                  step={unitStep(unit)}
                />
              </Field>
            </div>
          ) : null}

          {frit.pattern.kind === "lines" && !pendingTexture ? (
            <div className="grid grid-cols-3 gap-3">
              <Field label={`Line width (${unitLabel(unit)})`}>
                <NumberInput
                  value={toDisplay(frit.pattern.lineWidth, unit)}
                  onChange={(value) =>
                    setFritPattern({ ...(frit.pattern as Extract<FritPattern, { kind: "lines" }>), lineWidth: fromDisplay(value, unit) })
                  }
                  min={0}
                  step={unitStep(unit)}
                />
              </Field>
              <Field label={`Spacing (${unitLabel(unit)})`}>
                <NumberInput
                  value={toDisplay(frit.pattern.spacing, unit)}
                  onChange={(value) =>
                    setFritPattern({ ...(frit.pattern as Extract<FritPattern, { kind: "lines" }>), spacing: fromDisplay(value, unit) })
                  }
                  min={0}
                  step={unitStep(unit)}
                />
              </Field>
              <Field label="Direction">
                <SegmentedControl
                  ariaLabel="Line direction"
                  value={frit.pattern.orientation}
                  onChange={(orientation) =>
                    setFritPattern({ ...(frit.pattern as Extract<FritPattern, { kind: "lines" }>), orientation })
                  }
                  options={[
                    { value: "horizontal", label: "Horizontal" },
                    { value: "vertical", label: "Vertical" },
                  ]}
                />
              </Field>
            </div>
          ) : null}

          {frit.pattern.kind === "uniform" && !pendingTexture ? (
            <Field label="Coverage" hint="No visible pattern; correct light behavior at a distance.">
              <PercentInput
                value={frit.pattern.coverage}
                onChange={(value) => setFritPattern({ kind: "uniform", coverage: fraction(value) })}
              />
            </Field>
          ) : null}

          {frit.pattern.kind === "texture" || pendingTexture ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInput.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") fileInput.current?.click();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                void handleUpload(event.dataTransfer.files?.[0]);
              }}
              className={`flex cursor-pointer items-center gap-3 rounded-md border-2 border-dashed p-4 transition ${
                dragOver
                  ? "border-accent bg-accent-soft"
                  : "border-border-strong/60 hover:border-accent/60"
              }`}
            >
              {uploadedMask ? (
                <Image
                  src={uploadedMask.previewUrl}
                  alt="Frit coverage map"
                  width={56}
                  height={56}
                  unoptimized
                  className="h-14 w-14 rounded border border-border-subtle object-cover"
                />
              ) : (
                <svg viewBox="0 0 24 24" className="h-8 w-8 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                  <path d="M12 15.5 V4.5 M8 8 L12 4 L16 8" />
                  <path d="M4 15 v3.5 a1 1 0 0 0 1 1 h14 a1 1 0 0 0 1-1 V15" />
                </svg>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {uploadedMask
                    ? uploadedMask.fileName
                    : "Drop your pattern image here, or click to browse"}
                </p>
                <p className="text-xs text-muted">
                  {uploadedMask
                    ? "White is frit, black is open glass. Drop a new image to replace it."
                    : "A black-and-white image. White is frit, black is open glass."}
                </p>
              </div>
            </div>
          ) : null}

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void handleUpload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {uploadError ? <p className="text-xs text-danger">{uploadError}</p> : null}

          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="Frit color">
              <ColorInput
                value={linearRGBToHex(frit.color)}
                onChange={(hex) => updateFrit({ color: hexToLinearRGB(hex) })}
              />
            </Field>
            <Field label="Opacity" hint="How much light the enamel blocks.">
              <PercentInput
                value={frit.opacity}
                onChange={(value) => updateFrit({ opacity: fraction(value) })}
              />
            </Field>
          </div>

          <div className="max-w-sm">
            <Field label="Surface" hint="Tagged in amber on the diagram above.">
              <Select
                value={String(frit.surface)}
                onChange={(value) => updateFrit({ surface: Number(value) as SurfaceNumber })}
                options={surfaceOptions(lites.length).map((o) => ({
                  value: String(o.value),
                  label: o.label,
                }))}
              />
            </Field>
          </div>

          <p className="text-xs text-muted">
            Covers {(coverage * 100).toFixed(0)}% of the glass.
          </p>
    </div>
  );
}
