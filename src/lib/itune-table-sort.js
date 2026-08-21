import { computeEffectiveItuneStatus } from "@/lib/itune-status";

const collator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });

function valueFor(row, key) {
  if (key === "id" || key === "amount") {
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : null;
  }
  if (key === "addedAt") {
    const value = new Date(row.addedAt).getTime();
    return Number.isFinite(value) ? value : null;
  }
  if (key === "status") return computeEffectiveItuneStatus(row).label;
  if (key === "amountConfirmImage") return row.amountConfirmImage ? 1 : 0;
  return String(row[key] ?? "").trim();
}

export function nextItuneTableSort(current, key) {
  if (current?.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return null;
}

export function sortItuneTableRows(rows, sort) {
  if (!sort) return rows;
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = valueFor(a, sort.key);
    const right = valueFor(b, sort.key);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    const compared =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : collator.compare(String(left), String(right));
    return compared * direction;
  });
}
