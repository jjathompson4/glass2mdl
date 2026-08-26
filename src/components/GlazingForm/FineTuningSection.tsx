"use client";

import { useState } from "react";
import {
  gray,
  nominalAssemblyHue,
  patternCoverage,
  resolveColorSpec,
  type DerivedOptics,
  type FritInput,
} from "@/engine";
import { useAppStore } from "@/lib/store";
import { DisclosureRow, Section, StepTitle } from "@/components/ui/fields";
import { CoatingOverridesPanel } from "./CoatingPanel";
import { FritPanel } from "./FritSection";
import { GlassColorPanel, Swatch } from "./GlassColorPanel";

type Panel = "color" | "coating" | "frit";

/**
 * Everything optional in one place, closed by default. Each row's closed
 * state has to say enough that most people never open it: what it is, why
 * you'd bother, and what it's currently doing.
 */
export function FineTuningSection({ derived }: { derived: DerivedOptics | null }) {
  const system = useAppStore((s) => s.system);
  const uploadedMask = useAppStore((s) => s.uploadedMask);
  const updateLite = useAppStore((s) => s.updateLite);
  const [open, setOpen] = useState<Panel | null>(null);

  const toggle = (panel: Panel) => setOpen(open === panel ? null : panel);

  const coatedIndex = system.lites.findIndex((l) => l.coating);
  const coating = coatedIndex >= 0 ? system.lites[coatedIndex].coating : undefined;
  const coatingHue = coating?.reflectedColor ?? gray(1);
  const overrideCount = coating?.overrides ? Object.keys(coating.overrides).length : 0;

  const adjustedCount = [
    system.assembly.transmittedColor,
    system.assembly.reflectedColorExt,
    system.assembly.reflectedColorInt,
  ].filter((spec) => spec && spec.kind !== "auto").length;

  const frit = system.frit;
  const fritSummary = frit
    ? `${fritPatternLabel(frit.pattern.kind)} · ${(fritCoverage(frit, uploadedMask?.coverage) * 100).toFixed(0)}% · surface #${frit.surface}`
    : "Off";

  return (
    <Section
      title={
        <StepTitle n={4}>
          Fine-tuning <span className="font-normal text-muted">(optional)</span>
        </StepTitle>
      }
      description="Most exports never touch these. Open one only when the cutsheet gives you more data."
    >
      <div className="space-y-2">
        <DisclosureRow
          title="Glass color"
          description="Set by your substrate choice. Open only to adjust it against the datasheet."
          summary={adjustedCount ? `${adjustedCount} adjusted` : undefined}
          leading={
            <span className="flex items-center">
              <span className="rounded-full border-2 border-surface">
                <Swatch color={resolveColorSpec(system.assembly.transmittedColor, nominalAssemblyHue(system.lites))} size="h-5 w-5" />
              </span>
              <span className="-ml-1.5 rounded-full border-2 border-surface">
                <Swatch color={resolveColorSpec(system.assembly.reflectedColorExt, coatingHue)} size="h-5 w-5" />
              </span>
              <span className="-ml-1.5 rounded-full border-2 border-surface">
                <Swatch color={resolveColorSpec(system.assembly.reflectedColorInt, coatingHue)} size="h-5 w-5" />
              </span>
            </span>
          }
          open={open === "color"}
          onToggle={() => toggle("color")}
        >
          <GlassColorPanel />
        </DisclosureRow>

        {coating ? (
          <DisclosureRow
            title="Coating overrides"
            description="Nothing to do here. The coating's values are fitted for you and shown in step 5. Open only when the manufacturer publishes them directly."
            summary={overrideCount ? `${overrideCount} overridden` : "Fitted automatically"}
            open={open === "coating"}
            onToggle={() => toggle("coating")}
          >
            <CoatingOverridesPanel
              coating={coating}
              derived={derived}
              onChange={(next) => updateLite(coatedIndex, { coating: next })}
            />
          </DisclosureRow>
        ) : null}

        <DisclosureRow
          title="Frit"
          description="Ceramic enamel fused to one surface: dots, lines, or your own pattern file."
          summary={fritSummary}
          open={open === "frit"}
          onToggle={() => toggle("frit")}
        >
          <FritPanel />
        </DisclosureRow>
      </div>
    </Section>
  );
}

function fritPatternLabel(kind: "dots" | "lines" | "texture" | "uniform"): string {
  return kind === "dots"
    ? "Dots"
    : kind === "lines"
      ? "Lines"
      : kind === "texture"
        ? "Custom map"
        : "Coverage only";
}

function fritCoverage(frit: FritInput, maskCoverage: number | undefined): number {
  // Uploaded masks report 1.0 inside the engine; the coverage measured in the
  // browser at upload time is the honest number for a summary line.
  return frit.pattern.kind === "texture" ? (maskCoverage ?? 1) : patternCoverage(frit.pattern);
}
