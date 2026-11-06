// Which packs a low-stock alert is due for. Pure. A pack alerts once when it drops below its level
// and again only after it has come back up. A pack never stocked has nothing to run out of, and a
// level of 0 means no alert is wanted.
const MAX_LINES = 40;

/** @returns {{ due: object[], cleared: number[] }} packs to alert, and item ids back above their level */
export function stockLowAlertPlan(accounts) {
  const due = [];
  const cleared = [];
  for (const account of accounts) {
    if (account.status === "closed") continue;
    for (const item of account.items || []) {
      const watched = item.lowAt > 0 && item.received > 0;
      const low = watched && item.left < item.lowAt;
      if (low && !item.lowAlertAt) due.push({ id: item.id, code: account.code, label: item.label, packName: item.packName, left: item.left, lowAt: item.lowAt });
      if (!low && item.lowAlertAt) cleared.push(item.id);
    }
  }
  return { due, cleared };
}

export function stockLowAlertText(due) {
  const lines = due.slice(0, MAX_LINES).map((pack) => {
    const name = pack.packName ? `${pack.label} (${pack.packName})` : pack.label;
    return `${pack.left <= 0 ? "หมด" : `เหลือ ${pack.left}`} / เกณฑ์ ${pack.lowAt} · ${pack.code} · ${name}`.slice(0, 200);
  });
  const more = due.length > MAX_LINES ? [`และอีก ${due.length - MAX_LINES} แพ็ค`] : [];
  return ["⚠️ Stock: แพ็คเหลือน้อยกว่าที่กำหนด", ...lines, ...more, "https://tools.inblackm.com/stock/inventory"].join("\n");
}
