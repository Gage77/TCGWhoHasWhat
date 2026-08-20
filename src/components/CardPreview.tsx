"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/** Scryfall "normal" images are 488×680; shown at half size beside a cursor. */
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

/** Beside the cursor, or filling the middle of a phone screen. */
type Preview = { kind: "hover"; left: number; top: number } | { kind: "tap" };

/**
 * Shows the card on hover, or on tap where there is no hover to speak of.
 *
 * Magic players recognise cards by their art far faster than by name,
 * especially when telling two printings apart, so anywhere a card name
 * appears it is worth being able to see the card.
 *
 * A pointer that is not a mouse gets a tapped overlay in the centre of the
 * screen instead of a popup pinned to a cursor that does not exist — on a
 * phone the finger is over the card name, which is precisely where a
 * cursor-relative preview would have gone.
 *
 * The hover preview is positioned fixed rather than absolutely: the results
 * table scrolls horizontally, and an absolutely positioned child would be
 * clipped by that container.
 */
export function CardPreview({ src, alt, children, className }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  // What raised the click that is about to arrive. Empty for a keypress,
  // which is the case that most needs the overlay: no pointer, no hover.
  const lastPointer = useRef("");
  const visible = preview !== null;

  // A hover preview is placed from the pointer, which does not move during a
  // scroll — without this it would hang over the page until the mouse moved
  // again. A tapped one is dismissed by the same gesture, which is what
  // everything else full-screen on a phone does. Hooks stay above the early
  // return so their order never changes.
  useEffect(() => {
    if (!visible) return;

    const hide = () => setPreview(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };

    window.addEventListener("scroll", hide, { passive: true, capture: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("keydown", onKey);
    };
  }, [visible]);

  if (!src) return <>{children}</>;

  function place(event: React.PointerEvent) {
    // Touch and pen raise hover events too, immediately before the tap; taking
    // them here would flash a preview beside the finger and then replace it.
    if (event.pointerType !== "mouse") return;

    // Prefer bottom-right of the cursor, flipping near the viewport edges.
    let left = event.clientX + GAP;
    if (left + WIDTH > window.innerWidth) left = event.clientX - GAP - WIDTH;

    let top = event.clientY + GAP;
    if (top + HEIGHT > window.innerHeight) top = window.innerHeight - HEIGHT - GAP;

    setPreview({ kind: "hover", left: Math.max(GAP, left), top: Math.max(GAP, top) });
  }

  return (
    <>
      <button
        type="button"
        onPointerDown={(event) => {
          lastPointer.current = event.pointerType;
        }}
        onClick={(event) => {
          // A mouse has already seen the card on the way to clicking it, so
          // leave the click alone — in the results table it belongs to the row
          // underneath, which expands. Anything else gets the overlay, and
          // must not toggle the row on its way there.
          const wasMouse = lastPointer.current === "mouse";
          // Cleared so that a later keypress on this same button is read as
          // the keypress it is, rather than as whatever last touched it.
          lastPointer.current = "";
          if (wasMouse) return;

          event.stopPropagation();
          setPreview((current) => (current?.kind === "tap" ? null : { kind: "tap" }));
        }}
        onPointerEnter={place}
        onPointerMove={place}
        onPointerLeave={() => setPreview(null)}
        aria-label={`Show ${alt}`}
        className={`text-left align-baseline ${className ?? ""}`}
      >
        {children}
      </button>

      {preview?.kind === "hover" && (
        <span
          // Purely decorative: the card name is already in the document.
          aria-hidden="true"
          className="pointer-events-none fixed z-50 overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/20"
          style={{ left: preview.left, top: preview.top, width: WIDTH, height: HEIGHT }}
        >
          <Image src={src} alt={alt} width={WIDTH} height={HEIGHT} unoptimized priority={false} />
        </span>
      )}

      {preview?.kind === "tap" && (
        <span
          role="dialog"
          aria-label={alt}
          onClick={(event) => {
            event.stopPropagation();
            setPreview(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-6"
        >
          <Image
            src={src}
            alt={alt}
            width={488}
            height={680}
            unoptimized
            // Sized to whichever runs out first, the screen's width or height,
            // so a card is as big as it can be without being cropped.
            className="h-auto w-auto max-h-[min(80vh,_calc(85vw_*_680_/_488))] max-w-[85vw] rounded-xl shadow-2xl ring-1 ring-black/20"
          />
        </span>
      )}
    </>
  );
}
