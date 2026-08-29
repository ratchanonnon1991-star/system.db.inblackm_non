"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, Copy, Droplets, Loader2, Merge, Pencil, Plus, Trash2, User } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { fmtDate, fmtIdr, fmtKyat, fmtMoney, fmtMyr, fmtPct, fmtPhp, fmtPoints, fmtUsd, netSaleDisplay } from "@/lib/profit-format";
import { commitOverrideEdit } from "@/lib/profit-conflict";
import ProfitSummaryGrid from "@/components/profit-summary-grid";
import { useProfitCanEdit } from "@/components/profit-capabilities-context";
import ProfitModal, { ProfitField, profitInputClass } from "@/components/profit-modal";
import PlatformSelect, { platformLabel } from "@/components/profit-platform-select";

function matchesQuery(q, parts) {
  if (!q) return true;
  const hay = parts.filter((p) => p != null && p !== "").join(" ").toLowerCase();
  return hay.includes(q);
}

export default function ProfitCardPage() {
  const { categoryId, cardId } = useParams();
  // Keyed so switching cards mounts a fresh instance instead of briefly
  // showing the previous card's orders while the new fetch is in flight.
  return <ProfitCardPageContent key={`${categoryId}:${cardId}`} categoryId={categoryId} cardId={cardId} />;
}

function ProfitCardPageContent({ categoryId, cardId }) {
  const router = useRouter();
  const canEdit = useProfitCanEdit();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [platforms, setPlatforms] = useState([]);

  const load = useCallback(() => {
    apiJson(`/api/profit/categories/${categoryId}/cards/${cardId}`, { fallbackError: "โหลดรายละเอียดบัตรไม่สำเร็จ" })
      .then((res) => setData(res))
      .catch((err) => setError(err.message));
  }, [categoryId, cardId]);

  useEffect(() => {
    load();
  }, [load]);

  // Platform names for the "แพลตฟอร์ม" dropdown -- non-critical, so a failed
  // fetch just leaves the dropdown showing only whatever's already tagged.
  useEffect(() => {
    apiJson("/api/profit/sale-prices/summary", { fallbackError: "โหลดรายชื่อแพลตฟอร์มไม่สำเร็จ" })
      .then((res) => setPlatforms((res.platforms || []).map((p) => p.platform)))
      .catch(() => {});
  }, []);

  // Which raw override field (see gocashOrderView/oxideOrderView) backs each
  // editable column -- the baseline sent as `expected` so the server can
  // tell if someone else already changed this exact field since this order
  // was loaded (see commitOverrideEdit / assertOverrideUnchanged).
  const OVERRIDE_BASELINE_FIELD = { platform: "overridePlatform", saleAmount: "overrideSaleAmount", cost: "overrideCost" };

  const editOrder = (o, field, value) => {
    if (o.id.startsWith("gocash:")) {
      const historyId = o.id.split(":")[1];
      return commitOverrideEdit({
        save: (includeExpected) => apiJson(`/api/profit/gocash/history/${historyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [field]: value,
            ...(includeExpected ? { expected: { [field]: o[OVERRIDE_BASELINE_FIELD[field]] } } : {}),
          }),
          fallbackError: "แก้ไขยอดไม่สำเร็จ",
        }),
        reload: load,
      });
    }
    if (o.id.startsWith("oxide-order:")) {
      const oxideOrderId = o.id.split(":")[1];
      return commitOverrideEdit({
        save: (includeExpected) => apiJson(`/api/profit/oxide/orders/${oxideOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [field]: value,
            ...(includeExpected ? { expected: { [field]: o[OVERRIDE_BASELINE_FIELD[field]] } } : {}),
          }),
          fallbackError: "แก้ไขยอดไม่สำเร็จ",
        }),
        reload: load,
      });
    }
    if (o.id.startsWith("wavepay-order:")) {
      const wavepayOrderId = o.id.split(":")[1];
      return commitOverrideEdit({
        save: (includeExpected) => apiJson(`/api/profit/wavepay/orders/${wavepayOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [field]: value,
            ...(includeExpected ? { expected: { [field]: o[OVERRIDE_BASELINE_FIELD[field]] } } : {}),
          }),
          fallbackError: "แก้ไขยอดไม่สำเร็จ",
        }),
        reload: load,
      });
    }
    if (o.id.startsWith("u9-order:")) {
      const u9OrderId = o.id.split(":")[1];
      return commitOverrideEdit({
        save: (includeExpected) => apiJson(`/api/profit/u9/orders/${u9OrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [field]: value,
            ...(includeExpected ? { expected: { [field]: o[OVERRIDE_BASELINE_FIELD[field]] } } : {}),
          }),
          fallbackError: "แก้ไขยอดไม่สำเร็จ",
        }),
        reload: load,
      });
    }
    for (const src of ["truemoney", "atom", "smartsun"]) {
      if (o.id.startsWith(`${src}-order:`)) {
        const oid = o.id.split(":")[1];
        return commitOverrideEdit({
          save: (includeExpected) => apiJson(`/api/profit/${src}/orders/${oid}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              [field]: value,
              ...(includeExpected ? { expected: { [field]: o[OVERRIDE_BASELINE_FIELD[field]] } } : {}),
            }),
            fallbackError: "แก้ไขยอดไม่สำเร็จ",
          }),
          reload: load,
        });
      }
    }
    if (o.id.startsWith("donshop-order:")) {
      const donshopOrderId = o.id.split(":")[1];
      return commitOverrideEdit({
        save: (includeExpected) => apiJson(`/api/profit/donshop/orders/${donshopOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [field]: value,
            ...(includeExpected ? { expected: { [field]: o[OVERRIDE_BASELINE_FIELD[field]] } } : {}),
          }),
          fallbackError: "แก้ไขยอดไม่สำเร็จ",
        }),
        reload: load,
      });
    }
    if (o.id.startsWith("gamepoint-order:")) {
      const gamepointOrderId = o.id.split(":")[1];
      return commitOverrideEdit({
        save: (includeExpected) => apiJson(`/api/profit/gamepoint/orders/${gamepointOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [field]: value,
            ...(includeExpected ? { expected: { [field]: o[OVERRIDE_BASELINE_FIELD[field]] } } : {}),
          }),
          fallbackError: "แก้ไขยอดไม่สำเร็จ",
        }),
        reload: load,
      });
    }
    if (o.id.startsWith("agenh2h-order:")) {
      const agenh2hOrderId = o.id.split(":")[1];
      return commitOverrideEdit({
        save: (includeExpected) => apiJson(`/api/profit/agenh2h/orders/${agenh2hOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [field]: value,
            ...(includeExpected ? { expected: { [field]: o[OVERRIDE_BASELINE_FIELD[field]] } } : {}),
          }),
          fallbackError: "แก้ไขยอดไม่สำเร็จ",
        }),
        reload: load,
      });
    }
    if (o.id.startsWith("codareseller-order:")) {
      const codaresellerOrderId = o.id.split(":")[1];
      return commitOverrideEdit({
        save: (includeExpected) => apiJson(`/api/profit/codareseller/orders/${codaresellerOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [field]: value,
            ...(includeExpected ? { expected: { [field]: o[OVERRIDE_BASELINE_FIELD[field]] } } : {}),
          }),
          fallbackError: "แก้ไขยอดไม่สำเร็จ",
        }),
        reload: load,
      });
    }
    if (o.id.startsWith("netease-order:")) {
      const neteaseOrderId = o.id.split(":")[1];
      return commitOverrideEdit({
        save: (includeExpected) => apiJson(`/api/profit/netease/orders/${neteaseOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [field]: value,
            ...(includeExpected ? { expected: { [field]: o[OVERRIDE_BASELINE_FIELD[field]] } } : {}),
          }),
          fallbackError: "แก้ไขยอดไม่สำเร็จ",
        }),
        reload: load,
      });
    }
    return apiJson(`/api/profit/orders/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
      fallbackError: "แก้ไขออเดอร์ไม่สำเร็จ",
    })
      .then(load)
      .catch((err) => window.alert(err.message));
  };

  const removeOrder = async (orderId) => {
    if (!window.confirm("ลบออเดอร์นี้ใช่ไหม?")) return;
    try {
      await apiJson(`/api/profit/orders/${orderId}`, { method: "DELETE", fallbackError: "ลบออเดอร์ไม่สำเร็จ" });
      load();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const toggleDustCleared = async (cleared) => {
    try {
      // cardId comes from useParams() and is used raw here, matching load()
      // above -- wrapping it in encodeURIComponent() would double-encode it
      // on a hard navigation/reload where the route param can already be
      // percent-encoded (e.g. the ":" in "gocash:<serial>"), silently
      // writing the mark under the wrong (mangled) key.
      await apiJson(`/api/profit/gocash/cards/${cardId}/dust-clear`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cleared }),
        fallbackError: "อัปเดตสถานะเคลียเศษไม่สำเร็จ",
      });
      load();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const toggleMergeCleared = async (cleared) => {
    try {
      // Same raw-cardId convention as toggleDustCleared above.
      await apiJson(`/api/profit/oxide/cards/${cardId}/merge-clear`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cleared }),
        fallbackError: "อัปเดตสถานะรวมบัตรไม่สำเร็จ",
      });
      load();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const toggleDuplicateReviewed = async (reviewed) => {
    try {
      await apiJson(`/api/profit/gocash/cards/${cardId}/duplicate-review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed }),
        fallbackError: "อัปเดตสถานะตรวจสอบบัตรตัดซ้ำไม่สำเร็จ",
      });
      load();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const removeCard = async () => {
    if (!window.confirm("ลบบัตรนี้พร้อมออเดอร์ทั้งหมดใช่ไหม?")) return;
    try {
      await apiJson(`/api/profit/cards/${cardId}`, { method: "DELETE", fallbackError: "ลบบัตรไม่สำเร็จ" });
      router.push(`/profit/category/${categoryId}`);
    } catch (err) {
      window.alert(err.message);
    }
  };

  const filteredOrders = useMemo(() => {
    if (!data) return [];
    const { card } = data;
    if (card.source !== "gocash") return card.orders;
    const query = q.trim().toLowerCase();
    return card.orders.filter((o) => matchesQuery(query, [o.txid, o.orderId, o.saleOrderId, o.packName]));
  }, [data, q]);

  if (error) {
    return <div className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-6 text-sm text-ll-primary-subtle-text">เกิดข้อผิดพลาด: {error}</div>;
  }
  if (!data) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-ll-ink-subtle">
        <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
      </p>
    );
  }

  const { category, card } = data;

  if (card.source === "oxide") {
    return (
      <OxideCardDetail
        categoryId={categoryId}
        category={category}
        card={card}
        canEdit={canEdit}
        platforms={platforms}
        onEditOrder={editOrder}
        onToggleMergeCleared={toggleMergeCleared}
      />
    );
  }

  if (card.source === "wavepay") {
    return (
      <WavepayCardDetail
        categoryId={categoryId}
        category={category}
        card={card}
        canEdit={canEdit}
        platforms={platforms}
        onEditOrder={editOrder}
      />
    );
  }

  if (card.source === "u9") {
    return (
      <U9CardDetail
        categoryId={categoryId}
        category={category}
        card={card}
        canEdit={canEdit}
        platforms={platforms}
        onEditOrder={editOrder}
      />
    );
  }

  if (card.source === "truemoney" || card.source === "atom" || card.source === "smartsun") {
    const cfg =
      card.source === "truemoney"
        ? { amountKey: "deductedThb", amountTotalKey: "deductedThbTotal", amountLabel: "ยอดตัด (฿)", amountLabelTotal: "ยอดตัดรวม (฿)", fmtAmount: fmtMoney, blurb: "เบอร์ TrueMoney · payment_method = TrueMoney (codashop_auto_api) · ยอดตัดบาทจาก pack_price" }
        : card.source === "atom"
          ? { amountKey: "deductedKs", amountTotalKey: "deductedKsTotal", amountLabel: "ยอดตัด (Ks)", amountLabelTotal: "ยอดตัดรวม (Ks)", fmtAmount: fmtKyat, blurb: "เบอร์ ATOM · payment_method = ATOM (codashop_auto_api) · ยอดตัด Ks จาก pack_price" }
          : { amountKey: "deductedPhp", amountTotalKey: "deductedPhpTotal", amountLabel: "ยอดตัด (₱)", amountLabelTotal: "ยอดตัดรวม (₱)", fmtAmount: fmtPhp, blurb: "เบอร์ Smart/Sun · payment_method = Smart/Sun (codashop_auto_api) · ยอดตัด PHP จาก pack_price" };
    return (
      <PhoneChannelCardDetail
        categoryId={categoryId}
        category={category}
        card={card}
        canEdit={canEdit}
        platforms={platforms}
        onEditOrder={editOrder}
        cfg={cfg}
      />
    );
  }

  if (card.source === "donshop") {
    return (
      <DonshopCardDetail
        categoryId={categoryId}
        category={category}
        card={card}
        canEdit={canEdit}
        platforms={platforms}
        onEditOrder={editOrder}
      />
    );
  }

  if (card.source === "gamepoint") {
    return (
      <GamepointCardDetail
        categoryId={categoryId}
        category={category}
        card={card}
        canEdit={canEdit}
        platforms={platforms}
        onEditOrder={editOrder}
      />
    );
  }

  if (card.source === "agenh2h") {
    return (
      <Agenh2hCardDetail
        categoryId={categoryId}
        category={category}
        card={card}
        canEdit={canEdit}
        platforms={platforms}
        onEditOrder={editOrder}
      />
    );
  }

  if (card.source === "codareseller") {
    return (
      <CodaresellerCardDetail
        categoryId={categoryId}
        category={category}
        card={card}
        canEdit={canEdit}
        platforms={platforms}
        onEditOrder={editOrder}
      />
    );
  }

  if (card.source === "netease") {
    return (
      <NeteaseCardDetail
        categoryId={categoryId}
        category={category}
        card={card}
        canEdit={canEdit}
        platforms={platforms}
        onEditOrder={editOrder}
      />
    );
  }

  const isLive = card.source === "gocash";
  const money = isLive ? fmtUsd : fmtMoney;

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
        <Link href="/profit" className="hover:underline">ภาพรวม</Link>
        <ChevronRight size={12} />
        <Link href={`/profit/category/${categoryId}`} className="hover:underline">{category.name}</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">{card.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ll-ink">{card.name}</h1>
          <p className="mt-0.5 text-[13px] text-ll-ink-subtle">
            {category.name}{isLive ? " · ยอดตัดเป็น USD · กรอกราคาขาย/ต้นทุนในตาราง" : " · กรอกต้นทุนได้ที่ช่องในตาราง"}
          </p>
        </div>
        {!isLive && canEdit && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-ll-hairline-strong px-3 py-2 text-[12px] font-medium text-ll-ink hover:bg-ll-surface-2"
            >
              <Pencil size={13} /> แก้ไขบัตร
            </button>
            <button
              type="button"
              onClick={() => setAddOrderOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-ll-primary px-3 py-2 text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover"
            >
              <Plus size={13} /> เพิ่มออเดอร์
            </button>
          </div>
        )}
      </div>

      <ProfitSummaryGrid
        items={[
          { k: "ออเดอร์", v: card.orderCount },
          { k: "ยอดขายรวม", v: fmtMoney(card.saleTotal) },
          { k: "ต้นทุนรวม", v: fmtMoney(card.costTotal) },
          { k: "กำไร", v: fmtMoney(card.profitTotal), tone: card.profitTotal >= 0 ? "pos" : "neg" },
          { k: "%กำไร", v: fmtPct(card.profitPct) },
          { k: isLive ? "ยอดตัด (USD)" : "ยอดตัด", v: isLive ? fmtUsd(card.deductedTotal) : fmtMoney(card.deductedTotal) },
          isLive
            ? { k: "คงเหลือ (USD)", v: fmtUsd(card.remaining) }
            : { k: "ออเดอร์ซ้ำ", v: card.duplicateCount, tone: card.duplicateCount > 0 ? "neg" : undefined },
          ...(isLive ? [{ k: "ออเดอร์ซ้ำ", v: card.duplicateCount, tone: card.duplicateCount > 0 ? "neg" : undefined }] : []),
        ]}
      />

      {isLive && card.isDust && (
        <DustPanel card={card} canEdit={canEdit} onToggle={toggleDustCleared} />
      )}

      {isLive && (card.duplicateCount > 0 || (card.duplicateReviewLog || []).length > 0) && (
        <DuplicateReviewPanel card={card} canEdit={canEdit} onToggle={toggleDuplicateReviewed} />
      )}

      {isLive && (
        <div className="flex items-center justify-between">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาเลขออเดอร์..."
            className="h-9 w-72 max-w-full rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-3 text-[13px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1"
          />
          <span className="text-[12px] text-ll-ink-subtle">
            {filteredOrders.length}{q ? ` / ${card.orderCount}` : ""} รายการ
          </span>
        </div>
      )}

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">{isLive ? "QUEUE #" : "ออเดอร์"}</th>
                {isLive && <th className="px-3 py-2 font-medium">ORDER ID</th>}
                {isLive && <th className="px-3 py-2 font-medium">เกม</th>}
                {isLive && <th className="px-3 py-2 font-medium">แพ็ก</th>}
                {isLive && <th className="px-3 py-2 font-medium">แพลตฟอร์ม</th>}
                <th className="px-3 py-2 text-right font-medium">ราคาขาย</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-2 text-right font-medium">กำไร</th>
                <th className="px-3 py-2 text-right font-medium">%กำไร</th>
                <th className="px-3 py-2 text-right font-medium">{isLive ? "ก่อนตัด (USD)" : "คงเหลือก่อนตัด"}</th>
                <th className="px-3 py-2 text-right font-medium">{isLive ? "ยอดตัด (USD)" : "ตัดค่าแพ็ก"}</th>
                <th className="px-3 py-2 text-right font-medium">{isLive ? "หลังตัด (USD)" : "คงเหลือหลังตัด"}</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium">เวลา</th>
                {!isLive && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length ? (
                filteredOrders.map((o) => {
                  const l = o.ledger || {};
                  return (
                    <tr key={o.id} className="border-b border-ll-hairline last:border-0 hover:bg-ll-surface-2">
                      <td className="px-4 py-2.5 font-medium text-ll-ink">{o.txid}</td>
                      {isLive && <td className="px-3 py-2.5 text-ll-ink">{o.saleOrderId || "-"}</td>}
                      {isLive && <td className="px-3 py-2.5 text-ll-ink-subtle">{o.game || "-"}</td>}
                      {isLive && <td className="px-3 py-2.5 text-ll-ink-subtle">{o.packName || "-"}</td>}
                      {isLive && (
                        <td className="px-3 py-2.5">
                          <PlatformSelect
                            value={o.platform}
                            fromDb={o.platformFromDb}
                            platforms={platforms}
                            disabled={!canEdit}
                            onCommit={(v) => editOrder(o,"platform", v)}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right">
                        <EditableCell
                          value={netSaleDisplay(o)}
                          disabled={!canEdit}
                          title={
                            o.platformFeePct > 0
                              ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาเต็ม ${fmtMoney(o.saleAmount || 0)} แล้ว — แก้ตรงนี้ให้กรอกราคาเต็มใหม่ ระบบจะหักให้อัตโนมัติ`
                              : o.saleAmountUsdt != null
                                ? `แสดง ${o.saleAmountUsdt} USDT ตามที่กรอก · กำไรคูณ USD:THB อัตโนมัติ (= ${fmtMoney(o.saleAmount)}) — แก้ตรงนี้กรอก USDT`
                              : o.saleFromPlatform
                                ? "ค่านี้ดึงจากราคาขายตามแพ็กของแพลตฟอร์มนี้ — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                                : o.saleMissingPlatformPrice
                                  ? `ยังไม่มีราคาอ้างอิงของ ${platformLabel(o.platform)} สำหรับแพ็กนี้ — ตั้งได้ที่หน้า "ตั้งราคาขายตามแพ็ก"`
                                  : undefined
                          }
                          onCommit={(v) => editOrder(o,"saleAmount", v)}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <EditableCell
                          value={o.cost}
                          disabled={!canEdit}
                          title={
                            o.costFromPack
                              ? "ค่านี้มาจากต้นทุนเริ่มต้นของแพ็ก — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                              : o.costFromRate
                                ? "ค่านี้คำนวณจากยอดตัด (USD) × USD:THB × เรท GoCash — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                                : undefined
                          }
                          onCommit={(v) => editOrder(o,"cost", v)}
                        />
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right ${o.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}
                        title={o.platformFeePct > 0 ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาขายก่อนคิดกำไรแล้ว` : undefined}
                      >
                        {fmtMoney(o.profit)}
                      </td>
                      <td className="px-3 py-2.5 text-right">{fmtPct(o.profitPct)}</td>
                      <td className="px-3 py-2.5 text-right">{l.in == null ? "-" : money(l.in)}</td>
                      <td className="px-3 py-2.5 text-right">{l.out == null ? "-" : money(l.out)}</td>
                      <td className="px-3 py-2.5 text-right">{l.remaining == null ? "-" : money(l.remaining)}</td>
                      <td className="px-3 py-2.5">
                        {o.isDuplicate ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ตัดซ้ำ</span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">ปกติ</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(o.createdAt)}</td>
                      {!isLive && (
                        <td className="px-3 py-2.5">
                          {canEdit && (
                            <button type="button" onClick={() => removeOrder(o.id)} className="rounded-md border border-ll-hairline-strong p-1.5 text-ll-ink-subtle hover:bg-ll-surface-2" title="ลบ">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan={isLive ? 14 : 11} className="px-4 py-8 text-center text-ll-ink-subtle">{q ? "ไม่พบเลขที่ค้นหา" : "ยังไม่มีออเดอร์"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editOpen && (
        <EditCardModal card={card} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} onDelete={removeCard} />
      )}
      {addOrderOpen && (
        <AddOrderModal cardId={card.id} onClose={() => setAddOrderOpen(false)} onSaved={() => { setAddOrderOpen(false); load(); }} />
      )}
    </div>
  );
}

const DUST_LOG_COLLAPSED_COUNT = 3;

function DustPanel({ card, canEdit, onToggle }) {
  const [logExpanded, setLogExpanded] = useState(false);
  const log = card.dustClearLog || [];
  const visibleLog = logExpanded ? log : log.slice(0, DUST_LOG_COLLAPSED_COUNT);
  const hiddenCount = log.length - visibleLog.length;

  return (
    <section className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${card.needsDustClear ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
            <Droplets size={16} />
          </span>
          <div>
            <p className="text-[13px] font-medium text-ll-ink">
              {card.needsDustClear ? "เหลือเศษต่ำกว่า $1.00 — ต้องเคลียร์" : "เคลียร์แล้ว"}
            </p>
            {card.dustCleared && card.dustClearedByName && (
              <p className="text-[12px] text-ll-ink-subtle">โดย {card.dustClearedByName}</p>
            )}
            {card.dustCleared && (
              <p className="text-[12px] text-ll-ink-subtle">เมื่อ {fmtDate(card.dustClearedAt)}</p>
            )}
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              const message = card.dustCleared
                ? "ยืนยันว่าต้องการยกเลิกมาร์กเคลียร์เศษบัตรนี้ใช่ไหม?"
                : "ยืนยันว่าเคลียร์เศษบัตรนี้เรียบร้อยแล้วใช่ไหม?";
              if (!window.confirm(message)) return;
              onToggle(!card.dustCleared);
            }}
            className={`rounded-md px-3 py-2 text-[12px] font-medium ${
              card.dustCleared
                ? "border border-ll-hairline-strong text-ll-ink hover:bg-ll-surface-2"
                : "bg-ll-primary text-ll-on-primary hover:bg-ll-primary-hover"
            }`}
          >
            {card.dustCleared ? "ยกเลิกมาร์กเคลียร์แล้ว" : "มาร์กว่าเคลียร์เศษแล้ว"}
          </button>
        )}
      </div>

      {log.length > 0 && (
        <div className="mt-3 border-t border-ll-hairline pt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ll-ink-tertiary">ประวัติคนเคลียร์เศษบัตรนี้</p>
          <ul className="flex flex-col gap-1">
            {visibleLog.map((entry, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
                <User size={11} className="text-ll-ink-tertiary" />
                <span className="font-medium text-ll-ink">{entry.userName}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    entry.action === "uncleared" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {entry.action === "uncleared" ? "ยกเลิก" : "เคลียร์"}
                </span>
                <span>· {fmtDate(entry.clearedAt)}</span>
              </li>
            ))}
          </ul>
          {(hiddenCount > 0 || logExpanded) && log.length > DUST_LOG_COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setLogExpanded((v) => !v)}
              className="mt-1.5 text-[11px] font-medium text-ll-primary-subtle-text hover:underline"
            >
              {logExpanded ? "ย่อรายการ" : `ดูเพิ่มเติมอีก ${hiddenCount} รายการ`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const MERGE_LOG_COLLAPSED_COUNT = 3;

// Same shape as DustPanel above, for Multi Game Card's "ต้องรวมบัตร" mark
// (idle 12h+ with a leftover balance -- see isIdle in profit-aggregate.js).
function MergePanel({ card, canEdit, onToggle }) {
  const [logExpanded, setLogExpanded] = useState(false);
  const log = card.mergeClearLog || [];
  const visibleLog = logExpanded ? log : log.slice(0, MERGE_LOG_COLLAPSED_COUNT);
  const hiddenCount = log.length - visibleLog.length;

  return (
    <section className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${card.needsMerge ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
            <Merge size={16} />
          </span>
          <div>
            <p className="text-[13px] font-medium text-ll-ink">
              {card.needsMerge ? "ไม่มีออเดอร์เกิน 12 ชม. ยังมี points เหลือ — ควรรวมบัตร" : "รวมแล้ว"}
            </p>
            {card.mergeCleared && card.mergeClearedByName && (
              <p className="text-[12px] text-ll-ink-subtle">โดย {card.mergeClearedByName}</p>
            )}
            {card.mergeCleared && (
              <p className="text-[12px] text-ll-ink-subtle">เมื่อ {fmtDate(card.mergeClearedAt)}</p>
            )}
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              const message = card.mergeCleared
                ? "ยืนยันว่าต้องการยกเลิกมาร์กรวมบัตรนี้ใช่ไหม?"
                : "ยืนยันว่ารวมยอดของบัตรนี้ไปบัตรอื่นเรียบร้อยแล้วใช่ไหม?";
              if (!window.confirm(message)) return;
              onToggle(!card.mergeCleared);
            }}
            className={`rounded-md px-3 py-2 text-[12px] font-medium ${
              card.mergeCleared
                ? "border border-ll-hairline-strong text-ll-ink hover:bg-ll-surface-2"
                : "bg-ll-primary text-ll-on-primary hover:bg-ll-primary-hover"
            }`}
          >
            {card.mergeCleared ? "ยกเลิกมาร์กรวมแล้ว" : "มาร์กว่ารวมบัตรแล้ว"}
          </button>
        )}
      </div>

      {log.length > 0 && (
        <div className="mt-3 border-t border-ll-hairline pt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ll-ink-tertiary">ประวัติคนรวมบัตรนี้</p>
          <ul className="flex flex-col gap-1">
            {visibleLog.map((entry, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
                <User size={11} className="text-ll-ink-tertiary" />
                <span className="font-medium text-ll-ink">{entry.userName}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    entry.action === "uncleared" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {entry.action === "uncleared" ? "ยกเลิก" : "รวมแล้ว"}
                </span>
                <span>· {fmtDate(entry.clearedAt)}</span>
              </li>
            ))}
          </ul>
          {(hiddenCount > 0 || logExpanded) && log.length > MERGE_LOG_COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setLogExpanded((v) => !v)}
              className="mt-1.5 text-[11px] font-medium text-ll-primary-subtle-text hover:underline"
            >
              {logExpanded ? "ย่อรายการ" : `ดูเพิ่มเติมอีก ${hiddenCount} รายการ`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const REVIEW_LOG_COLLAPSED_COUNT = 3;

function DuplicateReviewPanel({ card, canEdit, onToggle }) {
  const [logExpanded, setLogExpanded] = useState(false);
  const log = card.duplicateReviewLog || [];
  const visibleLog = logExpanded ? log : log.slice(0, REVIEW_LOG_COLLAPSED_COUNT);
  const hiddenCount = log.length - visibleLog.length;
  const reviewed = !card.needsDuplicateReview;

  return (
    <section className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${card.needsDuplicateReview ? "bg-red-50 text-red-600" : "bg-ll-surface-2 text-ll-ink-subtle"}`}>
            <Copy size={16} />
          </span>
          <div>
            <p className="text-[13px] font-medium text-ll-ink">
              {card.needsDuplicateReview ? `พบยอดตัดซ้ำ ${card.duplicateCount} รายการ — ยังไม่ตรวจสอบ` : "ตรวจสอบแล้ว"}
            </p>
            {reviewed && card.duplicateReviewedByName && (
              <p className="text-[12px] text-ll-ink-subtle">โดย {card.duplicateReviewedByName}</p>
            )}
            {reviewed && (
              <p className="text-[12px] text-ll-ink-subtle">เมื่อ {fmtDate(card.duplicateReviewedAt)}</p>
            )}
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              const message = reviewed
                ? "ยืนยันว่าต้องการยกเลิกมาร์กตรวจสอบยอดตัดซ้ำของบัตรนี้ใช่ไหม?"
                : `ยืนยันว่าตรวจสอบยอดตัดซ้ำ ${card.duplicateCount} รายการของบัตรนี้แล้ว และไม่มีปัญหาใช่ไหม?`;
              if (!window.confirm(message)) return;
              onToggle(!reviewed);
            }}
            className={`rounded-md px-3 py-2 text-[12px] font-medium ${
              reviewed
                ? "border border-ll-hairline-strong text-ll-ink hover:bg-ll-surface-2"
                : "bg-ll-primary text-ll-on-primary hover:bg-ll-primary-hover"
            }`}
          >
            {reviewed ? "ยกเลิกมาร์กตรวจสอบแล้ว" : "มาร์กว่าตรวจสอบแล้ว"}
          </button>
        )}
      </div>

      {log.length > 0 && (
        <div className="mt-3 border-t border-ll-hairline pt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ll-ink-tertiary">ประวัติคนตรวจสอบยอดตัดซ้ำบัตรนี้</p>
          <ul className="flex flex-col gap-1">
            {visibleLog.map((entry, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
                <User size={11} className="text-ll-ink-tertiary" />
                <span className="font-medium text-ll-ink">{entry.userName}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    entry.action === "unreviewed" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {entry.action === "unreviewed" ? "ยกเลิก" : "ตรวจสอบ"}
                </span>
                <span>· {fmtDate(entry.reviewedAt)}</span>
              </li>
            ))}
          </ul>
          {(hiddenCount > 0 || logExpanded) && log.length > REVIEW_LOG_COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setLogExpanded((v) => !v)}
              className="mt-1.5 text-[11px] font-medium text-ll-primary-subtle-text hover:underline"
            >
              {logExpanded ? "ย่อรายการ" : `ดูเพิ่มเติมอีก ${hiddenCount} รายการ`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function EditableCell({ value, disabled, title, onCommit }) {
  const [local, setLocal] = useState(String(value ?? 0));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing the input's draft value when the server-loaded value changes underneath it
    setLocal(String(value ?? 0));
  }, [value]);
  return (
    <input
      type="number"
      step="0.01"
      title={title}
      disabled={disabled}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (Number(local) !== Number(value)) onCommit(local);
      }}
      className="h-8 w-24 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2 text-right text-[12px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1 disabled:opacity-60"
    />
  );
}

function EditCardModal({ card, onClose, onSaved, onDelete }) {
  const [form, setForm] = useState({
    name: card.name,
    openingBalance: String(card.openingBalance ?? 0),
    status: card.status,
    note: card.note || "",
    deductedOverride: card.deductedOverride == null ? "" : String(card.deductedOverride),
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await apiJson(`/api/profit/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          openingBalance: Number(form.openingBalance) || 0,
          status: form.status,
          note: form.note,
          deductedOverride: form.deductedOverride === "" ? null : Number(form.deductedOverride),
        }),
        fallbackError: "แก้ไขบัตรไม่สำเร็จ",
      });
      onSaved();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfitModal
      title="แก้ไขบัตร"
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onDelete} className="rounded-md border border-ll-hairline-strong px-3.5 py-2 text-[12px] font-medium text-red-600 hover:bg-red-50">
            ลบบัตร
          </button>
          <button type="button" onClick={submit} disabled={saving} className="rounded-md bg-ll-primary px-3.5 py-2 text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </>
      }
    >
      <ProfitField label="ชื่อ/เลขบัตร">
        <input className={profitInputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </ProfitField>
      <ProfitField label="ยอดเงินตั้งต้นในบัตร">
        <input className={profitInputClass} type="number" step="0.01" value={form.openingBalance} onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))} />
      </ProfitField>
      <ProfitField label="สถานะ">
        <select className={profitInputClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
          <option value="active">ใช้งาน</option>
          <option value="closed">ปิด</option>
        </select>
      </ProfitField>
      <ProfitField label="โน้ต">
        <input className={profitInputClass} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
      </ProfitField>
      <ProfitField label="ยอดที่บอทตัด (เว้นว่าง = คิดจากยอดขายรวม)">
        <input className={profitInputClass} type="number" step="0.01" value={form.deductedOverride} onChange={(e) => setForm((f) => ({ ...f, deductedOverride: e.target.value }))} />
      </ProfitField>
    </ProfitModal>
  );
}

function AddOrderModal({ cardId, onClose, onSaved }) {
  const [form, setForm] = useState({ txid: "", saleAmount: "0", cost: "0" });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await apiJson(`/api/profit/cards/${cardId}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txid: form.txid, saleAmount: Number(form.saleAmount) || 0, cost: Number(form.cost) || 0 }),
        fallbackError: "เพิ่มออเดอร์ไม่สำเร็จ",
      });
      onSaved();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfitModal
      title="เพิ่มออเดอร์"
      onClose={onClose}
      actions={
        <button type="button" onClick={submit} disabled={saving} className="rounded-md bg-ll-primary px-3.5 py-2 text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50">
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      }
    >
      <ProfitField label="TXID">
        <input className={profitInputClass} value={form.txid} onChange={(e) => setForm((f) => ({ ...f, txid: e.target.value }))} />
      </ProfitField>
      <ProfitField label="ราคาขาย">
        <input className={profitInputClass} type="number" step="0.01" value={form.saleAmount} onChange={(e) => setForm((f) => ({ ...f, saleAmount: e.target.value }))} />
      </ProfitField>
      <ProfitField label="ต้นทุน">
        <input className={profitInputClass} type="number" step="0.01" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} />
      </ProfitField>
    </ProfitModal>
  );
}

function WavepayCardDetail({ categoryId, category, card, canEdit, platforms, onEditOrder }) {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
        <Link href="/profit" className="hover:underline">ภาพรวม</Link>
        <ChevronRight size={12} />
        <Link href={`/profit/category/${categoryId}`} className="hover:underline">{category.name}</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">{card.name}</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold text-ll-ink">{card.name}</h1>
        <p className="mt-0.5 text-[13px] text-ll-ink-subtle">
          {category.name} · บัญชี Wavepay (เติมได้หลายเกม) · ประวัติออเดอร์ดึงจาก codashop_orders (เฉพาะออเดอร์ที่สำเร็จ) ·
          ก่อนตัด/ยอดตัด/คงเหลือ เป็น Kyat (Ks) อ่านจากยอดคงเหลือกระเป๋าจริงต่อออเดอร์ ·
          กรอกต้นทุน/ราคาขายได้ที่ช่องในตาราง (หรือตั้งค่าครั้งเดียวต่อแพ็กที่หน้า &quot;ตั้งค่าต้นทุน/ราคาขายตามแพ็ก&quot;)
        </p>
      </div>

      <ProfitSummaryGrid
        items={[
          { k: "คงเหลือ (ประมาณ)", v: card.balanceKs != null ? fmtKyat(card.balanceKs) : "-" },
          { k: "ออเดอร์ (ที่สำเร็จ)", v: card.orderCount },
          { k: "ยอดขายรวม", v: fmtMoney(card.saleTotal) },
          { k: "ต้นทุนรวม", v: fmtMoney(card.costTotal) },
          { k: "กำไรรวม", v: fmtMoney(card.profitTotal), tone: card.profitTotal >= 0 ? "pos" : "neg" },
          { k: "ออเดอร์ซ้ำ", v: card.duplicateCount, tone: card.duplicateCount > 0 ? "neg" : undefined },
          { k: "ยอดตัดรวม (Ks)", v: fmtKyat(card.deductedKsTotal) },
          { k: "ตัดล่าสุด", v: fmtDate(card.lastOrderAt) },
        ]}
      />

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ll-ink">ออเดอร์</h2>
          <span className="text-[12px] text-ll-ink-subtle">{card.orders.length} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">QUEUE #</th>
                <th className="px-3 py-2 font-medium">ORDER ID</th>
                <th className="px-3 py-2 font-medium">เกม</th>
                <th className="px-3 py-2 font-medium">แพ็ก</th>
                <th className="px-3 py-2 font-medium">แพลตฟอร์ม</th>
                <th className="px-3 py-2 text-right font-medium">ราคาขาย</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-2 text-right font-medium">กำไร</th>
                <th className="px-3 py-2 text-right font-medium">%กำไร</th>
                <th className="px-3 py-2 text-right font-medium">ก่อนตัด (Ks)</th>
                <th className="px-3 py-2 text-right font-medium">ยอดตัด (Ks)</th>
                <th className="px-3 py-2 text-right font-medium">คงเหลือ (Ks)</th>
                <th className="px-3 py-2 font-medium">เวลา</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {card.orders.length ? (
                card.orders.map((o) => (
                  <tr key={o.id} className="border-b border-ll-hairline last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ll-ink">{o.txid}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.saleOrderId || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{o.gameName || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.packName || "-"}</td>
                    <td className="px-3 py-2.5">
                      <PlatformSelect
                        value={o.platform}
                        fromDb={o.platformFromDb}
                        platforms={platforms}
                        disabled={!canEdit}
                        onCommit={(v) => onEditOrder(o,"platform", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={netSaleDisplay(o)}
                        disabled={!canEdit}
                        title={
                          o.platformFeePct > 0
                            ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาเต็ม ${fmtMoney(o.saleAmount || 0)} แล้ว — แก้ตรงนี้ให้กรอกราคาเต็มใหม่ ระบบจะหักให้อัตโนมัติ`
                            : o.saleAmountUsdt != null
                              ? `แสดง ${o.saleAmountUsdt} USDT ตามที่กรอก · กำไรคูณ USD:THB อัตโนมัติ (= ${fmtMoney(o.saleAmount)}) — แก้ตรงนี้กรอก USDT`
                            : o.saleFromPlatform
                              ? "ค่านี้ดึงจากราคาขายตามแพ็กของแพลตฟอร์มนี้ — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                              : o.saleMissingPlatformPrice
                                ? `ยังไม่มีราคาอ้างอิงของ ${platformLabel(o.platform)} สำหรับแพ็กนี้ — ตั้งได้ที่หน้า "ตั้งราคาขายตามแพ็ก"`
                                : undefined
                        }
                        onCommit={(v) => onEditOrder(o,"saleAmount", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={o.cost}
                        disabled={!canEdit}
                        title={
                          o.costFromPack
                            ? "ค่านี้มาจากต้นทุนเริ่มต้นของแพ็ก — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                            : o.costMissing
                              ? 'ยังไม่มีต้นทุนของแพ็กนี้เลย — ตั้งได้ที่หน้า "ตั้งค่าต้นทุนตามแพ็ก" หรือกรอกตรงนี้เฉพาะออเดอร์นี้'
                              : undefined
                        }
                        onCommit={(v) => onEditOrder(o,"cost", v)}
                      />
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right ${o.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      title={o.platformFeePct > 0 ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาขายก่อนคิดกำไรแล้ว` : undefined}
                    >
                      {fmtMoney(o.profit)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(o.profitPct)}</td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title="อ่านจากยอดคงเหลือกระเป๋า Wavepay จริงตอนตัดเงิน (provider_response.balances) — ไม่ใช่ยอดบาท">
                      {o.oldBalanceKs != null ? fmtKyat(o.oldBalanceKs) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle">
                      {o.deductedKs != null ? fmtKyat(o.deductedKs) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle">
                      {o.newBalanceKs != null ? fmtKyat(o.newBalanceKs) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(o.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      {o.isDuplicate ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ตัดซ้ำ</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">ปกติ</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-ll-ink-subtle">ยังไม่มีออเดอร์ที่สำเร็จบนบัญชีนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}


function PhoneChannelCardDetail({ categoryId, category, card, canEdit, platforms, onEditOrder, cfg }) {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
        <Link href="/profit" className="hover:underline">ภาพรวม</Link>
        <ChevronRight size={12} />
        <Link href={`/profit/category/${categoryId}`} className="hover:underline">{category.name}</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">{card.name}</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold text-ll-ink">{card.name}</h1>
        <p className="mt-0.5 text-[13px] text-ll-ink-subtle">
          {category.name} · {cfg.blurb} · กรอกต้นทุน/ราคาขายได้ที่ช่องในตาราง
        </p>
      </div>

      <ProfitSummaryGrid
        items={[
          { k: cfg.amountLabelTotal, v: card[cfg.amountTotalKey] != null ? cfg.fmtAmount(card[cfg.amountTotalKey]) : "-" },
          { k: "ออเดอร์ (ที่สำเร็จ)", v: card.orderCount },
          { k: "ยอดขายรวม", v: fmtMoney(card.saleTotal) },
          { k: "ต้นทุนรวม", v: fmtMoney(card.costTotal) },
          { k: "กำไรรวม", v: fmtMoney(card.profitTotal), tone: card.profitTotal >= 0 ? "pos" : "neg" },
          { k: "ออเดอร์ซ้ำ", v: card.duplicateCount, tone: card.duplicateCount > 0 ? "neg" : undefined },
          { k: "ตัดล่าสุด", v: fmtDate(card.lastOrderAt) },
        ]}
      />

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ll-ink">ออเดอร์</h2>
          <span className="text-[12px] text-ll-ink-subtle">{card.orders.length} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">QUEUE #</th>
                <th className="px-3 py-2 font-medium">ORDER ID</th>
                <th className="px-3 py-2 font-medium">เกม</th>
                <th className="px-3 py-2 font-medium">แพ็ก</th>
                <th className="px-3 py-2 font-medium">แพลตฟอร์ม</th>
                <th className="px-3 py-2 text-right font-medium">ราคาขาย</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-2 text-right font-medium">กำไร</th>
                <th className="px-3 py-2 text-right font-medium">%กำไร</th>
                <th className="px-3 py-2 text-right font-medium">{cfg.amountLabel}</th>
                <th className="px-3 py-2 font-medium">เวลา</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {card.orders.length ? (
                card.orders.map((o) => (
                  <tr key={o.id} className="border-b border-ll-hairline last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ll-ink">{o.txid}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.saleOrderId || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{o.gameName || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.packName || "-"}</td>
                    <td className="px-3 py-2.5">
                      <PlatformSelect value={o.platform} fromDb={o.platformFromDb} platforms={platforms} disabled={!canEdit} onCommit={(v) => onEditOrder(o, "platform", v)} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell value={netSaleDisplay(o)} disabled={!canEdit} onCommit={(v) => onEditOrder(o, "saleAmount", v)} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell value={o.cost} disabled={!canEdit} onCommit={(v) => onEditOrder(o, "cost", v)} />
                    </td>
                    <td className={`px-3 py-2.5 text-right ${o.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtMoney(o.profit)}</td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(o.profitPct)}</td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle">{o[cfg.amountKey] != null ? cfg.fmtAmount(o[cfg.amountKey]) : "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(o.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      {o.isDuplicate ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ตัดซ้ำ</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">ปกติ</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-ll-ink-subtle">ยังไม่มีออเดอร์ที่สำเร็จในเบอร์นี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function U9CardDetail({ categoryId, category, card, canEdit, platforms, onEditOrder }) {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
        <Link href="/profit" className="hover:underline">ภาพรวม</Link>
        <ChevronRight size={12} />
        <Link href={`/profit/category/${categoryId}`} className="hover:underline">{category.name}</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">{card.name}</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold text-ll-ink">{card.name}</h1>
        <p className="mt-0.5 text-[13px] text-ll-ink-subtle">
          {category.name} · เบอร์ U9 / Ooredoo · ประวัติออเดอร์ดึงจาก codashop_orders (payment_method = U9) ·
          ยอดตัดเป็น MMK (Ks) จาก pack_price ตามชีท product (ไม่มี balances เรียลไทม์ใน DB) ·
          กรอกต้นทุน/ราคาขายได้ที่ช่องในตาราง (หรือตั้งค่าครั้งเดียวต่อแพ็กที่หน้า &quot;ตั้งค่าต้นทุน/ราคาขายตามแพ็ก&quot;)
        </p>
      </div>

      <ProfitSummaryGrid
        items={[
          { k: "ยอดตัดรวม (Ks)", v: card.deductedKsTotal != null ? fmtKyat(card.deductedKsTotal) : "-" },
          { k: "ออเดอร์ (ที่สำเร็จ)", v: card.orderCount },
          { k: "ยอดขายรวม", v: fmtMoney(card.saleTotal) },
          { k: "ต้นทุนรวม", v: fmtMoney(card.costTotal) },
          { k: "กำไรรวม", v: fmtMoney(card.profitTotal), tone: card.profitTotal >= 0 ? "pos" : "neg" },
          { k: "ออเดอร์ซ้ำ", v: card.duplicateCount, tone: card.duplicateCount > 0 ? "neg" : undefined },
          { k: "ตัดล่าสุด", v: fmtDate(card.lastOrderAt) },
        ]}
      />

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ll-ink">ออเดอร์</h2>
          <span className="text-[12px] text-ll-ink-subtle">{card.orders.length} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">QUEUE #</th>
                <th className="px-3 py-2 font-medium">ORDER ID</th>
                <th className="px-3 py-2 font-medium">เกม</th>
                <th className="px-3 py-2 font-medium">แพ็ก</th>
                <th className="px-3 py-2 font-medium">แพลตฟอร์ม</th>
                <th className="px-3 py-2 text-right font-medium">ราคาขาย</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-2 text-right font-medium">กำไร</th>
                <th className="px-3 py-2 text-right font-medium">%กำไร</th>
                <th className="px-3 py-2 text-right font-medium">ยอดตัด (Ks)</th>
                <th className="px-3 py-2 font-medium">เวลา</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {card.orders.length ? (
                card.orders.map((o) => (
                  <tr key={o.id} className="border-b border-ll-hairline last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ll-ink">{o.txid}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.saleOrderId || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{o.gameName || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.packName || "-"}</td>
                    <td className="px-3 py-2.5">
                      <PlatformSelect
                        value={o.platform}
                        fromDb={o.platformFromDb}
                        platforms={platforms}
                        disabled={!canEdit}
                        onCommit={(v) => onEditOrder(o,"platform", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={netSaleDisplay(o)}
                        disabled={!canEdit}
                        title={
                          o.platformFeePct > 0
                            ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาเต็ม ${fmtMoney(o.saleAmount || 0)} แล้ว — แก้ตรงนี้ให้กรอกราคาเต็มใหม่ ระบบจะหักให้อัตโนมัติ`
                            : o.saleAmountUsdt != null
                              ? `แสดง ${o.saleAmountUsdt} USDT ตามที่กรอก · กำไรคูณ USD:THB อัตโนมัติ (= ${fmtMoney(o.saleAmount)}) — แก้ตรงนี้กรอก USDT`
                            : o.saleFromPlatform
                              ? "ค่านี้ดึงจากราคาขายตามแพ็กของแพลตฟอร์มนี้ — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                              : o.saleMissingPlatformPrice
                                ? `ยังไม่มีราคาอ้างอิงของ ${platformLabel(o.platform)} สำหรับแพ็กนี้ — ตั้งได้ที่หน้า "ตั้งราคาขายตามแพ็ก"`
                                : undefined
                        }
                        onCommit={(v) => onEditOrder(o,"saleAmount", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={o.cost}
                        disabled={!canEdit}
                        title={
                          o.costFromPack
                            ? "ค่านี้มาจากต้นทุนเริ่มต้นของแพ็ก — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                            : o.costMissing
                              ? 'ยังไม่มีต้นทุนของแพ็กนี้เลย — ตั้งได้ที่หน้า "ตั้งค่าต้นทุนตามแพ็ก" หรือกรอกตรงนี้เฉพาะออเดอร์นี้'
                              : undefined
                        }
                        onCommit={(v) => onEditOrder(o,"cost", v)}
                      />
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right ${o.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      title={o.platformFeePct > 0 ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาขายก่อนคิดกำไรแล้ว` : undefined}
                    >
                      {fmtMoney(o.profit)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(o.profitPct)}</td>
                    <td
                      className="px-3 py-2.5 text-right text-ll-ink-subtle"
                      title="จาก pack_price (Ks/MMK) — U9 API ไม่ส่งยอดก่อนตัด/คงเหลือกระเป๋า"
                    >
                      {o.deductedKs != null ? fmtKyat(o.deductedKs) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(o.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      {o.isDuplicate ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ตัดซ้ำ</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">ปกติ</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-ll-ink-subtle">ยังไม่มีออเดอร์ที่สำเร็จบนเบอร์นี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DonshopCardDetail({ categoryId, category, card, canEdit, platforms, onEditOrder }) {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
        <Link href="/profit" className="hover:underline">ภาพรวม</Link>
        <ChevronRight size={12} />
        <Link href={`/profit/category/${categoryId}`} className="hover:underline">{category.name}</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">{card.name}</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold text-ll-ink">{card.name}</h1>
        <p className="mt-0.5 text-[13px] text-ll-ink-subtle">
          {category.name} · เกมจาก DonShop API (payment_method = DonShopIDR) · ไม่มีบัตร/กระเป๋าแยก — จัดกลุ่มตามเกม ·
          ก่อนตัด/ยอดตัด/คงเหลือเป็น IDR จากกระเป๋า DonShop โชว์แยก ไม่ผสมยอดบาท ·
          กรอกต้นทุน/ราคาขาย (บาท) ได้ที่ช่องในตาราง (หรือตั้งค่าครั้งเดียวต่อแพ็กที่หน้า &quot;ตั้งค่าต้นทุน/ราคาขายตามแพ็ก&quot;)
        </p>
      </div>

      <ProfitSummaryGrid
        items={[
          { k: "ออเดอร์ (ที่สำเร็จ)", v: card.orderCount },
          { k: "ยอดขายรวม", v: fmtMoney(card.saleTotal) },
          { k: "ต้นทุนรวม", v: fmtMoney(card.costTotal) },
          { k: "กำไรรวม", v: fmtMoney(card.profitTotal), tone: card.profitTotal >= 0 ? "pos" : "neg" },
          { k: "%กำไร", v: fmtPct(card.profitPct) },
          { k: "ยอดตัดรวม (IDR)", v: card.deductedIdrTotal != null ? fmtIdr(card.deductedIdrTotal) : "-" },
          { k: "ออเดอร์ซ้ำ", v: card.duplicateCount, tone: card.duplicateCount > 0 ? "neg" : undefined },
          { k: "ตัดล่าสุด", v: fmtDate(card.lastOrderAt) },
        ]}
      />

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ll-ink">ออเดอร์</h2>
          <span className="text-[12px] text-ll-ink-subtle">{card.orders.length} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">QUEUE #</th>
                <th className="px-3 py-2 font-medium">ORDER ID</th>
                <th className="px-3 py-2 font-medium">แพ็ก</th>
                <th className="px-3 py-2 font-medium">แพลตฟอร์ม</th>
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 text-right font-medium">ราคาขาย</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-2 text-right font-medium">กำไร</th>
                <th className="px-3 py-2 text-right font-medium">%กำไร</th>
                <th className="px-3 py-2 text-right font-medium">ก่อนตัด (IDR)</th>
                <th className="px-3 py-2 text-right font-medium">ยอดตัด (IDR)</th>
                <th className="px-3 py-2 text-right font-medium">คงเหลือ (IDR)</th>
                <th className="px-3 py-2 font-medium">เวลา</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {card.orders.length ? (
                card.orders.map((o) => (
                  <tr key={o.id} className="border-b border-ll-hairline last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ll-ink">{o.txid}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.saleOrderId || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.packName || "-"}</td>
                    <td className="px-3 py-2.5">
                      <PlatformSelect
                        value={o.platform}
                        fromDb={o.platformFromDb}
                        platforms={platforms}
                        disabled={!canEdit}
                        onCommit={(v) => onEditOrder(o, "platform", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">
                      <div>{o.invoiceNumber || "-"}</div>
                      {o.voucher && <div className="text-[11px] text-ll-ink-tertiary">{o.voucher}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={netSaleDisplay(o)}
                        disabled={!canEdit}
                        title={
                          o.platformFeePct > 0
                            ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาเต็ม ${fmtMoney(o.saleAmount || 0)} แล้ว — แก้ตรงนี้ให้กรอกราคาเต็มใหม่ ระบบจะหักให้อัตโนมัติ`
                            : o.saleAmountUsdt != null
                              ? `แสดง ${o.saleAmountUsdt} USDT ตามที่กรอก · กำไรคูณ USD:THB อัตโนมัติ (= ${fmtMoney(o.saleAmount)}) — แก้ตรงนี้กรอก USDT`
                            : o.saleFromPlatform
                              ? "ค่านี้ดึงจากราคาขายตามแพ็กของแพลตฟอร์มนี้ — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                              : o.saleMissingPlatformPrice
                                ? `ยังไม่มีราคาอ้างอิงของ ${platformLabel(o.platform)} สำหรับแพ็กนี้ — ตั้งได้ที่หน้า "ตั้งราคาขายตามแพ็ก"`
                                : undefined
                        }
                        onCommit={(v) => onEditOrder(o, "saleAmount", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={o.cost}
                        disabled={!canEdit}
                        title={
                          o.costFromPack
                            ? "ค่านี้มาจากต้นทุนเริ่มต้นของแพ็ก — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                            : o.costMissing
                              ? 'ยังไม่มีต้นทุนของแพ็กนี้เลย — ตั้งได้ที่หน้า "ตั้งค่าต้นทุนตามแพ็ก" หรือกรอกตรงนี้เฉพาะออเดอร์นี้'
                              : undefined
                        }
                        onCommit={(v) => onEditOrder(o, "cost", v)}
                      />
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right ${o.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      title={o.platformFeePct > 0 ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาขายก่อนคิดกำไรแล้ว` : undefined}
                    >
                      {fmtMoney(o.profit)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(o.profitPct)}</td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title="balance_before จากกระเป๋า DonShop (IDR)">
                      {o.oldBalanceIdr != null ? fmtIdr(o.oldBalanceIdr) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title="live_cost_total จากกระเป๋า DonShop (IDR) — ไม่ใช่ยอดบาท">
                      {o.deductedIdr != null ? fmtIdr(o.deductedIdr) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle">
                      {o.newBalanceIdr != null ? fmtIdr(o.newBalanceIdr) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(o.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      {o.isDuplicate ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ตัดซ้ำ</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">ปกติ</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-ll-ink-subtle">ยังไม่มีออเดอร์ที่สำเร็จในเกมนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function GamepointCardDetail({ categoryId, category, card, canEdit, platforms, onEditOrder }) {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
        <Link href="/profit" className="hover:underline">ภาพรวม</Link>
        <ChevronRight size={12} />
        <Link href={`/profit/category/${categoryId}`} className="hover:underline">{category.name}</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">{card.name}</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold text-ll-ink">{card.name}</h1>
        <p className="mt-0.5 text-[13px] text-ll-ink-subtle">
          {category.name} · เกมจาก Game Point Club (payment_method = GamePointClub) · ไม่มีบัตร/เบอร์ — จัดกลุ่มตามเกม ·
          ก่อนตัด/ยอดตัด/คงเหลือเป็น MYR จากกระเป๋า GP โชว์แยก ไม่ผสมยอดบาท ·
          กรอกต้นทุน/ราคาขาย (บาท) ได้ที่ช่องในตาราง (หรือตั้งค่าครั้งเดียวต่อแพ็กที่หน้า &quot;ตั้งค่าต้นทุน/ราคาขายตามแพ็ก&quot;)
        </p>
      </div>

      <ProfitSummaryGrid
        items={[
          { k: "ออเดอร์ (ที่สำเร็จ)", v: card.orderCount },
          { k: "ยอดขายรวม", v: fmtMoney(card.saleTotal) },
          { k: "ต้นทุนรวม", v: fmtMoney(card.costTotal) },
          { k: "กำไรรวม", v: fmtMoney(card.profitTotal), tone: card.profitTotal >= 0 ? "pos" : "neg" },
          { k: "%กำไร", v: fmtPct(card.profitPct) },
          { k: "ยอดตัดรวม (MYR)", v: card.deductedMyrTotal != null ? fmtMyr(card.deductedMyrTotal) : "-" },
          { k: "ออเดอร์ซ้ำ", v: card.duplicateCount, tone: card.duplicateCount > 0 ? "neg" : undefined },
          { k: "ตัดล่าสุด", v: fmtDate(card.lastOrderAt) },
        ]}
      />

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ll-ink">ออเดอร์</h2>
          <span className="text-[12px] text-ll-ink-subtle">{card.orders.length} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">QUEUE #</th>
                <th className="px-3 py-2 font-medium">ORDER ID</th>
                <th className="px-3 py-2 font-medium">แพ็ก</th>
                <th className="px-3 py-2 font-medium">แพลตฟอร์ม</th>
                <th className="px-3 py-2 font-medium">Ref</th>
                <th className="px-3 py-2 text-right font-medium">ราคาขาย</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-2 text-right font-medium">กำไร</th>
                <th className="px-3 py-2 text-right font-medium">%กำไร</th>
                <th className="px-3 py-2 text-right font-medium">ก่อนตัด (MYR)</th>
                <th className="px-3 py-2 text-right font-medium">ยอดตัด (MYR)</th>
                <th className="px-3 py-2 text-right font-medium">คงเหลือ (MYR)</th>
                <th className="px-3 py-2 font-medium">เวลา</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {card.orders.length ? (
                card.orders.map((o) => (
                  <tr key={o.id} className="border-b border-ll-hairline last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ll-ink">{o.txid}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.saleOrderId || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.packName || "-"}</td>
                    <td className="px-3 py-2.5">
                      <PlatformSelect
                        value={o.platform}
                        fromDb={o.platformFromDb}
                        platforms={platforms}
                        disabled={!canEdit}
                        onCommit={(v) => onEditOrder(o, "platform", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{o.referenceNo || "-"}</td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={netSaleDisplay(o)}
                        disabled={!canEdit}
                        title={
                          o.platformFeePct > 0
                            ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาเต็ม ${fmtMoney(o.saleAmount || 0)} แล้ว — แก้ตรงนี้ให้กรอกราคาเต็มใหม่ ระบบจะหักให้อัตโนมัติ`
                            : o.saleAmountUsdt != null
                              ? `แสดง ${o.saleAmountUsdt} USDT ตามที่กรอก · กำไรคูณ USD:THB อัตโนมัติ (= ${fmtMoney(o.saleAmount)}) — แก้ตรงนี้กรอก USDT`
                            : o.saleFromPlatform
                              ? "ค่านี้ดึงจากราคาขายตามแพ็กของแพลตฟอร์มนี้ — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                              : o.saleMissingPlatformPrice
                                ? `ยังไม่มีราคาอ้างอิงของ ${platformLabel(o.platform)} สำหรับแพ็กนี้ — ตั้งได้ที่หน้า "ตั้งราคาขายตามแพ็ก"`
                                : undefined
                        }
                        onCommit={(v) => onEditOrder(o, "saleAmount", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={o.cost}
                        disabled={!canEdit}
                        title={
                          o.costFromPack
                            ? "ค่านี้มาจากต้นทุนเริ่มต้นของแพ็ก — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                            : o.costMissing
                              ? 'ยังไม่มีต้นทุนของแพ็กนี้เลย — ตั้งได้ที่หน้า "ตั้งค่าต้นทุนตามแพ็ก" หรือกรอกตรงนี้เฉพาะออเดอร์นี้'
                              : undefined
                        }
                        onCommit={(v) => onEditOrder(o, "cost", v)}
                      />
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right ${o.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      title={o.platformFeePct > 0 ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาขายก่อนคิดกำไรแล้ว` : undefined}
                    >
                      {fmtMoney(o.profit)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(o.profitPct)}</td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle">
                      {o.oldBalanceMyr != null ? fmtMyr(o.oldBalanceMyr) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title={o.storedCostMyr != null ? `stored_cost = ${fmtMyr(o.storedCostMyr)}` : undefined}>
                      {o.deductedMyr != null ? fmtMyr(o.deductedMyr) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle">
                      {o.newBalanceMyr != null ? fmtMyr(o.newBalanceMyr) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(o.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      {o.isDuplicate ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ตัดซ้ำ</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">ปกติ</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-ll-ink-subtle">ยังไม่มีออเดอร์ที่สำเร็จในเกมนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Agenh2hCardDetail({ categoryId, category, card, canEdit, platforms, onEditOrder }) {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
        <Link href="/profit" className="hover:underline">ภาพรวม</Link>
        <ChevronRight size={12} />
        <Link href={`/profit/category/${categoryId}`} className="hover:underline">{category.name}</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">{card.name}</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold text-ll-ink">{card.name}</h1>
        <p className="mt-0.5 text-[13px] text-ll-ink-subtle">
          {category.name} · เกมจาก Agen H2H (payment_method = AgenH2HIDR) · ไม่มีบัตร/เบอร์ — จัดกลุ่มตามเกม ·
          ก่อนตัด/ยอดตัด/คงเหลือเป็น IDR จากกระเป๋า Agen H2H โชว์แยก ไม่ผสมยอดบาท ·
          กรอกต้นทุน/ราคาขาย (บาท) ได้ที่ช่องในตาราง (หรือตั้งค่าครั้งเดียวต่อแพ็กที่หน้า &quot;ตั้งค่าต้นทุน/ราคาขายตามแพ็ก&quot;)
        </p>
      </div>

      <ProfitSummaryGrid
        items={[
          { k: "ออเดอร์ (ที่สำเร็จ)", v: card.orderCount },
          { k: "ยอดขายรวม", v: fmtMoney(card.saleTotal) },
          { k: "ต้นทุนรวม", v: fmtMoney(card.costTotal) },
          { k: "กำไรรวม", v: fmtMoney(card.profitTotal), tone: card.profitTotal >= 0 ? "pos" : "neg" },
          { k: "%กำไร", v: fmtPct(card.profitPct) },
          { k: "ยอดตัดรวม (IDR)", v: card.deductedIdrTotal != null ? fmtIdr(card.deductedIdrTotal) : "-" },
          { k: "ออเดอร์ซ้ำ", v: card.duplicateCount, tone: card.duplicateCount > 0 ? "neg" : undefined },
          { k: "ตัดล่าสุด", v: fmtDate(card.lastOrderAt) },
        ]}
      />

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ll-ink">ออเดอร์</h2>
          <span className="text-[12px] text-ll-ink-subtle">{card.orders.length} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">QUEUE #</th>
                <th className="px-3 py-2 font-medium">ORDER ID</th>
                <th className="px-3 py-2 font-medium">แพ็ก</th>
                <th className="px-3 py-2 font-medium">แพลตฟอร์ม</th>
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 text-right font-medium">ราคาขาย</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-2 text-right font-medium">กำไร</th>
                <th className="px-3 py-2 text-right font-medium">%กำไร</th>
                <th className="px-3 py-2 text-right font-medium">ก่อนตัด (IDR)</th>
                <th className="px-3 py-2 text-right font-medium">ยอดตัด (IDR)</th>
                <th className="px-3 py-2 text-right font-medium">คงเหลือ (IDR)</th>
                <th className="px-3 py-2 font-medium">เวลา</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {card.orders.length ? (
                card.orders.map((o) => (
                  <tr key={o.id} className="border-b border-ll-hairline last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ll-ink">{o.txid}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.saleOrderId || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.packName || "-"}</td>
                    <td className="px-3 py-2.5">
                      <PlatformSelect
                        value={o.platform}
                        fromDb={o.platformFromDb}
                        platforms={platforms}
                        disabled={!canEdit}
                        onCommit={(v) => onEditOrder(o, "platform", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle" title="Invoice จาก Agen H2H API เท่านั้น">
                      <div>{o.invoiceNumber || "-"}</div>
                      {o.serialNumber && <div className="text-[11px] text-ll-ink-tertiary">{o.serialNumber}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={netSaleDisplay(o)}
                        disabled={!canEdit}
                        title={
                          o.platformFeePct > 0
                            ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาเต็ม ${fmtMoney(o.saleAmount || 0)} แล้ว — แก้ตรงนี้ให้กรอกราคาเต็มใหม่ ระบบจะหักให้อัตโนมัติ`
                            : o.saleAmountUsdt != null
                              ? `แสดง ${o.saleAmountUsdt} USDT ตามที่กรอก · กำไรคูณ USD:THB อัตโนมัติ (= ${fmtMoney(o.saleAmount)}) — แก้ตรงนี้กรอก USDT`
                            : o.saleFromPlatform
                              ? "ค่านี้ดึงจากราคาขายตามแพ็กของแพลตฟอร์มนี้ — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                              : o.saleMissingPlatformPrice
                                ? `ยังไม่มีราคาอ้างอิงของ ${platformLabel(o.platform)} สำหรับแพ็กนี้ — ตั้งได้ที่หน้า "ตั้งราคาขายตามแพ็ก"`
                                : undefined
                        }
                        onCommit={(v) => onEditOrder(o, "saleAmount", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={o.cost}
                        disabled={!canEdit}
                        title={
                          o.costFromPack
                            ? "ค่านี้มาจากต้นทุนเริ่มต้นของแพ็ก — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                            : o.costMissing
                              ? 'ยังไม่มีต้นทุนของแพ็กนี้เลย — ตั้งได้ที่หน้า "ตั้งค่าต้นทุนตามแพ็ก" หรือกรอกตรงนี้เฉพาะออเดอร์นี้'
                              : undefined
                        }
                        onCommit={(v) => onEditOrder(o, "cost", v)}
                      />
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right ${o.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      title={o.platformFeePct > 0 ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาขายก่อนคิดกำไรแล้ว` : undefined}
                    >
                      {fmtMoney(o.profit)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(o.profitPct)}</td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle">
                      {o.oldBalanceIdr != null ? fmtIdr(o.oldBalanceIdr) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle">
                      {o.deductedIdr != null ? fmtIdr(o.deductedIdr) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle">
                      {o.newBalanceIdr != null ? fmtIdr(o.newBalanceIdr) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(o.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      {o.isDuplicate ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ตัดซ้ำ</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">ปกติ</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-ll-ink-subtle">ยังไม่มีออเดอร์ที่สำเร็จในเกมนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CodaresellerCardDetail({ categoryId, category, card, canEdit, platforms, onEditOrder }) {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
        <Link href="/profit" className="hover:underline">ภาพรวม</Link>
        <ChevronRight size={12} />
        <Link href={`/profit/category/${categoryId}`} className="hover:underline">{category.name}</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">{card.name}</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold text-ll-ink">{card.name}</h1>
        <p className="mt-0.5 text-[13px] text-ll-ink-subtle">
          {category.name} · เกมจาก Codashop Reseller (payment_method = CodashopUSD) · ไม่ใช่บอท Sky Codashop ·
          จัดกลุ่มตามเกม · ก่อนตัด/ยอดตัด/คงเหลือ (USD) จาก inventory_transactions (ตัวเลขเดียวกับ Telegram Old/New Balance) ·
          กรอกต้นทุน/ราคาขาย (บาท) ได้ที่ช่องในตาราง (หรือตั้งค่าครั้งเดียวต่อแพ็กที่หน้า &quot;ตั้งค่าต้นทุน/ราคาขายตามแพ็ก&quot;)
        </p>
      </div>

      <ProfitSummaryGrid
        items={[
          { k: "ออเดอร์ (ที่สำเร็จ)", v: card.orderCount },
          { k: "ยอดขายรวม", v: fmtMoney(card.saleTotal) },
          { k: "ต้นทุนรวม", v: fmtMoney(card.costTotal) },
          { k: "กำไรรวม", v: fmtMoney(card.profitTotal), tone: card.profitTotal >= 0 ? "pos" : "neg" },
          { k: "%กำไร", v: fmtPct(card.profitPct) },
          { k: "ยอดตัดรวม (USD)", v: card.deductedUsdTotal != null ? fmtUsd(card.deductedUsdTotal) : "-" },
          { k: "ออเดอร์ซ้ำ", v: card.duplicateCount, tone: card.duplicateCount > 0 ? "neg" : undefined },
          { k: "ตัดล่าสุด", v: fmtDate(card.lastOrderAt) },
        ]}
      />

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ll-ink">ออเดอร์</h2>
          <span className="text-[12px] text-ll-ink-subtle">{card.orders.length} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">QUEUE #</th>
                <th className="px-3 py-2 font-medium">ORDER ID</th>
                <th className="px-3 py-2 font-medium">แพ็ก</th>
                <th className="px-3 py-2 font-medium">แพลตฟอร์ม</th>
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 text-right font-medium">ราคาขาย</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-2 text-right font-medium">กำไร</th>
                <th className="px-3 py-2 text-right font-medium">%กำไร</th>
                <th className="px-3 py-2 text-right font-medium">ก่อนตัด (USD)</th>
                <th className="px-3 py-2 text-right font-medium">ยอดตัด (USD)</th>
                <th className="px-3 py-2 text-right font-medium">คงเหลือ (USD)</th>
                <th className="px-3 py-2 font-medium">เวลา</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {card.orders.length ? (
                card.orders.map((o) => (
                  <tr key={o.id} className="border-b border-ll-hairline last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ll-ink">{o.txid}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.saleOrderId || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.packName || "-"}</td>
                    <td className="px-3 py-2.5">
                      <PlatformSelect
                        value={o.platform}
                        fromDb={o.platformFromDb}
                        platforms={platforms}
                        disabled={!canEdit}
                        onCommit={(v) => onEditOrder(o, "platform", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle" title="Codashop orderId จาก provider_response">
                      <div>{o.invoiceNumber || "-"}</div>
                      {o.skuIds && <div className="text-[11px] text-ll-ink-tertiary">{o.skuIds}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={netSaleDisplay(o)}
                        disabled={!canEdit}
                        title={
                          o.platformFeePct > 0
                            ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาเต็ม ${fmtMoney(o.saleAmount || 0)} แล้ว — แก้ตรงนี้ให้กรอกราคาเต็มใหม่ ระบบจะหักให้อัตโนมัติ`
                            : o.saleAmountUsdt != null
                              ? `แสดง ${o.saleAmountUsdt} USDT ตามที่กรอก · กำไรคูณ USD:THB อัตโนมัติ (= ${fmtMoney(o.saleAmount)}) — แก้ตรงนี้กรอก USDT`
                            : o.saleFromPlatform
                              ? "ค่านี้ดึงจากราคาขายตามแพ็กของแพลตฟอร์มนี้ — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                              : o.saleMissingPlatformPrice
                                ? `ยังไม่มีราคาอ้างอิงของ ${platformLabel(o.platform)} สำหรับแพ็กนี้ — ตั้งได้ที่หน้า "ตั้งราคาขายตามแพ็ก"`
                                : undefined
                        }
                        onCommit={(v) => onEditOrder(o, "saleAmount", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={o.cost}
                        disabled={!canEdit}
                        title={
                          o.costFromPack
                            ? "ค่านี้มาจากต้นทุนเริ่มต้นของแพ็ก — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                            : o.costMissing
                              ? 'ยังไม่มีต้นทุนของแพ็กนี้เลย — ตั้งได้ที่หน้า "ตั้งค่าต้นทุนตามแพ็ก" หรือกรอกตรงนี้เฉพาะออเดอร์นี้'
                              : undefined
                        }
                        onCommit={(v) => onEditOrder(o, "cost", v)}
                      />
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right ${o.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      title={o.platformFeePct > 0 ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาขายก่อนคิดกำไรแล้ว` : undefined}
                    >
                      {fmtMoney(o.profit)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(o.profitPct)}</td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title="Old Balance จาก inventory (= Telegram)">
                      {o.oldBalanceUsd != null ? fmtUsd(o.oldBalanceUsd) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title={o.packPriceRaw ? `amount_used / pack_price = ${o.packPriceRaw}` : "ยอดตัด USD"}>
                      {o.deductedUsd != null ? fmtUsd(o.deductedUsd) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title="New Balance จาก inventory (= Telegram)">
                      {o.newBalanceUsd != null ? fmtUsd(o.newBalanceUsd) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(o.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      {o.isDuplicate ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ตัดซ้ำ</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">ปกติ</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-ll-ink-subtle">ยังไม่มีออเดอร์ที่สำเร็จในเกมนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NeteaseCardDetail({ categoryId, category, card, canEdit, platforms, onEditOrder }) {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
        <Link href="/profit" className="hover:underline">ภาพรวม</Link>
        <ChevronRight size={12} />
        <Link href={`/profit/category/${categoryId}`} className="hover:underline">{category.name}</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">{card.name}</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold text-ll-ink">{card.name}</h1>
        <p className="mt-0.5 text-[13px] text-ll-ink-subtle">
          {category.name} · เกมจาก netease_purchase_history · จัดกลุ่มตามเกม ·
          ก่อนตัด/ยอดตัด/คงเหลือ (USD) จาก old_balance / deducted / new_balance ·
          กรอกต้นทุน/ราคาขาย (บาท) ได้ที่ช่องในตาราง (หรือตั้งค่าครั้งเดียวต่อแพ็กที่หน้า &quot;ตั้งค่าต้นทุน/ราคาขายตามแพ็ก&quot;)
        </p>
      </div>

      <ProfitSummaryGrid
        items={[
          { k: "ออเดอร์", v: card.orderCount },
          { k: "ยอดขายรวม", v: fmtMoney(card.saleTotal) },
          { k: "ต้นทุนรวม", v: fmtMoney(card.costTotal) },
          { k: "กำไรรวม", v: fmtMoney(card.profitTotal), tone: card.profitTotal >= 0 ? "pos" : "neg" },
          { k: "%กำไร", v: fmtPct(card.profitPct) },
          { k: "ยอดตัดรวม (USD)", v: card.deductedUsdTotal != null ? fmtUsd(card.deductedUsdTotal) : "-" },
          { k: "ออเดอร์ซ้ำ", v: card.duplicateCount, tone: card.duplicateCount > 0 ? "neg" : undefined },
          { k: "ตัดล่าสุด", v: fmtDate(card.lastOrderAt) },
        ]}
      />

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ll-ink">ออเดอร์</h2>
          <span className="text-[12px] text-ll-ink-subtle">{card.orders.length} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">QUEUE #</th>
                <th className="px-3 py-2 font-medium">ORDER ID</th>
                <th className="px-3 py-2 font-medium">แพ็ก</th>
                <th className="px-3 py-2 font-medium">แพลตฟอร์ม</th>
                <th className="px-3 py-2 font-medium">Netease #</th>
                <th className="px-3 py-2 text-right font-medium">ราคาขาย</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-2 text-right font-medium">กำไร</th>
                <th className="px-3 py-2 text-right font-medium">%กำไร</th>
                <th className="px-3 py-2 text-right font-medium">ก่อนตัด (USD)</th>
                <th className="px-3 py-2 text-right font-medium">ยอดตัด (USD)</th>
                <th className="px-3 py-2 text-right font-medium">คงเหลือ (USD)</th>
                <th className="px-3 py-2 font-medium">เวลา</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {card.orders.length ? (
                card.orders.map((o) => (
                  <tr key={o.id} className="border-b border-ll-hairline last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ll-ink">{o.txid}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.saleOrderId || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.packName || "-"}</td>
                    <td className="px-3 py-2.5">
                      <PlatformSelect
                        value={o.platform}
                        fromDb={o.platformFromDb}
                        platforms={platforms}
                        disabled={!canEdit}
                        onCommit={(v) => onEditOrder(o, "platform", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle" title="netease_order_no / อีเมลซื้อ">
                      <div>{o.neteaseOrderNo || "-"}</div>
                      {o.purchaseEmail && <div className="text-[11px] text-ll-ink-tertiary">{o.purchaseEmail}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={netSaleDisplay(o)}
                        disabled={!canEdit}
                        title={
                          o.platformFeePct > 0
                            ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาเต็ม ${fmtMoney(o.saleAmount || 0)} แล้ว — แก้ตรงนี้ให้กรอกราคาเต็มใหม่ ระบบจะหักให้อัตโนมัติ`
                            : o.saleAmountUsdt != null
                              ? `แสดง ${o.saleAmountUsdt} USDT ตามที่กรอก · กำไรคูณ USD:THB อัตโนมัติ (= ${fmtMoney(o.saleAmount)}) — แก้ตรงนี้กรอก USDT`
                            : o.saleFromPlatform
                              ? "ค่านี้ดึงจากราคาขายตามแพ็กของแพลตฟอร์มนี้ — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                              : o.saleMissingPlatformPrice
                                ? `ยังไม่มีราคาอ้างอิงของ ${platformLabel(o.platform)} สำหรับแพ็กนี้ — ตั้งได้ที่หน้า "ตั้งราคาขายตามแพ็ก"`
                                : undefined
                        }
                        onCommit={(v) => onEditOrder(o, "saleAmount", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={o.cost}
                        disabled={!canEdit}
                        title={
                          o.costFromPack
                            ? "ค่านี้มาจากต้นทุนเริ่มต้นของแพ็ก — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                            : o.costMissing
                              ? 'ยังไม่มีต้นทุนของแพ็กนี้เลย — ตั้งได้ที่หน้า "ตั้งค่าต้นทุนตามแพ็ก" หรือกรอกตรงนี้เฉพาะออเดอร์นี้'
                              : undefined
                        }
                        onCommit={(v) => onEditOrder(o, "cost", v)}
                      />
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right ${o.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      title={o.platformFeePct > 0 ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาขายก่อนคิดกำไรแล้ว` : undefined}
                    >
                      {fmtMoney(o.profit)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(o.profitPct)}</td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title="old_balance จาก netease_purchase_history">
                      {o.oldBalanceUsd != null ? fmtUsd(o.oldBalanceUsd) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title="deducted จาก netease_purchase_history">
                      {o.deductedUsd != null ? fmtUsd(o.deductedUsd) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title="new_balance จาก netease_purchase_history">
                      {o.newBalanceUsd != null ? fmtUsd(o.newBalanceUsd) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(o.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      {o.isDuplicate ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ตัดซ้ำ</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">ปกติ</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-ll-ink-subtle">ยังไม่มีออเดอร์ในเกมนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function OxideCardDetail({ categoryId, category, card, canEdit, platforms, onEditOrder, onToggleMergeCleared }) {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
        <Link href="/profit" className="hover:underline">ภาพรวม</Link>
        <ChevronRight size={12} />
        <Link href={`/profit/category/${categoryId}`} className="hover:underline">{category.name}</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">{card.name}</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold text-ll-ink">{card.name}</h1>
        <p className="mt-0.5 text-[13px] text-ll-ink-subtle">
          {category.name} · บัตร MOL MultiGameCard · ประวัติออเดอร์ดึงจาก codashop_orders (เฉพาะออเดอร์ที่สำเร็จ) ·
          ก่อนตัด/ยอดตัด/คงเหลือ เป็นแต้ม (pts) อ่านจากประวัติการไถ่บัตรจริงต่อออเดอร์ ·
          กรอกต้นทุน/ราคาขายได้ที่ช่องในตาราง (หรือตั้งค่าครั้งเดียวต่อแพ็กที่หน้า &quot;ตั้งค่าต้นทุน/ราคาขายตามแพ็ก&quot;)
        </p>
      </div>

      <ProfitSummaryGrid
        items={[
          { k: "สถานะ", v: card.status === "active" ? "เปิดใช้งาน" : "ปิดใช้งาน", tone: card.status === "active" ? undefined : "neg" },
          { k: "คงเหลือ", v: fmtPoints(card.balancePoints) },
          { k: "ออเดอร์ (ที่สำเร็จ)", v: card.orderCount },
          { k: "ยอดขายรวม", v: fmtMoney(card.saleTotal) },
          { k: "ต้นทุนรวม", v: fmtMoney(card.costTotal) },
          { k: "กำไรรวม", v: fmtMoney(card.profitTotal), tone: card.profitTotal >= 0 ? "pos" : "neg" },
          { k: "ออเดอร์ซ้ำ", v: card.duplicateCount, tone: card.duplicateCount > 0 ? "neg" : undefined },
          { k: "ยอดตัดรวม (pts)", v: fmtPoints(card.deductedPointsTotal) },
          { k: "ตัดล่าสุด", v: fmtDate(card.lastOrderAt) },
        ]}
      />

      {card.isIdle && (
        <MergePanel card={card} canEdit={canEdit} onToggle={onToggleMergeCleared} />
      )}

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ll-ink">ออเดอร์</h2>
          <span className="text-[12px] text-ll-ink-subtle">{card.orders.length} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">QUEUE #</th>
                <th className="px-3 py-2 font-medium">ORDER ID</th>
                <th className="px-3 py-2 font-medium">เกม</th>
                <th className="px-3 py-2 font-medium">แพ็ก</th>
                <th className="px-3 py-2 font-medium">แพลตฟอร์ม</th>
                <th className="px-3 py-2 text-right font-medium">ราคาขาย</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-2 text-right font-medium">กำไร</th>
                <th className="px-3 py-2 text-right font-medium">%กำไร</th>
                <th className="px-3 py-2 text-right font-medium">ก่อนตัด (pts)</th>
                <th className="px-3 py-2 text-right font-medium">ยอดตัด (pts)</th>
                <th className="px-3 py-2 text-right font-medium">คงเหลือ (pts)</th>
                <th className="px-3 py-2 font-medium">เวลา</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {card.orders.length ? (
                card.orders.map((o) => (
                  <tr key={o.id} className="border-b border-ll-hairline last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ll-ink">{o.txid}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.saleOrderId || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{o.gameName || "-"}</td>
                    <td className="px-3 py-2.5">
                      <div className="text-ll-ink">{o.packName || "-"}</div>
                      {o.priceUsdApprox != null && (
                        <div className="text-[11px] text-ll-ink-tertiary">≈ {fmtUsd(o.priceUsdApprox)} (codashop)</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <PlatformSelect
                        value={o.platform}
                        fromDb={o.platformFromDb}
                        platforms={platforms}
                        disabled={!canEdit}
                        onCommit={(v) => onEditOrder(o,"platform", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={netSaleDisplay(o)}
                        disabled={!canEdit}
                        title={
                          o.platformFeePct > 0
                            ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาเต็ม ${fmtMoney(o.saleAmount || 0)} แล้ว — แก้ตรงนี้ให้กรอกราคาเต็มใหม่ ระบบจะหักให้อัตโนมัติ`
                            : o.saleAmountUsdt != null
                              ? `แสดง ${o.saleAmountUsdt} USDT ตามที่กรอก · กำไรคูณ USD:THB อัตโนมัติ (= ${fmtMoney(o.saleAmount)}) — แก้ตรงนี้กรอก USDT`
                            : o.saleFromPlatform
                              ? "ค่านี้ดึงจากราคาขายตามแพ็กของแพลตฟอร์มนี้ — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                              : o.saleMissingPlatformPrice
                                ? `ยังไม่มีราคาอ้างอิงของ ${platformLabel(o.platform)} สำหรับแพ็กนี้ — ตั้งได้ที่หน้า "ตั้งราคาขายตามแพ็ก"`
                                : undefined
                        }
                        onCommit={(v) => onEditOrder(o,"saleAmount", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={o.cost}
                        disabled={!canEdit}
                        title={
                          o.costFromPack
                            ? "ค่านี้มาจากต้นทุนเริ่มต้นของแพ็ก — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                            : o.costFromTelegram
                              ? `ค่านี้ดึงจากราคาจริงที่ระบบส่งเข้าคิว Telegram ตอนเติม (${o.telegramSource === "russia" ? "แปลงจาก USD" : "THB"}) — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้`
                              : o.costMissing
                                ? 'ยังไม่มีต้นทุนของแพ็กนี้เลย — ตั้งได้ที่หน้า "ตั้งค่าต้นทุนตามแพ็ก" หรือกรอกตรงนี้เฉพาะออเดอร์นี้'
                                : undefined
                        }
                        onCommit={(v) => onEditOrder(o,"cost", v)}
                      />
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right ${o.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      title={o.platformFeePct > 0 ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาขายก่อนคิดกำไรแล้ว` : undefined}
                    >
                      {fmtMoney(o.profit)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(o.profitPct)}</td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title="อ่านจากประวัติการตัดบัตรจริงตอนไถ่บัตร (provider_response) — ไม่ใช่ยอด USD/THB">
                      {o.oldBalancePoints != null ? fmtPoints(o.oldBalancePoints) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle">
                      {o.deductedPoints != null ? fmtPoints(o.deductedPoints) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle">
                      {o.newBalancePoints != null ? fmtPoints(o.newBalancePoints) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(o.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      {o.isDuplicate ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ตัดซ้ำ</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">ปกติ</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-ll-ink-subtle">ยังไม่มีออเดอร์ที่สำเร็จบนบัตรนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
