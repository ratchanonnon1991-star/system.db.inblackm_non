// Text and JSON output of scripts/inventory-ledger-check.mjs. Pure.

/** E-mails keep 3 letters, phone-like labels keep the last 3 digits. Names are left alone. */
export function maskLabel(label, full = false) {
  const text = String(label ?? "");
  if (full) return text;
  if (text.includes("@")) { const [name, domain] = text.split("@"); return `${name.slice(0, 3)}***@${domain}`; }
  if (/^\+?\d{7,}$/.test(text)) return `${text.slice(0, 2)}*****${text.slice(-3)}`;
  return text;
}
const bkk = iso => new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" });
const num = text => (text == null ? "-" : String(text).replace(/(\.\d\d)00$/, "$1"));

export function checkJson(report, { fullLabel = false } = {}) {
  // Keys carry the full address; drop them unless asked.
  return { ...report, wallets: report.wallets.map(({ key, ...w }) => ({ ...w, ...(fullLabel ? { key } : {}), label: maskLabel(w.label, fullLabel) })) };
}

function walletLines(w, fullLabel) {
  const out = [`${w.currency ?? ""} ${maskLabel(w.label, fullLabel)}  ใบเสร็จ ${w.receipts}  บอทใช้ ${num(w.botSpent)}`
    + (w.uncheckable ? "" : `  ยอด ${num(w.firstBalance)} → ${num(w.lastBalance)}`) + (w.registered ? "  [ลงทะเบียนแล้ว]" : "")];
  if (w.uncheckable) return [...out, `  ? ตรวจไม่ได้: ${w.uncheckable}`];
  if (w.unobserved) out.push(`  (${w.unobserved} ใบไม่มียอดก่อน/หลัง จึงตรวจช่วงนั้นไม่ได้)`);
  if (w.unverifiable) out.push(`  (${w.unverifiable} ช่วงตรวจไม่ได้ เพราะมีคิวสำเร็จที่ไม่บันทึกยอดตัด)`);
  if (!w.gaps.length && !w.problems.length) return [...out, "  ✓ ตรงทุกช่วงที่ตรวจได้"];
  out.push(`  เข้าโดยไม่มีบันทึก ${num(w.unexplainedIn)}  ออกโดยไม่มีบันทึก ${num(w.unexplainedOut)}  ใบเสร็จตัวเลขไม่ตรง ${w.receiptMismatches}`
    + (w.charged ? `  โดนหักแต่คิวไม่สำเร็จ ${w.charged}` : "") + (w.refunded ? `  หักแล้วได้คืน ${w.refunded}` : ""));
  for (const g of w.gaps.slice(0, 15)) {
    const what = g.kind === "receipt" ? "ใบเสร็จนี้ยอดก่อน/หลังไม่ตรงกับที่ตัด"
      : g.likely === "refunded" ? `หักแล้วได้คืน เวลา ${bkk(g.refundedAt)} (ไม่นับเป็นเงินหาย)`
      : g.likely === "charged" ? `คิวไม่สำเร็จแต่โดนหักเงิน: น่าจะเป็น ${g.suspects.map(h => `${h.ref} (${h.status})`).join(", ")}`
      : g.direction === "in" ? "ยอดเพิ่ม (เติมเงินเข้า?)" : "ยอดหาย (เติมมือ? ซื้อไม่สำเร็จแต่ตัดเงิน?)";
    out.push(`  ${g.direction === "in" ? "+" : "-"}${num(g.amount).padStart(10)}  ${bkk(g.from)} → ${bkk(g.to)}  ${what}`);
    out.push(`             ระหว่าง ${g.fromTag ?? "?"}  และ  ${g.toTag ?? "?"}`);
    for (const h of g.hints.slice(0, 5)) out.push(`             มีรายการสถานะ ${h.status} ${h.ref} เวลา ${bkk(h.at)}`);
  }
  if (w.gaps.length > 15) out.push(`  ... อีก ${w.gaps.length - 15} ช่วง`);
  for (const p of w.problems.slice(0, 5)) out.push(`  ! ${p.ref}: ${p.problem}`);
  if (w.problems.length > 5) out.push(`  ! ... อีก ${w.problems.length - 5} ปัญหา`);
  if (w.doubleCounted.length) out.push(`  ! ออเดอร์ที่บอทตัดและมีบันทึกเติมมือซ้ำ: ${w.doubleCounted.join(", ")}`);
  return out;
}

export function checkText(report, { fullLabel = false, limit = 20 } = {}) {
  const out = [`[${report.providerLabel}] ช่วง ${report.dateFrom} ถึง ${report.dateTo} (เวลาไทย)  รายการ ${report.receipts}  กระเป๋า ${report.wallets.length}  มีส่วนต่าง ${report.walletsWithGaps}`
    + (report.unplacedReceipts ? `  ระบุกระเป๋าไม่ได้ ${report.unplacedReceipts}` : "")
    + (report.withLedger ? "  (รวมรายการใน ledger)" : "  (เฉพาะข้อมูลบอท)")];
  if (report.note) out.push(`หมายเหตุ: ${report.note}`);
  for (const w of report.wallets.slice(0, limit)) out.push("", ...walletLines(w, fullLabel));
  if (report.wallets.length > limit) out.push("", `... อีก ${report.wallets.length - limit} กระเป๋า (ใช้ --limit)`);
  return out.join("\n");
}
