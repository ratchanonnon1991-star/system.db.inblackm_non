"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { ADDRESS_STATUS_LABELS, addressesFor, addressGroups, chainOf } from "@/lib/stock-addresses";

/** A button that copies one value and says so. */
export function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" onClick={copy} aria-label={`ก็อป ${label}`}
      className={`flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-black ${copied ? "bg-emerald-600 text-white" : "bg-zinc-900 text-white hover:bg-zinc-700"}`}>
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "ก็อปแล้ว" : `ก็อป ${label}`}
    </button>
  );
}

/** One line of the card: what it is, its value, and its copy button on the right. */
function Field({ label, copy, children }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-16 shrink-0 text-xs font-extrabold text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {copy ? <CopyButton value={copy.value} label={copy.label} /> : null}
    </div>
  );
}

/**
 * One saved address, laid out the way Bybit's withdraw form asks for it: coin, chain,
 * address, memo, each with its own copy button. The address is shown in groups of four
 * with the first and last groups bold, to read against the exchange's screen.
 */
export function CryptoAddressCard({ entry, children }) {
  const chain = chainOf(entry.chain);
  const groups = addressGroups(entry.address);
  const usable = entry.status === "confirmed";
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 ${usable ? "border-zinc-200 bg-white" : "border-amber-300 bg-amber-50"}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <b>{entry.recipient}</b>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${usable ? "bg-emerald-50 text-emerald-800" : entry.status === "retired" ? "bg-zinc-200 text-zinc-600" : "bg-amber-200 text-amber-900"}`}>
          {ADDRESS_STATUS_LABELS[entry.status]}
        </span>
        {entry.note ? <span className="text-xs text-zinc-600">{entry.note}</span> : null}
      </div>
      {!usable && entry.status === "pending" ? (
        <p className="flex items-center gap-1 text-xs font-bold text-amber-900"><ShieldAlert size={13} /> ยังห้ามใช้โอน: ต้องให้อีกคนเทียบกับข้อความของผู้รับแล้วกดยืนยันก่อน</p>
      ) : null}
      <div className="flex flex-col divide-y divide-zinc-100 text-sm">
        <Field label="เหรียญ" copy={usable ? { value: entry.coin, label: "เหรียญ" } : null}><b>{entry.coin}</b></Field>
        <Field label="Chain" copy={usable ? { value: chain?.label.replace(/ \(.*\)$/, "") || entry.chain, label: "chain" } : null}><b>{chain?.label || entry.chain}</b></Field>
        <Field label="Address" copy={usable ? { value: entry.address, label: "address" } : null}>
          <span className="break-all font-mono text-[13px]">
            {groups.map((group, index) => (
              <span key={index} className={index === 0 || index === groups.length - 1 ? "font-black text-zinc-950" : "text-zinc-600"}>{group}{index < groups.length - 1 ? " " : ""}</span>
            ))}
          </span>
        </Field>
        {entry.memo ? <Field label="Memo / Tag" copy={usable ? { value: entry.memo, label: "memo" } : null}><b className="break-all font-mono">{entry.memo}</b></Field> : null}
      </div>
      {usable ? (
        <p className="text-xs text-zinc-600">วางแล้วเทียบ 4 ตัวแรก <b className="font-mono">{groups[0]}</b> และ 4 ตัวท้าย <b className="font-mono">{groups[groups.length - 1]}</b> กับหน้า Bybit ก่อนกดยืนยันการโอน · ยืนยันโดย {entry.confirmedBy}</p>
      ) : null}
      {children}
    </div>
  );
}

/** The saved addresses for one recipient and coin, fetched when shown (the pay step of an order). */
export function AddressesForRecipient({ recipient, coin }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    apiJson("/api/stock/addresses", { fallbackError: "อ่าน address ไม่สำเร็จ" })
      .then((data) => { if (live) setList(data.addresses); })
      .catch((err) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, []);
  if (error) return <p className="text-xs font-bold text-red-700">{error}</p>;
  if (!list) return <p className="text-xs text-zinc-500">กำลังหา address ของ {recipient}…</p>;
  const found = addressesFor(list, { recipient, coin });
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <p className="text-[13px] font-extrabold text-zinc-700">โอนไปที่ไหน: address ของ {recipient} ({coin})</p>
      {found.length ? found.map((entry) => <CryptoAddressCard key={entry.id} entry={entry} />) : (
        <p className="rounded-xl bg-white px-3 py-2 text-xs text-zinc-600 ring-1 ring-zinc-200">
          ยังไม่มี address ของ {recipient} ที่ใช้ {coin} — <Link href="/stock/addresses" className="font-extrabold text-[#B00004] hover:underline">เพิ่มที่หน้า ที่อยู่โอน</Link> แล้วให้อีกคนยืนยันก่อนโอน
        </p>
      )}
    </div>
  );
}
