"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Collapses the header's tagline and version lines once the page is scrolled:
 * they only matter on first read, and the sticky header should not spend
 * their height forever on a page that is itself a scroll-driven form. The
 * hide is instant (no transition) so the condensed diagram bar, which pins
 * itself to the header's measured bottom on every scroll tick, never chases
 * an animating edge.
 */
export function HeaderMeta({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 120);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return <div className={compact ? "hidden" : ""}>{children}</div>;
}
