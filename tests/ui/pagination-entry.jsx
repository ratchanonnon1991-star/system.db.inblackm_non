import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import PaginatedTable from "../../src/components/table-pagination.js";
import WavePayInventory from "../../src/components/wavepay-inventory.js";
import ProfitHistory from "../../src/app/profit/agenh2h-history/page.js";
import ProfitCard from "../../src/app/profit/category/[categoryId]/card/[cardId]/page.js";
import ProfitPackCosts from "../../src/app/profit/pack-costs/page.js";
import GameinfoMarketMapping from "../../src/components/gameinfo-market-mapping-page.js";
import InventoryLedgerDebit from "../../src/components/inventory-ledger-debit.js";

function Editor() {
  const [rows, setRows] = useState(() => Array.from({ length: 51 }, (_, index) => ({ id: index + 1, name: `แถว ${index + 1}`, value: "ยังไม่แก้" })));
  const [query, setQuery] = useState("");
  const filtered = rows.filter((row) => row.name.includes(query));
  return <main className="mx-auto max-w-5xl space-y-4 p-6 text-ll-ink"><h1 className="text-2xl font-semibold">ตารางตั้งค่า · ข้อมูลทดลอง</h1><p>ทดสอบแก้แถวข้ามหน้า ค้นหา และลบแถวสุดท้าย โดยไม่มีการเขียนฐานข้อมูล</p><label>ค้นหาแถว <input aria-label="ค้นหาแถว" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded border p-2" /></label><PaginatedTable items={filtered} resetKey={query} label="ตารางทดลอง">{(pageRows, start) => <table className="w-full text-sm"><thead><tr><th>ID</th><th>ชื่อ</th><th>ค่า</th><th /></tr></thead><tbody>{pageRows.map((row, index) => ((entry, globalIndex) => <tr key={entry.id} className="border-b"><td>{entry.id}</td><td>{entry.name}</td><td><input aria-label={`ค่าแถว ${entry.id}`} value={entry.value} onChange={(e) => { const id = filtered[globalIndex].id; setRows((all) => all.map((r) => r.id === id ? { ...r, value: e.target.value } : r)); }} className="m-1 rounded border p-2" /></td><td><button type="button" onClick={() => setRows((all) => all.filter((r) => r.id !== entry.id))}>ลบแถว {entry.id}</button></td></tr>)(row, start + index))}</tbody></table>}</PaginatedTable><output aria-label="ค่าที่แก้แล้ว">{rows.filter((row) => row.value !== "ยังไม่แก้").map((row) => `${row.id}: ${row.value}`).join(" · ")}</output></main>;
}
function Preview() {
  const view = location.pathname;
  const [slow, setSlow] = useState(false);
  async function setDelay() {
    const next = !slow;
    await fetch("/qa/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delayMs: next ? 1500 : 0 }) });
    setSlow(next);
  }
  return <div data-theme="light"><nav className="qa-controls" aria-label="หน้า local"><strong>GameDB · LOCAL · ข้อมูลจำลอง</strong><a href="/profit">Profit History</a><a href="/card">รายละเอียดบัญชี</a><a href="/wavepay">WavePay</a><a href="/costs">ต้นทุนแพ็ก</a><a href="/mapping">GameInfo Mapping</a><a href="/editor">ตารางแก้ข้อมูล</a><a href="/debit">กรอกยอด</a><a href="http://127.0.0.1:4191">System DB</a><button type="button" aria-pressed={slow} onClick={setDelay}>หน่วงการอ่าน 1.5 วิ: {slow ? "เปิด" : "ปิด"}</button></nav>{view === "/editor" ? <Editor /> : view === "/wavepay" ? <WavePayInventory lang="th" /> : view === "/debit" ? <InventoryLedgerDebit lang="th" /> : <div className="mx-auto max-w-7xl p-5 text-ll-ink">{view === "/card" ? <ProfitCard /> : view === "/costs" ? <ProfitPackCosts /> : view === "/mapping" ? <GameinfoMarketMapping games={[{ id: 1, game: "เกมทดลอง", markets: [{ market: "kaleoz", enabled: true }] }]} dataMode="uid" editable={false} /> : <ProfitHistory />}</div>}</div>;
}
createRoot(document.getElementById("root")).render(<Preview />);
