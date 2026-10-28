// Text and JSON output of scripts/inventory-manual-fills.mjs. Pure.
import { maskLabel } from "./inventory-ledger-check-format.mjs";

const bkk = iso => (iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }) : "-");
const num = text => (text == null ? "-" : String(text).replace(/(\.\d\d)00$/, "$1"));
const VERDICT = {
  matched: "✓ น่าจะเติมจาก",
  ambiguous: "? เป็นไปได้หลายที่",
  unmatched: "✗ ยังหากระเป๋าไม่เจอ",
  "no-check": "· ช่องทางนี้ยังไม่มีตัวตรวจกระเป๋า",
  "check-failed": "! ตรวจกระเป๋าช่องทางนี้ไม่สำเร็จ (ดูด้านบน)",
  recorded: "✓ บันทึกใน ledger แล้ว",
};

export function manualFillsJson(report, { fullLabel = false } = {}) {
  const place = ({ walletKey, ...p }) => ({ ...p, ...(fullLabel ? { walletKey } : {}), label: maskLabel(p.label, fullLabel) });
  return { ...report,
    candidates: report.candidates.map(c => ({ ...c, places: c.places.map(place) })),
    orphanGaps: report.orphanGaps.map(place) };
}

export function manualFillsText(report, { fullLabel = false, limit = 50 } = {}) {
  const s = report.summary;
  const out = [`ออเดอร์เติมมือ ${report.dateFrom} ถึง ${report.dateTo} (เวลาไทย)  ทั้งหมด ${s.total}`
    + `  จับคู่ได้ ${s.matched}  หลายที่ ${s.ambiguous}  ยังไม่เจอ ${s.unmatched}  ไม่มีตัวตรวจ ${s.noCheck}`
    + (s.checkFailed ? `  ตรวจไม่สำเร็จ ${s.checkFailed}` : "")
    + (report.withLedger ? `  บันทึกแล้ว ${s.recorded}` : "")];
  if (report.byMethod.length) out.push(`ตามช่องทาง: ${report.byMethod.map(m => `${m.method || "?"} ${m.total}`).join(" · ")}`);
  const learned = Object.entries(report.learnedMethods ?? {});
  if (learned.length) out.push(`ช่องทางที่หาจากใบเสร็จ: ${learned.map(([m, p]) => `${m} = ${p}`).join(" · ")}`);
  for (const [provider, message] of Object.entries(report.checkErrors ?? {})) out.push(`! ตรวจกระเป๋า ${provider} ไม่สำเร็จ: ${message}`);

  out.push("", "== ออเดอร์ที่ไม่ได้จ่ายด้วยบอท ==");
  for (const c of report.candidates.slice(0, limit)) {
    out.push(`${c.ref.padEnd(18)} ${c.method.padEnd(14)} ${num(c.amount).padStart(12)}  ${bkk(c.updatedAt)}  ${c.reasonText}${c.quarantined ? " (ปิดโดย stale-queue-quarantine)" : ""}`);
    out.push(`    ${VERDICT[c.verdict]}`);
    for (const p of c.places.slice(0, 4)) {
      out.push(`      ${p.currency ?? ""} ${maskLabel(p.label, fullLabel)}  ยอดหาย ${num(p.amount)}  ${bkk(p.from)} → ${bkk(p.to)}`
        + (p.together.length ? `  (รวมกับ ${p.together.filter(r => r !== c.ref).join(", ")})` : "")
        + (p.alternatives.length ? `  (หรือ ${p.alternatives.filter(r => r !== c.ref).join(", ")})` : ""));
    }
  }
  if (report.candidates.length > limit) out.push(`... อีก ${report.candidates.length - limit} ออเดอร์ (ใช้ --limit)`);

  out.push("", "== ยอดหายที่ยังหาออเดอร์ไม่เจอ ==");
  if (!report.orphanGaps.length) out.push("ไม่มี");
  for (const g of report.orphanGaps.slice(0, limit)) {
    out.push(`${g.provider.padEnd(13)} ${g.currency ?? ""} ${maskLabel(g.label, fullLabel)}  -${num(g.amount)}  ${bkk(g.from)} → ${bkk(g.to)}`
      + (g.likely === "charged" ? "  (ตรงกับคิวที่บอทไม่สำเร็จ)" : "")
      + (g.nearby.length ? `  ออเดอร์เติมมือช่วงนั้น: ${g.nearby.join(", ")}` : ""));
  }
  if (report.orphanGaps.length > limit) out.push(`... อีก ${report.orphanGaps.length - limit} ช่วง`);
  return out.join("\n");
}
