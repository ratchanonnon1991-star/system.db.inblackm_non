"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { STOCK_ACCOUNT_PLATFORMS, STOCK_ACCOUNT_STATUS_LABELS, STOCK_ACCOUNT_STATUSES, STOCK_DEFAULT_LOW_AT } from "@/lib/stock";
import { StockDialog, StockField, stockInputClass } from "@/components/stock-ui";
import StockGamePicker from "@/components/stock-game-picker";
import StockWebPackPicker from "@/components/stock-web-pack-picker";

function useSave(onClose) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function run(request, after) {
    setSaving(true);
    setError("");
    try {
      const result = await request();
      if (after) after(result);
      else router.refresh();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, run };
}

function Footer({ onClose, saving, label }) {
  return (
    <>
      <button type="button" onClick={onClose} className="h-11 rounded-full border border-zinc-300 bg-white px-5 text-sm font-extrabold text-zinc-700">ยกเลิก</button>
      <button type="submit" disabled={saving} className="flex h-11 items-center gap-2 rounded-full bg-[#D90005] px-6 text-sm font-black text-white hover:bg-[#B00004] disabled:opacity-50">
        {saving ? <Loader2 size={16} className="animate-spin" /> : null}{label}
      </button>
    </>
  );
}

/** Add a stock account (no `account`) or edit one. */
export function StockAccountDialog({ account = null, games, onClose }) {
  const router = useRouter();
  const [form, setForm] = useState({
    code: account?.code || "",
    gameId: account?.gameId ? String(account.gameId) : "",
    dataMode: account?.dataMode || "uid",
    platform: account?.platform || "",
    status: account?.status || "active",
    note: account?.note || "",
    autoCut: account?.autoCut === true,
    webSoldOut: account?.webSoldOut === true,
  });
  const { saving, error, run } = useSave(onClose);
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  function submit(event) {
    event.preventDefault();
    const game = games.find((item) => String(item.id) === form.gameId);
    const body = { ...form, gameId: form.gameId || null, gameName: game?.name || account?.gameName || "" };
    run(
      () => apiJson(account ? `/api/stock/accounts/${account.id}` : "/api/stock/accounts", {
        method: account ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        fallbackError: "บันทึกไอดีไม่สำเร็จ",
      }),
      (result) => {
        const code = result.account?.code;
        if (code && code !== account?.code) router.push(`/stock/${code}`);
        else router.refresh();
      }
    );
  }

  return (
    <form onSubmit={submit}>
      <StockDialog title={account ? `แก้ไขไอดี ${account.code}` : "เพิ่มไอดี stock"} subtitle="หนึ่งไอดีคือหนึ่งบัญชีที่ซื้อของตุนไว้" onClose={onClose} footer={<Footer onClose={onClose} saving={saving} label="บันทึก" />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <StockField label="ไอดี" htmlFor="stock-code" hint="a-z 0-9 . _ - เช่น pes1">
            <input id="stock-code" value={form.code} onChange={(event) => set({ code: event.target.value })} className={stockInputClass} required autoFocus={!account} />
          </StockField>
          <StockField label="โหมด" htmlFor="stock-mode">
            <select id="stock-mode" value={form.dataMode} onChange={(event) => set({ dataMode: event.target.value })} className={stockInputClass}>
              <option value="uid">UID</option><option value="idpass">ID-PASS</option>
            </select>
          </StockField>
        </div>
        <StockField label="แพลตฟอร์มของของในไอดีนี้" htmlFor="stock-platform" hint="เลือก iOS หรือ Android แล้ว ออเดอร์ที่ระบุอีกฝั่งจะไม่เข้าหน้ารอตัดและไม่ถูกตัดอัตโนมัติจากไอดีนี้">
          <select id="stock-platform" value={form.platform} onChange={(event) => set({ platform: event.target.value })} className={stockInputClass}>
            {Object.entries(STOCK_ACCOUNT_PLATFORMS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </StockField>
        <StockField label="เกมใน GameInfo" htmlFor="stock-game" hint={games.length ? "แพ็คในไอดีนี้จะขึ้นป้าย stock ในหน้าเกมนั้น" : "ต่อ GameInfo ไม่ได้ตอนนี้ — เลือกเกมทีหลังได้"}>
          <StockGamePicker id="stock-game" games={games.map((game) => ({ key: String(game.id), name: game.name }))} value={String(form.gameId ?? "")}
            onPick={(gameId) => set({ gameId })} noneLabel="ยังไม่เลือก" placeholder="ยังไม่เลือก · พิมพ์ชื่อเกม" />
        </StockField>
        {account ? (
          <StockField label="สถานะ" htmlFor="stock-status">
            <select id="stock-status" value={form.status} onChange={(event) => set({ status: event.target.value })} className={stockInputClass}>
              {STOCK_ACCOUNT_STATUSES.map((status) => <option key={status} value={status}>{STOCK_ACCOUNT_STATUS_LABELS[status]}</option>)}
            </select>
          </StockField>
        ) : null}
        {account ? (
          <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3">
            <input type="checkbox" checked={form.autoCut} onChange={(event) => set({ autoCut: event.target.checked })} className="mt-1 h-4 w-4 accent-[#D90005]" />
            <span className="text-[13px] text-zinc-700">
              <b className="text-zinc-900">ตัด stock อัตโนมัติจากออเดอร์</b><br />
              เปิดเฉพาะเกมที่เติมจาก stock ทุกออเดอร์ · ระบบตัดเฉพาะออเดอร์ใหม่หลังเปิด และเฉพาะแพ็คที่เคยตัดเองมาก่อน แล้วรอคนกดยืนยันในหน้ารอตัด
            </span>
          </label>
        ) : null}
        {account ? (
          <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3">
            <input type="checkbox" checked={form.webSoldOut} onChange={(event) => set({ webSoldOut: event.target.checked })} className="mt-1 h-4 w-4 accent-[#D90005]" />
            <span className="text-[13px] text-zinc-700">
              <b className="text-zinc-900">ซิงค์ของหมดไปเว็บหลัก</b><br />
              เปิด: แพ็คที่ยอดเหลือ 0 จะเป็นสีเทาและกดซื้อไม่ได้บนเว็บ · ปิด: ไม่ยุ่งกับเว็บเลย ของหมดลูกค้าก็ยังซื้อได้
            </span>
          </label>
        ) : null}
        <StockField label="หมายเหตุ" htmlFor="stock-account-note" hint="อย่าใส่รหัสผ่านบัญชี — เก็บไว้ใน password manager">
          <input id="stock-account-note" value={form.note} onChange={(event) => set({ note: event.target.value })} className={stockInputClass} placeholder="เช่น ช่องทางซื้อ, ผู้ดูแล" />
        </StockField>
        {error ? <p className="rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-800">{error}</p> : null}
      </StockDialog>
    </form>
  );
}

/** Add a pack to an account (no `item`) or edit one. */
export function StockItemDialog({ accountId, item = null, packNames, webGameId = null, onClose }) {
  const [form, setForm] = useState({
    label: item?.label || "",
    unitUsd: item?.unitUsd != null ? String(item.unitUsd) : "",
    lowAt: String(item?.lowAt ?? STOCK_DEFAULT_LOW_AT),
    packName: item?.packName || "",
    webPackageIds: item?.webPackageIds || [],
  });
  const { saving, error, run } = useSave(onClose);
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  function submit(event) {
    event.preventDefault();
    run(() => apiJson(item ? `/api/stock/items/${item.id}` : `/api/stock/accounts/${accountId}/items`, {
      method: item ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, lowAt: Number(form.lowAt) }),
      fallbackError: "บันทึกแพ็คไม่สำเร็จ",
    }));
  }

  return (
    <form onSubmit={submit}>
      <StockDialog title={item ? `แก้ไขแพ็ค ${item.label}` : "เพิ่มแพ็ค"} onClose={onClose} footer={<Footer onClose={onClose} saving={saving} label="บันทึก" />}>
        <div className="grid gap-3 sm:grid-cols-3">
          <StockField label="ชื่อแพ็ค" htmlFor="stock-item-label">
            <input id="stock-item-label" value={form.label} onChange={(event) => set({ label: event.target.value })} className={stockInputClass} required placeholder="เช่น 550 Coins" />
          </StockField>
          <StockField label="มูลค่า (USD)" htmlFor="stock-item-usd">
            <input id="stock-item-usd" inputMode="decimal" value={form.unitUsd} onChange={(event) => set({ unitUsd: event.target.value })} className={stockInputClass} placeholder="4.8" />
          </StockField>
          <StockField label="แจ้งเมื่อต่ำกว่า" htmlFor="stock-item-low">
            <input id="stock-item-low" type="number" min="0" step="1" value={form.lowAt} onChange={(event) => set({ lowAt: event.target.value })} className={stockInputClass} />
          </StockField>
        </div>
        <StockField label="แพ็คใน GameInfo" htmlFor="stock-item-pack" hint={packNames.length ? "พิมพ์หรือเลือกชื่อให้ตรงกับแพ็คในหน้าเกม" : "เลือกเกมให้ไอดีนี้ก่อน ถึงจะมีรายชื่อแพ็คให้เลือก"}>
          <input id="stock-item-pack" list="stock-pack-names" value={form.packName} onChange={(event) => set({ packName: event.target.value })} className={stockInputClass} placeholder="ไม่ผูกก็ได้" />
          <datalist id="stock-pack-names">{packNames.map((name) => <option key={name} value={name} />)}</datalist>
        </StockField>
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-extrabold text-zinc-700">แพ็คบนเว็บหลัก</p>
          <StockWebPackPicker value={form.webPackageIds} onChange={(webPackageIds) => set({ webPackageIds })} defaultGameId={webGameId} />
          <p className="text-xs text-zinc-600">ยอดของแพ็คนี้จะขึ้นบนการ์ดแพ็คที่เลือก และใช้ตัดสินว่าแพ็คนั้นหมดหรือไม่ เลือกได้หลายแพ็ค</p>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-800">{error}</p> : null}
      </StockDialog>
    </form>
  );
}
