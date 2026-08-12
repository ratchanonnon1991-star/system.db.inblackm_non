"use client";

import { GripVertical } from "lucide-react";

/** Sits on a modal box's right edge (the box needs `relative` for this to
 * anchor to) -- drag it to make the modal wider or narrower. Pair with
 * useResizableModalWidth, which does the actual pointer-drag tracking. */
export default function ModalResizeHandle({ onPointerDown, active = false }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute right-0 top-0 z-10 flex h-full w-2.5 shrink-0 touch-none items-center justify-center rounded-r-sm ${
        active ? "cursor-col-resize bg-red-500/20" : "cursor-col-resize hover:bg-red-500/10"
      }`}
      title="ลากเพื่อขยาย/ย่อความกว้าง"
    >
      <GripVertical size={12} className="text-zinc-300" />
    </div>
  );
}
