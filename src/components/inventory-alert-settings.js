"use client";

import PaginatedTable from "@/components/table-pagination";
import { useEffect, useRef, useState } from "react";
import { isLowStock } from "@/lib/inventory-alerts";
import { TOPUP_INVENTORY_PROVIDERS } from "@/lib/topup-inventory";

const inputClass = "min-h-11 w-36 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-ll-ink";
const buttonClass = "min-h-11 rounded-lg border border-ll-hairline-strong px-3 text-sm disabled:opacity-50";
const dateLabel = value => value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ยังไม่มีข้อมูล";

function ChannelRow({ channel, canManage, onSaved }) {
  const [target, setTarget] = useState(channel.target ?? "");
  const [saved, setSaved] = useState(channel.target);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const low = isLowStock(channel.balance, saved);
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/projectm/inventory-alerts", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: channel.key, target: target.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "บันทึกไม่สำเร็จ");
      setSaved(target.trim() || null); onSaved(channel.key, target.trim() || null); setMessage("บันทึกแล้ว");
    } catch (error) { setMessage(error.message || "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return <tr className="border-t border-ll-hairline">
    <td className="max-w-72 break-words p-3 align-top"><p className="font-medium">{channel.label}</p><p className="text-xs text-ll-ink-subtle">{channel.provider} · {channel.currency}</p></td>
    <td className="p-3 align-top"><p>{channel.balance ?? "ไม่ทราบยอด"} {channel.currency}</p>
      <p className="text-xs text-ll-ink-subtle">ยอด ณ {dateLabel(channel.balanceAt)}</p>
      {channel.syncedAt && <p className="text-xs text-ll-ink-subtle">ซิงก์ยอดบอทล่าสุด: {dateLabel(channel.syncedAt)}</p>}
      <p className="text-xs text-ll-ink-subtle">{channel.source}</p></td>
    <td className="p-3 align-top"><form onSubmit={save} className="flex flex-wrap items-start gap-2">
      <label><span className="sr-only">ยอดเป้าหมาย {channel.label} {channel.currency}</span>
        <input className={inputClass} type="number" min="0.01" max="999999999999.99" step="0.01" placeholder="ปิดแจ้งเตือน"
          value={target} disabled={!canManage || busy} onChange={e => setTarget(e.target.value)} /></label>
      {canManage && <button className={buttonClass} disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>}
      <p role="status" className="w-full text-xs">{message}</p>
    </form></td>
    <td className="p-3 align-top text-sm"><p>{saved === null ? "ปิดอยู่" : low === null ? "รอยอดที่ยืนยันได้" : low ? "⚠ ต่ำกว่า 50%" : "ปกติ"}</p>
      <p className="text-xs text-ll-ink-subtle">ตรวจล่าสุด: {dateLabel(channel.lastCheckedAt)}</p>
      <p className="text-xs text-ll-ink-subtle">ส่งล่าสุด: {dateLabel(channel.lastSentAt)}</p>
      {channel.lastError && <p className="mt-1 text-xs" role="status">{channel.lastError}</p>}</td>
  </tr>;
}

export default function InventoryAlertSettings() {
  const [data, setData] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(true), [revision, setRevision] = useState(0);
  const [provider, setProvider] = useState("");
  const savedRevision = useRef(0);
  useEffect(() => {
    const controller = new AbortController(); let timer;
    async function load() {
      const beforeSave = savedRevision.current;
      try {
        const response = await fetch("/api/projectm/inventory-alerts", { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "โหลดข้อมูลไม่สำเร็จ");
        if (!controller.signal.aborted && beforeSave === savedRevision.current) { setData(result); setError(""); }
      } catch (e) { if (!controller.signal.aborted) setError(e.message || "โหลดข้อมูลไม่สำเร็จ"); }
      finally {
        if (!controller.signal.aborted) { setBusy(false); timer = setTimeout(load, 30_000); }
      }
    }
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision]);
  const providers = [...new Set([...(data?.channels ?? []).map(channel => channel.provider), ...(data?.errors ?? []).map(error => error.provider)])];
  const channels = (data?.channels ?? []).filter(channel => channel.provider === provider);
  const providerErrors = (data?.errors ?? []).filter(error => error.provider === provider);
  function onSaved(key, target) {
    savedRevision.current++;
    setData(current => ({ ...current, channels: current.channels.map(channel => channel.key === key ? { ...channel, target } : channel) }));
  }
  return <div className="space-y-5">
    <p className="text-sm text-ll-ink-subtle">ตั้งยอดเป้าหมายแยกแต่ละบัญชีตามหน่วยเดิม เช่น ตั้ง 1,000 จะเตือนเมื่อเหลือน้อยกว่า 500 เว้นว่างแล้วบันทึกเพื่อปิด เฉพาะ Projectm Admin แก้ไขได้</p>
    <p className="text-sm text-ll-ink-subtle">หน้าเว็บรีเฟรชยอดทุก 30 วินาที ตรวจแจ้งเตือนทุก 1 นาทีขณะ worker ทำงาน ส่งครั้งเดียวต่อรอบยอดต่ำ และเริ่มรอบใหม่เมื่อยอดกลับมาถึง 50% การเปลี่ยนยอดเป้าหมายเริ่มรอบใหม่ ใช้ยอดล่าสุดที่บอทหรือระบบบัญชีบันทึกไว้ หากไม่ทราบยอดจะไม่ส่งแจ้งเตือน</p>
    <button className={buttonClass} disabled={busy} onClick={() => { setBusy(true); setError(""); setRevision(r => r + 1); }}>{busy ? "กำลังโหลดยอด…" : "โหลดยอดและสถานะใหม่"}</button>
    {error && <p role="alert">{error}</p>}
    {data && <>
      <p role="status" className="rounded-lg border border-ll-hairline p-3 text-sm">{data.telegramConfigured ? "ตั้งค่า Telegram บนเซิร์ฟเวอร์แล้ว" : "ยังไม่ได้ตั้งค่า Bot Token และ Channel ID บนเซิร์ฟเวอร์"} · {data.workerEnabled ? "เปิดใช้งานแจ้งเตือนใน config แล้ว" : "ยังปิดใช้งานแจ้งเตือนใน config"} (ดูเวลาตรวจล่าสุดเพื่อยืนยันว่า worker ทำงาน)</p>
      <label className="block max-w-sm space-y-2 text-sm font-medium"><span>ช่องทาง</span>
        <select className={`${inputClass} w-full`} value={provider} onChange={event => setProvider(event.target.value)}>
          <option value="">เลือกช่องทาง</option>
          {providers.map(key => <option key={key} value={key}>{TOPUP_INVENTORY_PROVIDERS.find(item => item.key === key)?.name ?? key}</option>)}
        </select>
      </label>
      {providerErrors.length > 0 && <p role="alert" className="text-sm">อ่านยอดไม่สำเร็จ: {providerErrors.map(e => e.provider).join(", ")} — ไม่ใช้ยอดอ้างอิงแทนยอดจริง</p>}
      {channels.length > 0 && <div className="overflow-x-auto rounded-lg border border-ll-hairline"><PaginatedTable items={channels} resetKey={provider}>{(tablePageItems, tablePageStart, tableAllItems) => (<table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-ll-surface-2"><tr>{["ช่องทาง / บัญชี", "ยอดคงเหลือที่บันทึกล่าสุด", "ยอดเป้าหมาย", "สถานะแจ้งเตือน"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
        <tbody>{tablePageItems.map((tableItem, tableIndex) => (channel => <ChannelRow key={`${revision}:${channel.key}`} channel={channel} canManage={data.canManage} onSaved={onSaved} />)(tableItem, tablePageStart + tableIndex, tableAllItems))}</tbody>
      </table>)}</PaginatedTable></div>}
      {!provider ? <p className="text-sm" role="status">เลือกช่องทางเพื่อดูบัญชีและตั้งค่าแจ้งเตือน</p>
        : !channels.length && <p className="text-sm" role="status">ยังไม่พบบัญชีในช่องทางนี้</p>}
      <p className="text-xs text-ll-ink-subtle">Moniepoint ยังไม่เปิด Inventory จึงยังไม่รองรับแจ้งเตือน บัญชีที่แยกยอดไม่ได้จะแสดงว่าไม่ทราบยอด</p>
    </>}
    <details className="rounded-lg border border-ll-hairline p-4 text-sm">
      <summary className="cursor-pointer font-medium">วิธีตั้งค่าบอท Telegram</summary>
      <ol className="ml-5 mt-3 list-decimal space-y-2">
        <li>เปิด <a className="underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> ส่ง /newbot ตั้งชื่อและ username ที่ลงท้ายด้วย bot แล้วเก็บ Token เป็นความลับ</li>
        <li>เข้า channel ที่สร้างไว้ เพิ่มบอทเป็น Administrator และเปิดสิทธิ์ Post Messages</li>
        <li>Channel สาธารณะใช้ @channel_username; Channel ส่วนตัวใช้ ID ตัวเลข -100… จาก channel_post.chat.id ผ่าน getUpdates หลังโพสต์ข้อความใหม่ใน channel</li>
        <li>ตั้งค่า TOPUP_TELEGRAM_BOT_TOKEN, TOPUP_TELEGRAM_CHAT_ID และ TOPUP_INVENTORY_ALERTS_ENABLED=true ใน .env ของเซิร์ฟเวอร์ แล้วเริ่ม inventory-alert-worker ตามคู่มือ TOPUP_TELEGRAM_SETUP.md ในโปรเจกต์</li>
        <li>กลับมาหน้านี้ตั้งยอดเป้าหมาย เมื่อบันทึกยอดที่ต่ำกว่า 50% อยู่แล้ว ระบบจะส่งในรอบตรวจถัดไป</li>
      </ol>
    </details>
  </div>;
}
