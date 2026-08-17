"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/** Scryfall "normal" images are 488×680; shown at half size. */
const WIDTH = 244;
const HEIGHT = 340;
const GAP = 16;

interface Props {
  /** Scryfall image URL, or null when the card could not be resolved. */
  src: string | null;
  alt: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Shows the card on hover.
 *
 * Magic players recognise cards by their art far faster than by name,
 * especially when telling two printings apart, so anywhere a card name
 * appears it is worth being able to see the card.
 *
 * The preview is positioned fixed rather than absolutely: the results table
 * scrolls horizontally, and an absolutely positioned child would be clipped
 * by that container.
 */
export function CardPreview({ src, alt, children, className }: Props) {
  const [point, setPoint] = useState<{ left: number; top: number } | null>(null);
  const visible = point !== null;

  // The preview is placed from the pointer, which does not move during a
  // scroll — without this it would hang over the page until the mouse moved
  // again. Hooks stay above the early return so their order never changes.
  useEffect(() => {
    if (!visible) return;
    const hide = () => setPoint(null);
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, [visible]);

  if (!src) return <>{children}</>;

  function place(event: React.MouseEvent) {
    // Prefer bottom-right of the cursor, flipping near the viewport edges.
    let left = event.clientX + GAP;
    if (left + WIDTH > window.innerWidth) left = event.clientX - GAP - WIDTH;

    let top = event.clientY + GAP;
    if (top + HEIGHT > window.innerHeight) top = window.innerHeight - HEIGHT - GAP;

    setPoint({ left: Math.max(GAP, left), top: Math.max(GAP, top) });
  }

  return (
    <span
      className={className}
      onMouseEnter={place}
      onMouseMove={place}
      onMouseLeave={() => setPoint(null)}
    >
      {children}
      {point && (
        <span
          // Purely decorative: the card name is already in the document.
          aria-hidden="true"
          className="pointer-events-none fixed z-50 overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/20"
          style={{ left: point.left, top: point.top, width: WIDTH, height: HEIGHT }}
        >
          <Image src={src} alt={alt} width={WIDTH} height={HEIGHT} unoptimized priority={false} />
        </span>
      )}
    </span>
  );
}
