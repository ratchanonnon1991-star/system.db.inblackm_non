"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import GameinfoMemoryInput from "./gameinfo-memory-input";
import GameinfoTagsInput from "./gameinfo-tags-input";
import GameinfoImagePreview from "./gameinfo-image-preview";
import GameinfoComputedEditor from "./gameinfo-computed-editor";
import { apiJson } from "@/lib/api-json";
import { evaluateFormula, parseFormula } from "@/lib/gamedb-formula";
import { formatCell } from "@/lib/gamedb-layout";
import { GAMEINFO_FIELD_NAMES, resolveGameinfoField } from "@/lib/gameinfo-formula-fields";
import { mergeCurrencies } from "@/lib/gameinfo-import";

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
// gameinfo's PackEditor.tsx with per-cell formula overrides dropped (data
// model has no per-pack override) and computePackCell/FORMULA_TOKENS
// (gameinfo's own engine) replaced by systemdb's gamedb-formula.js so
// formulas stay editable from both surfaces. CSV import uses gameinfo-import.js
// (ported separately) via the /api/gameinfo/import/* routes.
export default function GameinfoPackEditor({ game, lang, suggestions }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const [currencies, setCurrencies] = useState(game.currencies);
  const [computedColumns, setComputedColumns] = useState(game.computedColumns ?? []);
  const [invalidFields, setInvalidFields] = useState(new Set());

  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState([]);
  const [importMsg, setImportMsg] = useState("");
  const [pendingImport, setPendingImport] = useState(null); // { currencies, packCount }

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
  // Drag-and-drop reorder (press-and-hold a column header, drag it) —
  // computed columns are game-level state shared by every category's table,
  // so reordering here updates the header AND every pack row's values at once.
  function reorderComputedColumns(activeKey, overKey) {
    setComputedColumns((prev) => {
      const from = prev.findIndex((c) => c.key === activeKey);
      const to = prev.findIndex((c) => c.key === overKey);
      if (from === -1 || to === -1 || from === to) return prev;
      return arrayMove(prev, from, to);
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

  // CSV import for this one game — file's game_id column is ignored server
  // side (every row is treated as this game). Only mutates local state; the
  // usual "บันทึกตารางแพ็ก" button still has to be pressed to persist.
  async function handleImportFile(file) {
    setImporting(true);
    setImportErrors([]);
    setImportMsg("");
    setPendingImport(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await apiJson(`/api/gameinfo/import/preview?gameId=${game.id}`, {
        method: "POST",
        body: fd,
        fallbackError: "อ่านไฟล์ไม่สำเร็จ",
      });
      const errors = data.errors ?? [];
      if (currencies.length === 0) {
        setCurrencies(data.game.currencies);
        setImportErrors(errors);
        setImportMsg(
          `นำเข้าแล้ว ${data.game.packCount} แพ็ก — ตรวจสอบด้านล่างแล้วกด "บันทึกตารางแพ็ก"`
        );
      } else {
        setPendingImport({ currencies: data.game.currencies, packCount: data.game.packCount });
        setImportErrors(errors);
      }
    } catch (e) {
      setImportErrors([e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ"]);
    } finally {
      setImporting(false);
    }
  }

  function applyPendingImport(mode) {
    if (!pendingImport) return;
    if (mode === "replace") {
      setCurrencies(pendingImport.currencies);
    } else {
      setCurrencies((prev) => mergeCurrencies(prev, pendingImport.currencies));
    }
    setImportMsg(
      `นำเข้าแล้ว ${pendingImport.packCount} แพ็ก (${
        mode === "replace" ? "แทนที่ทั้งชุด" : "เพิ่มเข้าไป"
      }) — ตรวจสอบด้านล่างแล้วกด "บันทึกตารางแพ็ก"`
    );
    setPendingImport(null);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-700">นำเข้าแพ็กจาก CSV (เกมนี้)</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <a
              href="/api/gameinfo/import/template"
              className="rounded-md border border-indigo-300 px-2 py-1 text-indigo-600 hover:bg-indigo-50"
            >
              ⬇ template
            </a>
            <a
              href={`/api/gameinfo/import/export?gameId=${game.id}`}
              className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50"
            >
              ⬇ export เกมนี้
            </a>
          </div>
        </div>
        <p className="mb-2 text-xs text-slate-500">
          อัปโหลดไฟล์ .csv ตามรูปแบบ pack template (ไม่ต้องมีคอลัมน์ game_id ก็ได้ ทุกแถวถือเป็นของเกมนี้)
          — ยังไม่บันทึกจนกว่าจะกด &quot;บันทึกตารางแพ็ก&quot;
        </p>
        <input
          type="file"
          accept=".csv"
          disabled={importing}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f);
            e.target.value = "";
          }}
          className="text-sm"
        />
        {importing && <p className="mt-2 text-sm text-slate-500">กำลังอ่านไฟล์...</p>}
        {importMsg && <p className="mt-2 text-sm text-emerald-600">{importMsg}</p>}
        {importErrors.length > 0 && (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <ul className="ml-4 list-disc">
              {importErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {pendingImport && (
          <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 p-3">
            <p className="mb-2 text-sm text-indigo-800">
              พบ {pendingImport.packCount} แพ็กในไฟล์ — เลือกวิธีนำเข้า (มีข้อมูลแพ็กอยู่แล้ว)
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPendingImport("replace")}
                className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                แทนที่ทั้งชุด
              </button>
              <button
                type="button"
                onClick={() => applyPendingImport("add")}
                className="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-100"
              >
                เพิ่มเข้าไป
              </button>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-500">
        คอลัมน์สูตร ({computedColumns.length}) คำนวณจากฟิลด์จริงของแต่ละแพ็ก — สูตรเดียวกับที่ใช้ในระบบ
        systemdb แก้ไขได้จากทั้งสองฝั่ง กดปุ่ม + ท้ายคอลัมน์ในตารางแพ็กด้านล่างเพื่อเพิ่ม
        กดค้างที่หัวคอลัมน์แล้วลากเพื่อเปลี่ยนลำดับ
      </p>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">สกุลเงิน ({currencies.length})</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-md border border-indigo-300 px-3 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
            >
              + เพิ่มสูตร
            </button>
            <button
              type="button"
              onClick={addCurrency}
              className="rounded-md border border-indigo-300 px-3 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
            >
              + เพิ่มสกุลเงิน
            </button>
          </div>
        </div>

        {currencies.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            ยังไม่มีสกุลเงิน — กด &quot;เพิ่มสกุลเงิน&quot; เพื่อเริ่มสร้างแพ็ก
          </div>
        )}

        <div className="space-y-4">
          {currencies.map((currency, cIdx) => (
            <div key={currency.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
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
                    onRemoveColumn={removeComputedColumn}
                    onReorderColumns={reorderComputedColumns}
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
  onRemoveColumn,
  onReorderColumns,
  onRenameCategory,
  onRemoveCategory,
  onAddPack,
  onUpdatePack,
  onRemovePack,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const grid = packGridTemplate(vpnOn, computedColumns.length);
  const columnSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleColumnDragEnd(e) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onReorderColumns(active.id, over.id);
  }

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
        <div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-white">
          {/* mt-2 keeps this box's rounded corner clear of the category
              card's own border right above it — without that gap the two
              curves sit close enough to visually clash (looks like a broken
              edge). overflow-hidden clips the header row's flat bg-slate-50
              background to these rounded corners — without it, that square
              background pokes out past the curve at the top corners. No
              scrollbar here — the grid columns are minmax(min, fr) so the row
              shrinks to fit instead of overflowing. */}
          <div>
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
              <DndContext
                sensors={columnSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleColumnDragEnd}
              >
                <SortableContext
                  items={computedColumns.map((c) => c.key)}
                  strategy={horizontalListSortingStrategy}
                >
                  {computedColumns.map((fc, i) => (
                    <SortableColumnHeader
                      key={fc.key}
                      column={fc}
                      index={i}
                      onRemove={() => onRemoveColumn(fc.key)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
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

// Computed-column header cell: press-and-hold anywhere on it and drag to
// reorder (the whole cell is the drag handle, not a separate grip icon). The
// remove button stops propagation so it doesn't also start a drag.
function SortableColumnHeader({ column, index, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.key,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <span
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex min-w-0 cursor-grab items-center gap-1 truncate px-2 text-indigo-500 active:cursor-grabbing"
      title="กดค้างแล้วลากเพื่อเปลี่ยนลำดับ"
    >
      <span className="truncate">{column.label || `สูตร ${index + 1}`}</span>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="shrink-0 text-slate-400 hover:text-red-600"
        title="ลบคอลัมน์นี้"
      >
        ×
      </button>
    </span>
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
          className="h-9 w-full rounded border border-indigo-300 px-1.5 text-[10px] outline-none"
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

// Responsive grid so every pack row lines up under its header without ever
// needing horizontal scroll — the index/image/delete columns stay a fixed
// small width, everything else is minmax(min, fr) so it shrinks to fit the
// available width instead of forcing the row wider than its container.
function packGridTemplate(vpnOn, computedCount) {
  const tracks = [
    "24px", // idx
    "40px", // image
    "minmax(110px, 1.6fr)", // name
    "minmax(60px, 0.7fr)", // price
    "minmax(70px, 0.8fr)", // amount charged
    "minmax(70px, 0.8fr)", // amount charged + fee
    "minmax(90px, 1fr)", // channels main
    "minmax(90px, 1fr)", // channels secondary
  ];
  if (vpnOn) tracks.push("minmax(80px, 0.8fr)"); // country
  for (let i = 0; i < computedCount; i++) tracks.push("minmax(70px, 0.8fr)"); // computed columns
  tracks.push("64px"); // delete
  return { template: tracks.join(" ") };
}
