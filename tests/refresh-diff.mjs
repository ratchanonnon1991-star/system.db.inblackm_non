// The refresh diff, lifted verbatim from query-panel so it can be exercised
// against reordered results.
//
// Unlike every other suite here, this one tests a copy rather than the shipped
// code: the diff runs inside the panel component and cannot be imported on its
// own. A change to the panel that is not mirrored here will pass and mean
// nothing, so move the logic into a module of its own when it next needs
// touching.
export function diffRows({ previous, data, pkName }) {
  const columnIds = data.columns.map((col) => col.name);
  const keys = new Set();
  if (!previous || previous.columns.length !== data.columns.length) return keys;

  const keyIndex = pkName ? data.columns.findIndex((col) => col.name === pkName) : -1;
  const before =
    keyIndex >= 0 ? new Map(previous.rows.map((row) => [String(row[keyIndex]), row])) : null;

  if (before) {
    data.rows.forEach((row, rowIndex) => {
      const was = before.get(String(row[keyIndex]));
      if (!was) return;
      row.forEach((value, colIndex) => {
        if (String(was[colIndex]) !== String(value)) {
          keys.add(`${rowIndex}:${columnIds[colIndex]}`);
        }
      });
    });
  } else if (previous.rows.length === data.rows.length) {
    data.rows.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        if (String(previous.rows[rowIndex][colIndex]) !== String(value)) {
          keys.add(`${rowIndex}:${columnIds[colIndex]}`);
        }
      });
    });
  }
  return keys;
}
