"use client";

import { ComputedColumnModal } from "@/components/gamedb-modals";
import { GAMEINFO_FIELD_NAMES } from "@/lib/gameinfo-formula-fields";

// Thin wrapper around the systemdb formula editor (same parser, validation
// and function library), scoped to gameinfo's fixed pack/game field list
// instead of arbitrary query columns — this fixed list is what makes it
// "simpler" than the systemdb-side editor, not a forked engine.
export default function GameinfoComputedEditor({ sampleRow, onAdd, onClose }) {
  return (
    <ComputedColumnModal
      availableNames={GAMEINFO_FIELD_NAMES}
      sampleRow={sampleRow}
      onClose={onClose}
      onAdd={({ label, formula, type }) => {
        onAdd({ key: `col_${Date.now()}`, label, formula, type });
      }}
    />
  );
}
