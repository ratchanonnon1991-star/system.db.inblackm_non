"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { ADDRESS_COINS, chainOf, chainsForCoin, validateCryptoAddress } from "@/lib/stock-addresses";
import { StockField, stockInputClass } from "@/components/stock-ui";
import { CryptoAddressCard } from "@/components/crypto-address-card";
import ComboInput from "@/components/combo-input";

const EMPTY = { recipient: "", coin: "USDT", chain: "TRC20 (Tron)", address: "", memo: "", note: "" };
export default function StockAddressesView({ addresses, retired = [], recipients = [], canEdit, currentUserId }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const chain = chainOf(form.chain);
  // Checked as typed, so a wrong chain or a cut-off paste shows before saving.
  const check = form.address ? validateCryptoAddress(form) : null;

  async function save(event) {
    event.preventDefault();
    setError("");
    setBusy("add");
    try {
      await apiJson("/api/stock/addresses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form), fallbackError: "บันทึก address ไม่สำเร็จ" });
      setForm(EMPTY);
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function decide(entry, action) {
    const reason = action === "retire" ? window.prompt("เหตุผลที่เลิกใช้ address นี้ (เช่น ผู้รับเปลี่ยน address)") : "";
    if (action === "retire" && !reason) return;
    setBusy(entry.id);
    setError("");
    try {
      await apiJson(`/api/stock/addresses/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }), fallbackError: "บันทึกไม่สำเร็จ" });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const groups = [...new Set(addresses.map((entry) => entry.recipient))];
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-4 py-6 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black"><Send size={22} aria-hidden="true" /> ที่อยู่โอน</h1>
          <p className="mt-1 max-w-[720px] text-sm text-zinc-600">
            address ปลายทางสำหรับถอนเหรียญจาก Bybit: กดก็อปเหรียญ chain address และ memo ทีละช่องแทนการพิมพ์ · ใส่ chain และ address ได้ทุกแบบตามที่ผู้รับให้มา · address ที่เพิ่มใหม่ต้องให้<b>อีกคน</b>เทียบกับข้อความของผู้รับแล้วกดยืนยันก่อนจึงจะก็อปได้ · ถ้าผู้รับเปลี่ยน address ให้กดเลิกใช้อันเก่าแล้วเพิ่มอันใหม่
          </p>
        </div>
        {canEdit && !adding ? (
          <button type="button" onClick={() => setAdding(true)} className="flex h-11 items-center gap-2 rounded-full bg-[#D90005] px-4 text-sm font-extrabold text-white hover:bg-[#B00004]">
            <Plus size={16} /> เพิ่ม address
          </button>
        ) : null}
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-bold text-red-800">{error}</p> : null}

      {adding ? (
        <form onSubmit={save} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2">
          <StockField label="ผู้รับ (ซัพหรือกระเป๋าของเรา)" htmlFor="addr-recipient" hint="ใช้ชื่อเดียวกับชื่อซัพในใบสั่งซื้อ เพื่อให้ขึ้นในขั้นโอนเงิน">
            <ComboInput id="addr-recipient" value={form.recipient} onChange={(recipient) => set({ recipient })} placeholder="พิมพ์หรือเลือก เช่น YAYA" required
              groups={[{ label: "", options: recipients }]} />
          </StockField>
          <StockField label="เหรียญ" htmlFor="addr-coin">
            <ComboInput id="addr-coin" value={form.coin} upper required placeholder="พิมพ์หรือเลือก เช่น USDT"
              onChange={(coin) => {
                // A listed coin moves the chain to one it is sent on, unless the chain already fits.
                const usual = chainsForCoin(coin).usual;
                const fits = !ADDRESS_COINS.includes(coin) || usual.some((item) => item.label === form.chain || item.code === form.chain);
                set({ coin, chain: fits ? form.chain : usual[0]?.label || form.chain });
              }}
              groups={[{ label: "", options: ADDRESS_COINS }]} />
          </StockField>
          <StockField label="Chain" htmlFor="addr-chain" hint={chain ? `${chain.label}: ${chain.hint}` : "เลือกหรือพิมพ์ให้ตรงกับที่ผู้รับบอก"}>
            <ComboInput id="addr-chain" value={form.chain} onChange={(value) => set({ chain: value })} placeholder="พิมพ์หรือเลือก เช่น TRC20, BSC, SOL" required
              groups={[
                { label: `ที่ใช้กับ ${form.coin || "เหรียญนี้"} บ่อย`, options: chainsForCoin(form.coin).usual.map((item) => item.label) },
                { label: "chain อื่น", options: chainsForCoin(form.coin).other.map((item) => item.label) },
              ]} />
          </StockField>
          <StockField label={chain?.memo ? `Memo / Tag (${chain.label} มักต้องใส่)` : "Memo / Tag"} htmlFor="addr-memo" hint="ใส่เฉพาะเมื่อผู้รับให้มา">
            <input id="addr-memo" value={form.memo} onChange={(event) => set({ memo: event.target.value })} className={stockInputClass} />
          </StockField>
          <div className="sm:col-span-2">
            <StockField label="Address" htmlFor="addr-address" hint="วางจากข้อความของผู้รับโดยตรง อย่าพิมพ์เอง">
              <input id="addr-address" value={form.address} onChange={(event) => set({ address: event.target.value })} className={`${stockInputClass} font-mono`} required autoComplete="off" spellCheck={false} />
            </StockField>
            {check?.warning ? <p className="mt-1 text-xs font-bold text-amber-800">{check.warning}</p> : check && !check.error && chain ? <p className="mt-1 text-xs font-bold text-emerald-700">ตรงกับรูปแบบของ {chain.label}</p> : null}
          </div>
          <div className="sm:col-span-2">
            <StockField label="หมายเหตุ" htmlFor="addr-note" hint="เช่น ผู้รับส่งมาทาง WeChat วันที่ 5/11">
              <input id="addr-note" value={form.note} onChange={(event) => set({ note: event.target.value })} className={stockInputClass} />
            </StockField>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={busy === "add"} className="h-10 rounded-full bg-[#D90005] px-4 text-sm font-extrabold text-white hover:bg-[#B00004] disabled:opacity-50">บันทึก (รออีกคนยืนยัน)</button>
            <button type="button" onClick={() => { setAdding(false); setForm(EMPTY); }} className="h-10 rounded-full border border-zinc-300 px-4 text-sm font-extrabold">ยกเลิก</button>
          </div>
        </form>
      ) : null}

      {groups.length ? groups.map((recipient) => (
        <section key={recipient} className="flex flex-col gap-2">
          <h2 className="text-base font-black">{recipient}</h2>
          {addresses.filter((entry) => entry.recipient === recipient).map((entry) => (
            <CryptoAddressCard key={entry.id} entry={entry}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span>เพิ่มโดย {entry.createdBy || "—"}</span>
                {canEdit && entry.status === "pending" && Number(entry.createdById) !== Number(currentUserId) ? (
                  <button type="button" disabled={busy === entry.id} onClick={() => decide(entry, "confirm")} className="rounded-full bg-emerald-700 px-3 py-1 font-black text-white hover:bg-emerald-800 disabled:opacity-50">
                    เทียบกับข้อความผู้รับแล้ว ยืนยัน
                  </button>
                ) : null}
                {entry.status === "pending" && Number(entry.createdById) === Number(currentUserId) ? <span className="font-bold text-amber-800">รอคนอื่นยืนยัน (คนที่เพิ่มยืนยันเองไม่ได้)</span> : null}
                {canEdit ? (
                  <button type="button" disabled={busy === entry.id} onClick={() => decide(entry, "retire")} className="rounded-full border border-zinc-300 bg-white px-3 py-1 font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">เลิกใช้</button>
                ) : null}
              </div>
            </CryptoAddressCard>
          ))}
        </section>
      )) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center text-sm text-zinc-600">ยังไม่มี address — กด &quot;เพิ่ม address&quot; แล้ววางจากข้อความของผู้รับ</div>
      )}

      {retired.length ? (
        <details className="rounded-2xl border border-zinc-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-extrabold">address ที่เลิกใช้ ({retired.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-600">
            {retired.map((entry) => (
              <li key={entry.id} className="break-all"><b>{entry.recipient}</b> · {entry.coin} · {chainOf(entry.chain)?.label || entry.chain} · <span className="font-mono">{entry.address}</span> · เลิกใช้โดย {entry.retiredBy}: {entry.retiredReason}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
