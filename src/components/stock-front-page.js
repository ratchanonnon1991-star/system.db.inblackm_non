import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, PackageX, Wallet } from "lucide-react";
import { PO_ACTION_LABELS, PO_STATUS_LABELS } from "@/lib/stock-purchase-orders";
import { WALLET_ENTRY_LABELS } from "@/lib/stock-wallets";
import { stockAppLinkDaysText } from "@/lib/stock-app-links";
import StockAppLinks from "@/components/stock-app-links";

// The Stock front page (src/lib/stock-overview.js): orders to chase, wallet
// balances, packs running out and whether something is already on the way.

const formatTime = (value) => (value ? new Date(value).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "");
const formatAmount = (value) => {
  const [whole, frac] = String(value ?? "0").split(".");
  return `${Number(whole).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
};
// stock-ui.js is a client module, so its helpers cannot run in this server component.
const formatStockNumber = (value, digits = 2) => (value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: digits }));
const waited = (days) => (days == null ? "" : days === 0 ? "วันนี้" : `${days} วัน`);

const FOLLOW_UPS = [
  { status: "requested", tone: "border-sky-200 bg-sky-50 text-sky-900", hint: () => "ต้องให้คนอื่นอนุมัติก่อนโอน" },
  { status: "approved", tone: "border-cyan-200 bg-cyan-50 text-cyan-900", hint: () => "อนุมัติแล้ว ยังไม่ได้โอนเงิน" },
  { status: "paid", tone: "border-amber-300 bg-amber-50 text-amber-900", hint: (step) => `≈ ฿${formatStockNumber(step.thb, 0)} · ซัพยังไม่รับออเดอร์` },
  { status: "accepted", tone: "border-yellow-300 bg-yellow-50 text-yellow-900", hint: () => "ซัพตอบรับแล้ว รอของเข้า" },
  { status: "delivered", tone: "border-violet-300 bg-violet-50 text-violet-900", hint: () => "ส่งของแล้ว ต้องให้คนอื่นตรวจ" },
  { status: "partial", tone: "border-orange-300 bg-orange-50 text-orange-900", hint: (step) => `ยังค้าง ${step.stillToCome} ชิ้น` },
  { status: "refund_requested", tone: "border-red-300 bg-red-50 text-red-900", hint: (step) => (step.byCurrency.length ? `รอได้คืน ${step.byCurrency.map((item) => `${formatAmount(item.amount)} ${item.currency}`).join(" · ")}` : "ไม่มีเงินค้างคืน") },
];

export default function StockFrontPage({ overview, events, entries, adjusts = [], links = [], canEdit = false, accountCount }) {
  const { followUps, lowPacks, wallets, shortfalls, openCount } = overview;
  const activity = [
    ...events.map((event) => ({
      key: `po-${event.id}`, at: event.createdAt, actor: event.actorName,
      text: `${PO_ACTION_LABELS[event.action] || event.action} ${event.orderCode} · ${event.supplier}`,
      tag: PO_STATUS_LABELS[event.toStatus] || event.toStatus, href: `/stock/purchase-orders?open=${event.orderId}`,
    })),
    ...entries.filter((entry) => !entry.orderId).map((entry) => ({
      key: `w-${entry.id}`, at: entry.occurredAt, actor: entry.actorName,
      text: `${WALLET_ENTRY_LABELS[entry.kind]} ${entry.legs.map((leg) => `${leg.walletName} ${leg.amount.startsWith("-") ? "−" : "+"}${formatAmount(leg.amount.replace("-", ""))} ${leg.currency}`).join(" → ")}`,
      tag: entry.title, href: "/stock/wallets",
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-7 sm:px-7">
      <div>
        <p className="text-xs font-black tracking-[0.12em] text-[#B00004]">STOCK · ภาพรวม</p>
        <h1 className="mt-1 text-3xl font-extrabold">{openCount ? `มี ${openCount} ใบสั่งซื้อที่ยังไม่จบ` : "ไม่มีใบสั่งซื้อค้าง"}</h1>
        <p className="mt-1.5 text-sm text-zinc-600">ดูว่าแต่ละใบอยู่ขั้นไหน ของอะไรใกล้หมด และกระเป๋าไหนเงินไม่พอ · คลัง {accountCount} ไอดี</p>
      </div>

      {shortfalls.length ? (
        <div className="flex flex-col gap-2">
          {shortfalls.map((item) => (
            <Link key={item.currency} href="/stock/wallets" className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 hover:bg-red-100/60">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>ใบที่ยังไม่โอนต้องจ่าย <b>{formatAmount(item.need)} {item.currency}</b> แต่ {item.wallet} มีแค่ <b>{formatAmount(item.have)}</b> — ย้ายเงินเข้ามาก่อน (เช่น BITKUB → Bybit)</span>
            </Link>
          ))}
        </div>
      ) : null}

      {links.some((link) => link.tone !== "ok") ? (
        <a href="#app-links-section" className="flex flex-col gap-1 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100/60">
          <span><b>ลิงก์แอปเติมใกล้หมดอายุ / หมดแล้ว</b> — ต่ออายุหรือเปลี่ยนลิงก์ก่อนใช้งานไม่ได้</span>
          {links.filter((link) => link.tone !== "ok").map((link) => (
            <span key={link.id} className="text-[13px]">{link.name} · {stockAppLinkDaysText(link.daysLeft)} ({link.expiresOn})</span>
          ))}
        </a>
      ) : null}

      {adjusts.length ? (
        <Link href="/stock/wallets" className="flex flex-col gap-1 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900 hover:bg-cyan-100/60">
          <span><b>ปรับยอดกระเป๋าเก่า {adjusts.length} รายการค้างรออนุมัติ</b> — ยอดยังไม่เปลี่ยนจนกว่าจะกดอนุมัติ</span>
          {adjusts.slice(0, 3).map((entry) => (
            <span key={entry.id} className="text-[13px]">
              {entry.legs.map((leg) => `${leg.walletName} ${leg.amount.startsWith("-") ? "−" : "+"}${formatAmount(leg.amount.replace("-", ""))} ${leg.currency}`).join(", ")} · {entry.note} · โดย {entry.actorName}
            </span>
          ))}
        </Link>
      ) : null}

      <section aria-labelledby="follow-ups" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="follow-ups" className="text-lg font-black">ต้องตาม</h2>
          <Link href="/stock/purchase-orders" className="flex items-center gap-1 text-sm font-extrabold text-[#B00004] hover:underline">ใบสั่งซื้อทั้งหมด <ArrowRight size={14} /></Link>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
          {FOLLOW_UPS.map(({ status, tone, hint }) => {
            const step = followUps[status];
            return (
              <div key={status} className={`flex flex-col rounded-2xl border px-[18px] py-4 ${step.count ? tone : "border-zinc-200 bg-white text-zinc-500"}`}>
                <p className="text-[13px] font-extrabold">{PO_STATUS_LABELS[status]}</p>
                <p className="mt-1 text-3xl font-black">{step.count} <span className="text-base font-bold">ใบ</span></p>
                <p className="mt-0.5 text-xs">{step.count ? hint(step) : "ไม่มี"}{step.count && step.oldestDays ? ` · นานสุด ${waited(step.oldestDays)}` : ""}</p>
                {step.orders.length ? (
                  <ul className="mt-3 flex flex-col gap-1 border-t border-current/15 pt-2 text-[13px]">
                    {step.orders.slice(0, 3).map((order) => (
                      <li key={order.id}>
                        <Link href={`/stock/purchase-orders?open=${order.id}`} className="flex justify-between gap-2 hover:underline">
                          <span className="truncate"><b>{order.code}</b> {order.supplier}{order.supplierRef ? ` · #${order.supplierRef}` : ""}</span>
                          <span className="shrink-0 font-bold">{waited(order.waitingDays)}</span>
                        </Link>
                      </li>
                    ))}
                    {step.orders.length > 3 ? <li className="text-xs">และอีก {step.orders.length - 3} ใบ</li> : null}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section aria-labelledby="wallets" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 id="wallets" className="text-lg font-black">กระเป๋าเงิน</h2>
            <Link href="/stock/wallets" className="flex items-center gap-1 text-sm font-extrabold text-[#B00004] hover:underline">ดูรายการ <ArrowRight size={14} /></Link>
          </div>
          <div className="flex flex-col divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
            {wallets.map((wallet) => (
              <div key={wallet.id} className="flex items-start gap-3 px-[18px] py-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white"><Wallet size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-black">{wallet.name}</p>
                  <p className="text-xs text-zinc-600">{wallet.role}</p>
                </div>
                <div className="text-right text-sm">
                  {wallet.balances.map((item) => (
                    <p key={item.currency} className={shortfalls.some((short) => short.currency === item.currency && short.wallet === wallet.name) ? "font-black text-red-700" : "font-extrabold"}>
                      {formatAmount(item.balance)} <span className="text-xs font-bold text-zinc-600">{item.currency}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="low-packs" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 id="low-packs" className="text-lg font-black">ของใกล้หมด / หมด</h2>
            <Link href="/stock/inventory" className="flex items-center gap-1 text-sm font-extrabold text-[#B00004] hover:underline">ดูคลัง <ArrowRight size={14} /></Link>
          </div>
          {lowPacks.length ? (
            <div className="flex flex-col divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
              {lowPacks.map((pack) => (
                <div key={pack.itemId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[18px] py-3 text-sm">
                  <span className={`inline-block min-w-11 rounded-full px-2.5 py-1 text-center text-[13px] font-black ${pack.tone === "empty" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{Number(pack.left) > 0 ? `เหลือ ${pack.left}` : "หมดแล้ว"}</span>
                  <Link href={`/stock/${pack.accountCode}`} className="font-extrabold hover:underline">{pack.accountCode} · {pack.label}</Link>
                  <span className="text-xs text-zinc-600">{pack.gameName ? `${pack.gameName} · ` : ""}แจ้งเตือนเมื่อเหลือ ≤ {pack.lowAt}</span>
                  <span className="ml-auto text-[13px]">
                    {pack.incoming.length ? (
                      <span className="flex items-center gap-1 font-bold text-emerald-700"><CheckCircle2 size={14} /> กำลังมา {pack.incoming.map((item) => `${item.qty} (${item.code} · ${PO_STATUS_LABELS[item.status]})`).join(", ")}</span>
                    ) : pack.refunding ? (
                      <span className="flex items-center gap-1 font-bold text-red-700"><PackageX size={14} /> ใบเดิมขอคืนเงิน — ต้องสั่งใหม่</span>
                    ) : (
                      <span className="flex items-center gap-1 font-bold text-amber-800"><AlertTriangle size={14} /> ยังไม่มีใบสั่งซื้อ</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-8 text-center text-sm text-zinc-600">ไม่มีแพ็คที่ใกล้หมด</p>
          )}
        </section>
      </div>

      <StockAppLinks links={links} canEdit={canEdit} />

      <section aria-labelledby="activity" className="flex flex-col gap-3">
        <h2 id="activity" className="text-lg font-black">รายการล่าสุด</h2>
        {activity.length ? (
          <ol className="flex flex-col divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
            {activity.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-[18px] py-2.5 text-sm hover:bg-zinc-50">
                  <span className="font-extrabold">{item.text}</span>
                  {item.tag ? <span className="text-xs text-zinc-600">{item.tag}</span> : null}
                  <span className="ml-auto text-xs text-zinc-600">{item.actor || "—"} · {formatTime(item.at)}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-8 text-center text-sm text-zinc-600">ยังไม่มีรายการ</p>
        )}
      </section>
    </div>
  );
}
