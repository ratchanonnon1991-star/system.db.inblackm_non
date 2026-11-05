"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Minus, RotateCcw, Undo2, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import StockMoveDialog from "@/components/stock-move-dialog";
import { TablePagination, useTablePagination } from "@/components/table-pagination";

const DAY_CHOICES = [7, 14, 30, 60];
const when = (iso) => (iso ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function OrderCells({ order }) {
  return (
    <>
      <td className="whitespace-nowrap px-3.5 py-3 text-zinc-600">{when(order.createdAt)}</td>
      <td className="px-3.5 py-3">
        <p className="font-extrabold">{order.ref}</p>
        {order.orderId && order.orderId !== order.ref ? <p className="max-w-[180px] truncate text-xs text-zinc-600" title={order.orderId}>{order.orderId}</p> : null}
      </td>
      <td className="px-3.5 py-3">
        <p className="font-bold">{order.game}</p>
        <p className="text-xs text-zinc-600">{order.pack || "—"}</p>
      </td>
      <td className="whitespace-nowrap px-3.5 py-3 text-zinc-700">
        {order.price ?? "—"}
        <p className="text-xs text-zinc-600">{[order.status, order.source].filter(Boolean).join(" · ")}</p>
      </td>
    </>
  );
}

/**
 * รอตัด: orders of games we hold stock for with no ตัดออก yet. Each is cut
 * through the usual ตัดออก form, prefilled from the order, or marked
 * "ไม่ได้ใช้ stock" when the bot or another source filled it.
 */
export default function StockPendingOrders({ data, canEdit }) {
  const router = useRouter();
  const [cutting, setCutting] = useState(null);
  const [busyRef, setBusyRef] = useState("");
  const [error, setError] = useState("");
  const pagination = useTablePagination(data.orders, { resetKey: data.days });
  const awaiting = data.awaiting || [];
  const byId = new Map(data.accounts.map((account) => [account.id, account]));

  async function call(busyKey, url, options) {
    setBusyRef(busyKey);
    setError("");
    try {
      await apiJson(url, { headers: { "Content-Type": "application/json" }, fallbackError: "บันทึกไม่สำเร็จ", ...options });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyRef("");
    }
  }
  const send = (order, method) => call(order.ref,
    method === "DELETE" ? `/api/stock/pending-orders?ref=${encodeURIComponent(order.ref)}` : "/api/stock/pending-orders",
    { method, body: method === "DELETE" ? undefined : JSON.stringify({ ref: order.ref, game: order.game, pack: order.pack }) });
  const awaitingCall = (move, method, skip = false) => call(`move-${move.id}`,
    `/api/stock/moves/${move.id}${skip ? "?skip=1" : ""}`, { method });

  const dialogAccounts = cutting ? cutting.accounts.map((account) => byId.get(account.id)).filter(Boolean) : [];
  const defaultAccountId = cutting ? cutting.suggestion?.accountId ?? cutting.accounts[0]?.id : null;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-7 sm:px-7">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-[1_1_360px]">
          <p className="text-xs font-black tracking-[0.12em] text-[#B00004]">STOCK · รอตัด</p>
          <h1 className="mt-1 text-3xl font-extrabold">ออเดอร์รอตัด stock</h1>
          <p className="mt-1.5 text-sm text-zinc-600">
            ออเดอร์ของเกมที่มีไอดี stock แต่ยังไม่ได้ตัดออก · กด &quot;ตัด stock&quot; ถ้าเติมจาก stock หรือ &quot;ไม่ได้ใช้ stock&quot; ถ้าเติมจากที่อื่น
          </p>
        </div>
        <nav aria-label="ช่วงเวลา" className="flex gap-1 rounded-full border border-zinc-300 bg-white p-1">
          {DAY_CHOICES.map((days) => (
            <Link key={days} href={`/stock/pending?days=${days}`} aria-current={data.days === days ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm font-extrabold ${data.days === days ? "bg-[#D90005] text-white" : "text-zinc-700 hover:bg-zinc-100"}`}>
              {days} วัน
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <div className={`rounded-2xl border px-[18px] py-4 ${awaiting.length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-zinc-200 bg-white"}`}>
          <p className="text-[13px]">ระบบตัดให้แล้ว รอยืนยัน</p>
          <p className="mt-1 text-3xl font-black">{awaiting.length} <span className="text-base font-bold">รายการ</span></p>
          <p className="mt-0.5 text-xs">ยอดคงเหลือลดไปแล้ว รอคนเช็ก</p>
        </div>
        <div className={`rounded-2xl border px-[18px] py-4 ${data.orders.length ? "border-red-300 bg-red-50 text-red-900" : "border-zinc-200 bg-white"}`}>
          <p className="text-[13px]">รอตัด</p>
          <p className="mt-1 text-3xl font-black">{data.orders.length} <span className="text-base font-bold">ออเดอร์</span></p>
          <p className="mt-0.5 text-xs">ใน {data.days} วันล่าสุด</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white px-[18px] py-4">
          <p className="text-[13px] text-zinc-600">เดาแพ็คให้ได้</p>
          <p className="mt-1 text-3xl font-black">{data.orders.filter((order) => order.suggestion).length}</p>
          <p className="mt-0.5 text-xs text-zinc-600">ที่เหลือเลือกแพ็คเองในฟอร์ม</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white px-[18px] py-4">
          <p className="text-[13px] text-zinc-600">ไม่ได้ใช้ stock</p>
          <p className="mt-1 text-3xl font-black">{data.skipped.length}</p>
          <p className="mt-0.5 text-xs text-zinc-600">กดข้ามไว้ในช่วงนี้</p>
        </div>
      </div>

      {data.error ? <p className="rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-800">{data.error}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-800">{error}</p> : null}
      {data.truncated ? <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900">ออเดอร์ในช่วงนี้เยอะเกิน แสดงเฉพาะ 1,000 ออเดอร์ล่าสุด ลองเลือกช่วงที่สั้นลง</p> : null}

      {awaiting.length ? (
        <section aria-label="ระบบตัดให้แล้ว รอยืนยัน" className="overflow-hidden rounded-2xl border border-amber-300 bg-white">
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3.5">
            <h2 className="text-base font-extrabold text-amber-900">ระบบตัดให้แล้ว รอยืนยัน ({awaiting.length})</h2>
            <p className="mt-0.5 text-[13px] text-amber-900">เช็กว่าเติมจาก stock แพ็คนี้จริง แล้วกดยืนยัน · ผิดแพ็ค: ยอดคืนและออเดอร์กลับไปรอตัดให้เลือกแพ็คใหม่ · ไม่ได้ใช้ stock: ยอดคืน</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-600">
                <tr>
                  <th className="border-b border-zinc-200 px-3.5 py-3">ตัดเมื่อ</th>
                  <th className="border-b border-zinc-200 px-3.5 py-3">เลขคิว</th>
                  <th className="border-b border-zinc-200 px-3.5 py-3">ออเดอร์</th>
                  <th className="border-b border-zinc-200 px-3.5 py-3">ตัดจาก</th>
                  {canEdit ? <th className="border-b border-zinc-200 px-3.5 py-3 text-right">ทำรายการ</th> : null}
                </tr>
              </thead>
              <tbody>
                {awaiting.map((move) => {
                  const busy = busyRef === `move-${move.id}`;
                  const rejected = Boolean(move.orderStatus) && /reject|cancel/i.test(move.orderStatus);
                  return (
                    <tr key={move.id} className="border-t border-zinc-100 align-top">
                      <td className="whitespace-nowrap px-3.5 py-3 text-zinc-600">{when(move.createdAt)}</td>
                      <td className="px-3.5 py-3 font-extrabold">{move.queue}</td>
                      <td className="px-3.5 py-3">
                        <p className="font-bold">{move.note || "—"}</p>
                        {move.orderStatus ? <p className={`text-xs ${rejected ? "font-extrabold text-red-700" : "text-zinc-600"}`}>สถานะออเดอร์ตอนนี้: {move.orderStatus}{rejected ? " · ควรกดไม่ได้ใช้ stock" : ""}</p> : null}
                      </td>
                      <td className="px-3.5 py-3">
                        <Link href={`/stock/${move.code}`} className="font-extrabold text-[#B00004] hover:underline">{move.code}</Link>
                        <p className="text-xs text-zinc-600">{move.lines.map((line) => `${line.label} × ${line.qty}`).join(", ")}</p>
                      </td>
                      {canEdit ? (
                        <td className="px-3.5 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button type="button" onClick={() => awaitingCall(move, "PATCH")} disabled={busy}
                              className="flex h-9 items-center gap-1.5 rounded-full bg-emerald-700 px-4 text-[13px] font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50">
                              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.6} />} ยืนยัน
                            </button>
                            <button type="button" onClick={() => awaitingCall(move, "DELETE")} disabled={busy}
                              className="flex h-9 items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3.5 text-[13px] font-extrabold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                              <Undo2 size={14} /> ผิดแพ็ค
                            </button>
                            <button type="button" onClick={() => awaitingCall(move, "DELETE", true)} disabled={busy}
                              className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-300 bg-white px-3.5 text-[13px] font-extrabold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                              <X size={14} /> ไม่ได้ใช้ stock
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {data.orders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-600">
                <tr>
                  <th className="border-b border-zinc-200 px-3.5 py-3">เวลา</th>
                  <th className="border-b border-zinc-200 px-3.5 py-3">เลขคิว</th>
                  <th className="border-b border-zinc-200 px-3.5 py-3">เกม · แพ็ค</th>
                  <th className="border-b border-zinc-200 px-3.5 py-3">ราคา · สถานะ</th>
                  <th className="border-b border-zinc-200 px-3.5 py-3">ไอดี stock</th>
                  {canEdit ? <th className="border-b border-zinc-200 px-3.5 py-3 text-right">ทำรายการ</th> : null}
                </tr>
              </thead>
              <tbody>
                {pagination.items.map((order) => {
                  const suggested = order.suggestion ? byId.get(order.suggestion.accountId)?.items?.find((item) => item.id === order.suggestion.itemId) : null;
                  return (
                    <tr key={order.ref} className="border-t border-zinc-100 align-top">
                      <OrderCells order={order} />
                      <td className="px-3.5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {order.accounts.map((account) => (
                            <Link key={account.id} href={`/stock/${account.code}`}
                              className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${order.suggestion?.accountId === account.id ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-700"}`}>
                              {account.code}
                            </Link>
                          ))}
                        </div>
                        {suggested ? <p className="mt-1 text-xs text-emerald-800">{order.suggestion.source === "learned" ? "จำไว้จากครั้งก่อน:" : "น่าจะเป็น"} {suggested.label} · เหลือ {suggested.left}</p> : null}
                      </td>
                      {canEdit ? (
                        <td className="px-3.5 py-3">
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setCutting(order)} disabled={busyRef === order.ref}
                              className="flex h-9 items-center gap-1.5 rounded-full bg-[#D90005] px-4 text-[13px] font-extrabold text-white hover:bg-[#B00004] disabled:opacity-50">
                              <Minus size={14} strokeWidth={2.6} /> ตัด stock
                            </button>
                            <button type="button" onClick={() => send(order, "POST")} disabled={busyRef === order.ref}
                              className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-300 bg-white px-3.5 text-[13px] font-extrabold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                              {busyRef === order.ref ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} ไม่ได้ใช้ stock
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pagination.showControls ? <TablePagination {...pagination} label="รายการรอตัด" /> : null}
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-zinc-600">{data.error ? "—" : `ไม่มีออเดอร์รอตัดใน ${data.days} วันล่าสุด`}</p>
        )}
      </section>

      {data.skipped.length ? (
        <details className="rounded-2xl border border-zinc-200 bg-white">
          <summary className="cursor-pointer px-5 py-4 text-sm font-extrabold text-zinc-700">ที่กดว่าไม่ได้ใช้ stock ({data.skipped.length})</summary>
          <div className="overflow-x-auto border-t border-zinc-100">
            <table className="w-full min-w-[760px] text-left text-sm">
              <tbody>
                {data.skipped.map((order) => (
                  <tr key={order.ref} className="border-t border-zinc-100 align-top first:border-t-0">
                    <OrderCells order={order} />
                    <td className="px-3.5 py-3 text-xs text-zinc-600">โดย {order.skippedBy || "—"}<br />{when(order.skippedAt)}</td>
                    {canEdit ? (
                      <td className="px-3.5 py-3 text-right">
                        <button type="button" onClick={() => send(order, "DELETE")} disabled={busyRef === order.ref}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3.5 text-[13px] font-extrabold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                          <RotateCcw size={14} /> เอากลับไปรอตัด
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      {cutting ? (
        <StockMoveDialog
          key={cutting.ref}
          kind="out"
          accounts={dialogAccounts}
          defaultAccountId={defaultAccountId}
          initialItemId={cutting.suggestion && cutting.suggestion.accountId === defaultAccountId ? cutting.suggestion.itemId : null}
          initialQueue={cutting.ref}
          initialNote={[cutting.game, cutting.pack].filter(Boolean).join(" · ").slice(0, 200)}
          order={cutting}
          onClose={() => setCutting(null)}
        />
      ) : null}
    </div>
  );
}
