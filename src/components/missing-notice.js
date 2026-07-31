"use client";

/**
 * What is still needed before a form can be saved.
 *
 * Every save in the app is disabled until its form is complete, which on its
 * own only produces a grey button and no idea which box is at fault. Shared so
 * that answer reads the same everywhere.
 */
export default function MissingNotice({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-800">
      ยังบันทึกไม่ได้ — ต้องกรอก: {items.join(" · ")}
    </div>
  );
}
