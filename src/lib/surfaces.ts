import { litePositionNames, type SurfaceNumber } from "@/engine";

/**
 * Human labels for the numbered surfaces, exterior inward. A bare "#3" makes
 * the user count faces on the diagram; saying which lite and what the surface
 * faces makes the dropdown self-explanatory.
 */
export function surfaceOptions(liteCount: number): { value: SurfaceNumber; label: string }[] {
  const positions = litePositionNames(liteCount);
  const highest = liteCount * 2;

  return Array.from({ length: highest }, (_, i) => {
    const surface = (i + 1) as SurfaceNumber;
    const lite = Math.floor(i / 2);
    const where =
      surface === 1
        ? "faces outside"
        : surface === highest
          ? "faces the room"
          : liteCount === 2
            ? "faces the cavity"
            : `faces cavity ${Math.floor(surface / 2)}`;
    const liteName = liteCount === 1 ? "" : `${positions[lite]} lite, `;
    return { value: surface, label: `#${surface} · ${liteName}${where}` };
  });
}
