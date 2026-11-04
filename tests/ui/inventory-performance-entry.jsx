import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import UsdCodashopLedger from "../../src/components/usdcodashop-ledger.js";
import WavePayInventory from "../../src/components/wavepay-inventory.js";

function Preview() {
  const [mode, setMode] = useState("ปกติ");
  async function control(value, label) {
    await fetch("/qa/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
    setMode(label);
  }
  return <div data-theme="light">
    <nav className="qa-controls" aria-label="Local test controls"><strong>LOCAL QA · ข้อมูลจำลอง</strong><a href="/usdcodashop">USDCodashop</a><a href="/wavepay">WavePay</a>
      <button onClick={() => control({ delayMs: 0, fail: false }, "ปกติ")}>โหมดปกติ</button>
      <button onClick={() => control({ delayMs: 32000, fail: false }, "ช้า 32 วินาที")}>จำลองอ่านช้า</button>
      <button onClick={() => control({ delayMs: 0, fail: true }, "โหลดล้มเหลว")}>จำลองโหลดล้มเหลว</button><span role="status">{mode}</span>
    </nav>
    {location.pathname.includes("wavepay") ? <WavePayInventory lang="th" /> : <UsdCodashopLedger lang="th" />}
  </div>;
}
createRoot(document.getElementById("root")).render(<Preview />);
