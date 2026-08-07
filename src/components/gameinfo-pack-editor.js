"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import GameinfoMemoryInput from "./gameinfo-memory-input";
import GameinfoTagsInput from "./gameinfo-tags-input";
import GameinfoImagePreview from "./gameinfo-image-preview";
import GameinfoComputedEditor from "./gameinfo-computed-editor";
import { apiJson } from "@/lib/api-json";
import { evaluateFormula, parseFormula } from "@/lib/gamedb-formula";
import { formatCell } from "@/lib/gamedb-layout";
import { GAMEINFO_FIELD_NAMES, resolveGameinfoField } from "@/lib/gameinfo-formula-fields";

const REQUIRED_PACK_FIELDS = ["name", "price", "amountChargedFee", "channelsMain"];

function numericOnly(s) {
  return s.replace(/[^0-9.]/g, "");
}

function genId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function firstPack(currencies) {
  for (const c of currencies) {
    for (const cat of c.categories) {
      if (cat.packs.length) return cat.packs[0];
    }
  }
  return null;
}

// Pack/currency/category editor + game-level computed columns. Ported from
// gameinfo's PackEditor.tsx with CSV import and per-cell formula overrides
// dropped (out of scope, see plan) and computePackCell/FORMULA_TOKENS
// (gameinfo's own engine) replaced by systemdb's gamedb-formula.js so
// formulas stay editable from both surfaces.
export default function GameinfoPackEditor({ game, lang, suggestions }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const [currencies, setCurrencies] = useState(game.currencies);
  const [computedColumns, setComputedColumns] = useState(game.computedColumns ?? []);
  const [invalidFields, setInvalidFields] = useState(new Set());

  const vpnOn = game.vpn === "YES";

  const parsedColumns = useMemo(
    () =>
      computedColumns.map((col) => {
        try {
          return { ...col, ast: parseFormula(col.formula) };
        } catch {
          return { ...col, ast: null };
        }
      }),
    [computedColumns]
  );

  const sampleRow = useMemo(() => {
    const pack = firstPack(currencies);
    if (!pack) return null;
    const row = {};
    for (const label of GAMEINFO_FIELD_NAMES) row[label] = resolveGameinfoField(pack, game, label);
    return row;
  }, [currencies, game]);

  function updateCurrencies(fn) {
    setCurrencies((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
  }

  function addCurrency() {
    updateCurrencies((draft) => {
      draft.push({ id: genId("c"), name: "", image: "", categories: [] });
    });
  }
  function removeCurrency(cIdx) {
    if (!confirm("ลบสกุลเงินนี้พร้อมหมวดหมู่และแพ็กทั้งหมด?")) return;
    updateCurrencies((draft) => {
      draft.splice(cIdx, 1);
    });
  }

  function addCategory(cIdx) {
    updateCurrencies((draft) => {
      draft[cIdx].categories.push({ id: genId("cat"), name: "", packs: [] });
    });
  }
  function removeCategory(cIdx, catIdx) {
    if (!confirm("ลบหมวดหมู่นี้พร้อมแพ็กทั้งหมด?")) return;
    updateCurrencies((draft) => {
      draft[cIdx].categories.splice(catIdx, 1);
    });
  }

  function addPack(cIdx, catIdx) {
    updateCurrencies((draft) => {
      draft[cIdx].categories[catIdx].packs.push({
        id: genId("pk"),
        name: "",
        image: "",
        price: "",
        amountCharged: "",
        amountChargedFee: "",
        channelsMain: [],
        channelsSecondary: [],
        country: "",
      });
    });
  }
  function removePack(cIdx, catIdx, pkIdx) {
    const packId = currencies[cIdx]?.categories[catIdx]?.packs[pkIdx]?.id;
    updateCurrencies((draft) => {
      draft[cIdx].categories[catIdx].packs.splice(pkIdx, 1);
    });
    if (packId) {
      setInvalidFields((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const f of REQUIRED_PACK_FIELDS) next.delete(`${packId}:${f}`);
        return next;
      });
    }
  }
  function updatePack(cIdx, catIdx, pkIdx, patch) {
    updateCurrencies((draft) => {
      Object.assign(draft[cIdx].categories[catIdx].packs[pkIdx], patch);
    });
    const packId = currencies[cIdx]?.categories[catIdx]?.packs[pkIdx]?.id;
    if (packId && invalidFields.size > 0) {
      setInvalidFields((prev) => {
        const next = new Set(prev);
        if ("name" in patch && (patch.name ?? "").trim()) next.delete(`${packId}:name`);
        if ("price" in patch && (patch.price ?? "").trim()) next.delete(`${packId}:price`);
        if ("amountChargedFee" in patch && (patch.amountChargedFee ?? "").trim())
          next.delete(`${packId}:amountChargedFee`);
        if ("channelsMain" in patch && (patch.channelsMain ?? []).length > 0)
          next.delete(`${packId}:channelsMain`);
        return next;
      });
    }
  }

  function addComputedColumn({ key, label, formula, type }) {
    setComputedColumns((prev) => [...prev, { key, label, formula, type }]);
    setModalOpen(false);
  }
  function removeComputedColumn(key) {
    setComputedColumns((prev) => prev.filter((c) => c.key !== key));
  }
  function moveComputedColumn(key, dir) {
    setComputedColumns((prev) => {
      const i = prev.findIndex((c) => c.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function validatePacks() {
    const invalid = new Set();
    for (const c of currencies) {
      for (const cat of c.categories) {
        for (const p of cat.packs) {
          if (!p.name.trim()) invalid.add(`${p.id}:name`);
          if (!(p.price ?? "").trim()) invalid.add(`${p.id}:price`);
          if (!(p.amountChargedFee ?? "").trim()) invalid.add(`${p.id}:amountChargedFee`);
          if (p.channelsMain.length === 0) invalid.add(`${p.id}:channelsMain`);
        }
      }
    }
    return invalid;
  }

  function save() {
    setError("");
    const invalid = validatePacks();
    if (invalid.size > 0) {
      setInvalidFields(invalid);
      setError(
        "กรุณากรอกข้อมูลให้ครบก่อนบันทึก: ชื่อ pack, ราคา, ยอดที่กด + fee, ช่องทางหลัก (ช่องที่ไฮไลต์สีแดง)"
      );
      return;
    }
    setInvalidFields(new Set());
    startTransition(async () => {
      try {
        await apiJson(`/api/gameinfo/games/${game.id}/packs`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currencies, computedColumns }),
        });
        setSavedAt(Date.now());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  function cancel() {
    if (!confirm("ยกเลิกการแก้ไข? ข้อมูลที่ยังไม่บันทึกจะหายไป")) return;
    setCurrencies(game.currencies);
    setComputedColumns(game.computedColumns ?? []);
    setInvalidFields(new Set());
    setError("");
    setSavedAt(null);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-700">คอลัมน์สูตร ({computedColumns.length})</h2>
            <p className="text-xs text-slate-500">
              คำนวณจากฟิลด์จริงของแต่ละแพ็ก (ราคา, ยอดที่กด, ยอดที่กด + fee ฯลฯ) — สูตรเดียวกับที่ใช้ในระบบ
              systemdb แก้ไขได้จากทั้งสองฝั่ง
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="shrink-0 rounded-md border border-indigo-300 px-3 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
          >
            + เพิ่มคอลัมน์/สูตร
          </button>
        </div>

        {computedColumns.length === 0 ? (
          <p className="text-xs text-slate-400">ยังไม่มีคอลัมน์สูตร — กด &quot;+ เพิ่มคอลัมน์/สูตร&quot;</p>
        ) : (
          <div className="space-y-1.5">
            {computedColumns.map((fc, i) => (
              <div key={fc.key} className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                <span className="w-8 shrink-0 text-xs text-slate-400">#{i + 1}</span>
                <span className="w-40 shrink-0 truncate text-sm font-medium text-slate-700">
                  {fc.label}
                </span>
                <code className="min-w-0 flex-1 truncate text-xs text-indigo-700">{fc.formula}</code>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => moveComputedColumn(fc.key, -1)}
                    disabled={i === 0}
                    className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-500 hover:bg-white disabled:opacity-30"
                    title="เลื่อนซ้าย"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => moveComputedColumn(fc.key, 1)}
                    disabled={i === computedColumns.length - 1}
                    className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-500 hover:bg-white disabled:opacity-30"
                    title="เลื่อนขวา"
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    onClick={() => removeComputedColumn(fc.key)}
                    className="flex h-7 items-center rounded bg-red-50 px-2 text-xs text-red-600 hover:bg-red-100"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">สกุลเงิน ({currencies.length})</h2>
          <button
            type="button"
            onClick={addCurrency}
            className="rounded-md border border-indigo-300 px-3 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
          >
            + เพิ่มสกุลเงิน
          </button>
        </div>

        {currencies.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            ยังไม่มีสกุลเงิน — กด &quot;เพิ่มสกุลเงิน&quot; เพื่อเริ่มสร้างแพ็ก
          </div>
        )}

        <div className="space-y-4">
          {currencies.map((currency, cIdx) => (
            <div key={currency.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex flex-1 items-center gap-3">
                  <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-600">
                    สกุลที่ {cIdx + 1}
                  </span>
                  <ImageUrlField
                    value={currency.image ?? ""}
                    onChange={(v) =>
                      updateCurrencies((d) => {
                        d[cIdx].image = v;
                      })
                    }
                  />
                  <div className="w-56">
                    <GameinfoMemoryInput
                      value={currency.name}
                      onChange={(v) =>
                        updateCurrencies((d) => {
                          d[cIdx].name = v;
                        })
                      }
                      suggestions={suggestions?.currencyNames || []}
                      placeholder="ชื่อสกุลเงิน เช่น Diamonds"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeCurrency(cIdx)}
                  className="shrink-0 rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                >
                  ลบสกุลเงิน
                </button>
              </div>

              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-600">หมวดหมู่ pack</h3>
                <button
                  type="button"
                  onClick={() => addCategory(cIdx)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  + เพิ่มหมวดหมู่
                </button>
              </div>

              <div className="space-y-3">
                {currency.categories.map((cat, catIdx) => (
                  <CategoryBlock
                    key={cat.id}
                    category={cat}
                    suggestions={suggestions}
                    vpnOn={vpnOn}
                    game={game}
                    computedColumns={parsedColumns}
                    invalidFields={invalidFields}
                    onRenameCategory={(name) =>
                      updateCurrencies((d) => {
                        d[cIdx].categories[catIdx].name = name;
                      })
                    }
                    onRemoveCategory={() => removeCategory(cIdx, catIdx)}
                    onAddPack={() => addPack(cIdx, catIdx)}
                    onUpdatePack={(pkIdx, patch) => updatePack(cIdx, catIdx, pkIdx, patch)}
                    onRemovePack={(pkIdx) => removePack(cIdx, catIdx, pkIdx)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="sticky bottom-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "บันทึกตารางแพ็ก"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="rounded-md border border-slate-300 px-5 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          ยกเลิก
        </button>
        {savedAt && !pending && <span className="text-sm text-emerald-600">บันทึกแล้ว ✓</span>}
      </div>

      {modalOpen && (
        <GameinfoComputedEditor
          sampleRow={sampleRow}
          onClose={() => setModalOpen(false)}
          onAdd={addComputedColumn}
        />
      )}
    </div>
  );
}

function CategoryBlock({
  category,
  suggestions,
  vpnOn,
  game,
  computedColumns,
  invalidFields,
  onRenameCategory,
  onRemoveCategory,
  onAddPack,
  onUpdatePack,
  onRemovePack,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const grid = packGridTemplate(vpnOn, computedColumns.length);

  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-200"
            title={collapsed ? "ขยายหมวดหมู่" : "พับเก็บหมวดหมู่"}
            aria-label={collapsed ? "ขยายหมวดหมู่" : "พับเก็บหมวดหมู่"}
          >
            <span className={`inline-block text-xs transition-transform ${collapsed ? "-rotate-90" : ""}`}>
              ▾
            </span>
          </button>
          <div className="w-56 shrink-0">
            <GameinfoMemoryInput
              value={category.name}
              onChange={onRenameCategory}
              suggestions={suggestions?.categoryNames || []}
              placeholder="ชื่อหมวดหมู่ เช่น เติมปกติ"
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <span className="shrink-0 text-xs text-slate-400">({category.packs.length} แพ็ก)</span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onAddPack}
            className="rounded-md border border-indigo-300 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
          >
            + เพิ่ม pack
          </button>
          <button
            type="button"
            onClick={onRemoveCategory}
            className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
          >
            ลบหมวดหมู่
          </button>
        </div>
      </div>

      {collapsed ? null : category.packs.length === 0 ? (
        <p className="px-1 py-2 text-xs text-slate-400">ยังไม่มี pack</p>
      ) : (
        <div className="scroll-x rounded-md border border-slate-200 bg-white">
          <div style={{ minWidth: grid.minWidth }}>
            <div
              style={{ gridTemplateColumns: grid.template }}
              className="grid gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-400"
            >
              <span></span>
              <span className="px-2">รูป</span>
              <span className="px-2">ชื่อ pack</span>
              <span className="px-2">ราคา</span>
              <span className="px-2">ยอดที่กด</span>
              <span className="px-2">ยอดที่กด + fee</span>
              <span className="px-2">ช่องทางหลัก</span>
              <span className="px-2">ช่องทางรอง</span>
              {vpnOn && <span className="px-2">ประเทศ (VPN)</span>}
              {computedColumns.map((fc, i) => (
                <span key={fc.key} className="truncate px-2 text-indigo-500">
                  {fc.label || `สูตร ${i + 1}`}
                </span>
              ))}
              <span></span>
            </div>
            {category.packs.map((pack, pkIdx) => (
              <PackRow
                key={pack.id}
                index={pkIdx + 1}
                pack={pack}
                game={game}
                suggestions={suggestions}
                vpnOn={vpnOn}
                computedColumns={computedColumns}
                gridTemplate={grid.template}
                invalid={{
                  name: invalidFields.has(`${pack.id}:name`),
                  price: invalidFields.has(`${pack.id}:price`),
                  amountChargedFee: invalidFields.has(`${pack.id}:amountChargedFee`),
                  channelsMain: invalidFields.has(`${pack.id}:channelsMain`),
                }}
                onUpdate={(patch) => onUpdatePack(pkIdx, patch)}
                onRemove={() => onRemovePack(pkIdx)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PackRow({
  index,
  pack,
  game,
  suggestions,
  vpnOn,
  computedColumns,
  gridTemplate,
  invalid,
  onUpdate,
  onRemove,
}) {
  const [editing, setEditing] = useState(null);
  const isEditing = (field) => editing === field;

  return (
    <div
      style={{ gridTemplateColumns: gridTemplate }}
      className="grid items-center gap-2 border-b border-slate-100 px-2 py-2 text-sm last:border-b-0"
    >
      <span className="text-xs text-slate-400">{index}.</span>

      <ImageUrlField value={pack.image ?? ""} onChange={(v) => onUpdate({ image: v })} compact />

      <PackCell
        editing={isEditing("name")}
        value={pack.name}
        placeholder="ชื่อ pack เช่น 86 Diamonds"
        invalid={invalid.name}
        onStartEdit={() => setEditing("name")}
        onCommit={() => setEditing(null)}
      >
        <input
          autoFocus
          value={pack.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="ชื่อ pack เช่น 86 Diamonds"
          className="h-9 w-full rounded border border-indigo-300 px-2 text-sm outline-none"
        />
      </PackCell>

      <PackCell
        editing={isEditing("price")}
        value={pack.price ?? ""}
        placeholder="ราคา"
        invalid={invalid.price}
        onStartEdit={() => setEditing("price")}
        onCommit={() => setEditing(null)}
      >
        <input
          autoFocus
          inputMode="decimal"
          value={pack.price ?? ""}
          onChange={(e) => onUpdate({ price: numericOnly(e.target.value) })}
          placeholder="ราคา"
          className="h-9 w-full rounded border border-indigo-300 px-2 text-sm outline-none"
        />
      </PackCell>

      <PackCell
        editing={isEditing("amountCharged")}
        value={pack.amountCharged ?? ""}
        placeholder="ยอดที่กด"
        onStartEdit={() => setEditing("amountCharged")}
        onCommit={() => setEditing(null)}
      >
        <input
          autoFocus
          inputMode="decimal"
          value={pack.amountCharged ?? ""}
          onChange={(e) => onUpdate({ amountCharged: numericOnly(e.target.value) })}
          placeholder="ยอดที่กด"
          className="h-9 w-full rounded border border-indigo-300 px-2 text-sm outline-none"
        />
      </PackCell>

      <PackCell
        editing={isEditing("amountChargedFee")}
        value={pack.amountChargedFee ?? ""}
        placeholder="ยอดที่กด + fee"
        invalid={invalid.amountChargedFee}
        onStartEdit={() => setEditing("amountChargedFee")}
        onCommit={() => setEditing(null)}
      >
        <input
          autoFocus
          inputMode="decimal"
          value={pack.amountChargedFee ?? ""}
          onChange={(e) => onUpdate({ amountChargedFee: numericOnly(e.target.value) })}
          placeholder="ยอดที่กด + fee"
          className="h-9 w-full rounded border border-indigo-300 px-2 text-sm outline-none"
        />
      </PackCell>

      <GameinfoTagsInput
        values={pack.channelsMain}
        onChange={(v) => onUpdate({ channelsMain: v })}
        suggestions={suggestions?.channels || []}
        placeholder="พิมพ์แล้ว Enter"
        invalid={invalid.channelsMain}
      />

      <GameinfoTagsInput
        values={pack.channelsSecondary}
        onChange={(v) => onUpdate({ channelsSecondary: v })}
        suggestions={suggestions?.channels || []}
        placeholder="พิมพ์แล้ว Enter"
      />

      {vpnOn && (
        <PackCell
          editing={isEditing("country")}
          value={pack.country ?? ""}
          placeholder="ประเทศ"
          onStartEdit={() => setEditing("country")}
          onCommit={() => setEditing(null)}
        >
          <GameinfoMemoryInput
            value={pack.country ?? ""}
            onChange={(v) => onUpdate({ country: v })}
            suggestions={suggestions?.countries || []}
            placeholder="เลือก/พิมพ์ชื่อประเทศ"
            className="h-9 w-full rounded border border-indigo-300 px-2 text-sm outline-none"
            autoFocus
          />
        </PackCell>
      )}

      {computedColumns.map((fc) => {
        const value = fc.ast
          ? evaluateFormula(fc.ast, (label) => resolveGameinfoField(pack, game, label))
          : null;
        return (
          <span key={fc.key} className="truncate px-2 text-slate-600">
            {formatCell(value, fc.type)}
          </span>
        );
      })}

      <button
        type="button"
        onClick={onRemove}
        className="justify-self-end rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
      >
        ลบ pack
      </button>
    </div>
  );
}

function PackCell({ editing, value, placeholder, invalid, onStartEdit, onCommit, children }) {
  if (editing) return <PackCellEditBox onCommit={onCommit}>{children}</PackCellEditBox>;
  return (
    <span
      onClick={onStartEdit}
      className={`flex h-9 cursor-pointer items-center truncate rounded border px-2 text-slate-600 ${
        invalid ? "border-red-300" : "border-transparent hover:bg-slate-50"
      }`}
    >
      {value || <span className="text-slate-300">{placeholder ?? "-"}</span>}
    </span>
  );
}

function PackCellEditBox({ onCommit, children }) {
  const ref = useRef(null);
  return (
    <div
      ref={ref}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget)) onCommit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") document.activeElement?.blur();
        if (e.key === "Escape") onCommit();
      }}
    >
      {children}
    </div>
  );
}

// Pack/currency image field for v1: paste a URL rather than uploading a file
// (see plan) — kept as its own component so swapping in a real upload button
// later only touches this one place.
// Plain thumbnail, no hover/lightbox — used where the click already means
// something else (entering edit mode), so it cannot fight GameinfoImagePreview's
// own click-to-open handler.
function PlainThumb({ value }) {
  return value ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={value} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
  ) : (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100 text-xs text-slate-300">
      🖼
    </span>
  );
}

// Image field for v1: paste a URL rather than uploading a file (see plan) —
// kept as its own component so swapping in a real upload button later only
// touches this one place. `compact` swaps the always-visible URL input +
// hover/lightbox preview for a click-to-edit thumbnail so it fits a dense
// pack row.
function ImageUrlField({ value, onChange, compact }) {
  const [editing, setEditing] = useState(false);

  if (!compact) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        {value ? (
          <GameinfoImagePreview src={value} alt="">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
          </GameinfoImagePreview>
        ) : (
          <PlainThumb value={value} />
        )}
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ลิงก์รูป"
          className="h-7 w-28 rounded border border-slate-200 px-1.5 text-[10px] outline-none focus:border-indigo-300"
        />
      </div>
    );
  }

  if (editing) {
    return (
      <PackCellEditBox onCommit={() => setEditing(false)}>
        <input
          autoFocus
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ลิงก์รูป"
          className="h-9 w-24 rounded border border-indigo-300 px-1 text-[10px] outline-none"
        />
      </PackCellEditBox>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="justify-self-start"
      title="ใส่ลิงก์รูป"
    >
      <PlainThumb value={value} />
    </button>
  );
}

// Fixed-px grid so every pack row lines up under its header — dynamic
// trailing tracks for however many computed columns exist right now.
function packGridTemplate(vpnOn, computedCount) {
  const widths = [24, 36, 192, 90, 100, 110, 200, 200]; // idx,image,name,price,charged,fee,main,secondary
  if (vpnOn) widths.push(160); // country
  for (let i = 0; i < computedCount; i++) widths.push(120); // computed columns
  widths.push(80); // delete
  const gap = 8;
  const pad = 16;
  const minWidth = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1) + pad;
  return { template: widths.map((w) => `${w}px`).join(" "), minWidth };
}
