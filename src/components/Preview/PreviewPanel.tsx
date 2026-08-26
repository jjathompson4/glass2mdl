"use client";

/**
 * Placeholder for the appearance preview.
 *
 * An approximation of glazing appearance was tried here and removed: it was
 * close enough to look authoritative and not close enough to decide anything,
 * which is the worst combination for a tool whose whole job is matching a
 * cutsheet. Appearance comes back when it can be rendered with a real MDL
 * renderer on a GPU. Until then the numeric breakdown below is the honest
 * readout, and the final look gets confirmed in Iray.
 */
export function PreviewPanel() {
  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
      <header className="border-b border-border-subtle px-3 py-2">
        <h2 className="text-sm font-semibold">Appearance</h2>
      </header>

      <div className="px-3 py-4">
        <p className="text-xs font-medium text-foreground">Coming soon</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Showing how the glazing actually looks means rendering it with a real MDL renderer, which
          needs a GPU. Until that service exists, use the computed breakdown below and confirm the
          final look in Iray.
        </p>
        <button
          type="button"
          disabled
          title="Coming with the GPU render service"
          className="mt-3 w-full cursor-not-allowed rounded-md border border-border-subtle px-2 py-1.5 text-[11px] font-medium text-muted opacity-60"
        >
          Render true preview
        </button>
      </div>
    </div>
  );
}
