"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A box that scrolls sideways with its scrollbar pinned to the bottom of the
 * screen while the box is on screen. A long pack table used to keep its
 * scrollbar under its last row, so moving sideways meant scrolling all the
 * way down first. Extra props (style, aria-*) go on the scrolling box.
 */
export default function GameinfoHScroll({ className = "", children, ...props }) {
  const boxRef = useRef(null);
  const barRef = useRef(null);
  const [size, setSize] = useState({ width: 0, overflow: false });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const measure = () => {
      const width = box.scrollWidth;
      const overflow = width > box.clientWidth + 1;
      setSize((current) => (current.width === width && current.overflow === overflow ? current : { width, overflow }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    for (const child of box.children) observer.observe(child);
    return () => observer.disconnect();
  }, [children]);

  useEffect(() => {
    if (size.overflow && barRef.current && boxRef.current) barRef.current.scrollLeft = boxRef.current.scrollLeft;
  }, [size.overflow]);

  // Each side moves the other. The echo finds both already level and stops.
  function follow(fromBox) {
    const from = fromBox ? boxRef.current : barRef.current;
    const to = fromBox ? barRef.current : boxRef.current;
    if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  }

  return (
    <>
      <div
        {...props}
        ref={boxRef}
        onScroll={() => follow(true)}
        className={`${className} ${size.overflow ? "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : ""}`}
      >
        {children}
      </div>
      {size.overflow ? (
        <div
          ref={barRef}
          onScroll={() => follow(false)}
          aria-hidden="true"
          className="sticky bottom-0 z-20 overflow-x-auto overflow-y-hidden rounded-b-md border-t border-linear-hairline bg-linear-surface-1/95 px-1 py-1 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-400 [&::-webkit-scrollbar-thumb:hover]:bg-zinc-500 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-linear-surface-3"
        >
          <div style={{ width: size.width, height: 1 }} />
        </div>
      ) : null}
    </>
  );
}
