"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, Download, Image as ImageIcon, Languages, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import GameinfoMemoryInput from "./gameinfo-memory-input";
import GameinfoTagsInput from "./gameinfo-tags-input";
import GameinfoImagePreview from "./gameinfo-image-preview";
import GameinfoImagePickerModal from "./gameinfo-image-picker-modal";
import GameinfoComputedEditor from "./gameinfo-computed-editor";
import GameinfoFormulaModeToggle from "./gameinfo-formula-mode-toggle";
import GameinfoFormulaVariablesButton, { GameinfoFormulaVariableSummary } from "./gameinfo-formula-variables";
import GameinfoRatePanel, { useGameinfoRates } from "./gameinfo-rate-panel";
import GameinfoPackHistory from "./gameinfo-pack-history";
import {
  GameinfoPackColumnControls,
  useGameinfoPackColumnLayout,
} from "./gameinfo-pack-column-layout";
import { apiJson } from "@/lib/api-json";
import { evaluateFormula, extractFormulaRefs, parseFormula } from "@/lib/gamedb-formula";
import { GAMEINFO_FIELD_NAMES, resolveGameinfoField } from "@/lib/gameinfo-formula-fields";
import { mergeCurrencies } from "@/lib/gameinfo-import";
import {
  buildGameinfoPackColumns,
  formatGameinfoPackColumnValue,
  matchesGameinfoPackFilters,
} from "@/lib/gameinfo-pack-columns";
import {
  duplicateGameinfoFormulaOverrides,
  getGameinfoFormulaDisplay,
  removeGameinfoFormulaOverridesForPack,
  setGameinfoFormulaOverride,
  updateGameinfoComputedColumn,
} from "@/lib/gameinfo-formula-overrides";
import {
  createBlankGameinfoPack,
  duplicateGameinfoPack,
  getGameinfoPackName,
} from "@/lib/gameinfo-pack-model";
import { evaluateGameinfoComputedColumn } from "@/lib/gameinfo-computed-evaluator";
import { normalizeSpaces } from "@/lib/text-normalize";

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

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

// Pack/currency/category editor + game-level computed columns. Ported from
// gameinfo's PackEditor.tsx with per-cell formula overrides dropped (data
// model has no per-pack override) and computePackCell/FORMULA_TOKENS
// (gameinfo's own engine) replaced by systemdb's gamedb-formula.js so
// formulas stay editable from both surfaces. CSV import uses gameinfo-import.js
// (ported separately) via the /api/gameinfo/import/* routes.
export default function GameinfoPackEditor({
  game,
  lang,
  userId,
  dataMode = "uid",
  suggestions,
  savePacksUrl = `/api/gameinfo/gamelist/${game.id}/packs`,
  importPreviewUrl = `/api/gameinfo/import/preview?gameId=${game.id}`,
  exportUrl = `/api/gameinfo/import/export?gameId=${game.id}`,
  historyUrl = `/api/gameinfo/gamelist/${game.id}/packs/history?limit=200`,
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState(null);
  const [savedVisible, setSavedVisible] = useState(false);

  // "บันทึกแล้ว" badge auto-collapses 3s after each save — re-triggers on
  // every save (not just the first) since savedAt gets a fresh timestamp
  // each time, restarting this effect.
  useEffect(() => {
    if (!savedAt) return;
    setSavedVisible(true);
    const hideTimer = setTimeout(() => setSavedVisible(false), 3000);
    return () => clearTimeout(hideTimer);
  }, [savedAt]);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingComputedColumn, setEditingComputedColumn] = useState(null);
  const [formulaMode, setFormulaMode] = useState("result");
  const rateState = useGameinfoRates();

  const [currencies, setCurrencies] = useState(game.currencies);
  const [computedColumns, setComputedColumns] = useState(game.computedColumns ?? []);
  const [costProfiles, setCostProfiles] = useState(game.costProfiles ?? []);
  const [formulaVariables, setFormulaVariables] = useState(game.formulaVariables ?? []);
  const [packLanguages, setPackLanguages] = useState(game.packLanguages ?? []);
  const [activeLanguageId, setActiveLanguageId] = useState("");
  const [addingLanguage, setAddingLanguage] = useState(false);
  const [languageDraft, setLanguageDraft] = useState("");
  const [languagePending, setLanguagePending] = useState(false);
  const [languageError, setLanguageError] = useState("");
  const [savedCurrencies, setSavedCurrencies] = useState(game.currencies);
  const [savedComputedColumns, setSavedComputedColumns] = useState(game.computedColumns ?? []);
  const [savedCostProfiles, setSavedCostProfiles] = useState(game.costProfiles ?? []);
  const [invalidFields, setInvalidFields] = useState(new Set());

  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState([]);
  const [importMsg, setImportMsg] = useState("");
  const [pendingImport, setPendingImport] = useState(null); // { currencies, packCount }
  const [auditSource, setAuditSource] = useState("editor");

  // Drives the same "collapse ยกเลิก/บันทึก to w-0 around the middle pill"
  // animation as the game list table's floating bar (see
  // gameinfo-gamelist-table.js) — only shown once there's actually
  // something to save, and cancel() resetting currencies/computedColumns
  // back to game.* makes this false again, animating the pill closed.
  const dirty =
    JSON.stringify(currencies) !== JSON.stringify(savedCurrencies) ||
    JSON.stringify(computedColumns) !== JSON.stringify(savedComputedColumns) ||
    JSON.stringify(costProfiles) !== JSON.stringify(savedCostProfiles);

  const formulaContext = useMemo(
    () => ({ costProfiles, formulaVariables, externalValues: rateState.externalValues }),
    [costProfiles, formulaVariables, rateState.externalValues]
  );

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
  const packColumns = useMemo(() => buildGameinfoPackColumns(parsedColumns), [parsedColumns]);
  const packLayout = useGameinfoPackColumnLayout({
    columns: packColumns,
    userId,
    gameId: game.id,
    surface: "edit",
    lockRequired: true,
  });

  const sampleRow = useMemo(() => {
    const pack = firstPack(currencies);
    if (!pack) return null;
    const row = {};
    for (const label of GAMEINFO_FIELD_NAMES) {
      row[label] = resolveGameinfoField(pack, game, label, formulaContext);
    }
    for (const column of computedColumns) {
      try {
        row[column.label] = evaluateGameinfoComputedColumn(
          column,
          computedColumns,
          pack,
          game,
          formulaContext
        );
      } catch {
        row[column.label] = null;
      }
    }
    for (const variable of formulaVariables) {
      try {
        row[variable.name] = resolveGameinfoField(pack, game, variable.name, formulaContext);
      } catch {
        row[variable.name] = null;
      }
    }
    return row;
  }, [computedColumns, currencies, formulaContext, formulaVariables, game]);

  // Channel "memory" — grows the moment a tag is added (Enter) to any pack's
  // channelsMain/channelsSecondary in this session, not just from what was
  // already saved when the page loaded (`suggestions.channels`), so a
  // channel typed for one pack is immediately offered for the next one.
  const liveSuggestions = useMemo(() => {
    const seen = [];
    for (const c of currencies) {
      for (const cat of c.categories) {
        for (const p of cat.packs) {
          seen.push(...(p.channelsMain || []), ...(p.channelsSecondary || []));
        }
      }
    }
    return { ...suggestions, channels: uniq([...(suggestions?.channels || []), ...seen]) };
  }, [currencies, suggestions]);

  async function addPackLanguage(event) {
    event.preventDefault();
    const name = languageDraft.trim();
    if (!name) {
      setLanguageError("กรุณากรอกชื่อภาษา");
      return;
    }
    setLanguagePending(true);
    setLanguageError("");
    try {
      const data = await apiJson("/api/gameinfo/pack-languages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        fallbackError: "เพิ่มภาษาไม่สำเร็จ",
      });
      const language = data.language;
      setPackLanguages((current) => {
        const next = current.some((item) => String(item.id) === String(language.id))
          ? [...current]
          : [...current, language];
        return next.sort((a, b) => a.name.localeCompare(b.name, "th"));
      });
      setActiveLanguageId(String(language.id));
      setLanguageDraft("");
      setAddingLanguage(false);
    } catch (error) {
      setLanguageError(error instanceof Error ? error.message : "เพิ่มภาษาไม่สำเร็จ");
    } finally {
      setLanguagePending(false);
    }
  }

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
      draft[cIdx].categories[catIdx].packs.push(createBlankGameinfoPack(genId("pk")));
    });
  }
  function duplicatePack(cIdx, catIdx, pkIdx) {
    const source = currencies[cIdx]?.categories[catIdx]?.packs[pkIdx];
    if (!source) return;
    const newId = genId("pk");
    updateCurrencies((draft) => {
      const packs = draft[cIdx].categories[catIdx].packs;
      packs.splice(pkIdx + 1, 0, duplicateGameinfoPack(packs[pkIdx], newId));
    });
    setComputedColumns((prev) => duplicateGameinfoFormulaOverrides(prev, source.id, newId));
  }
  function removePack(cIdx, catIdx, pkIdx) {
    const pack = currencies[cIdx]?.categories[catIdx]?.packs[pkIdx];
    if (!window.confirm(`ลบ pack "${pack?.name || "ไม่มีชื่อ"}" ใช่ไหม?`)) return;
    const packId = pack?.id;
    updateCurrencies((draft) => {
      draft[cIdx].categories[catIdx].packs.splice(pkIdx, 1);
    });
    if (packId) {
      setComputedColumns((prev) => removeGameinfoFormulaOverridesForPack(prev, packId));
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

  function addComputedColumn({ key, label, formula, type, symbol }) {
    setComputedColumns((prev) => [...prev, { key, label, formula, type, symbol }]);
    setModalOpen(false);
  }
  function removeComputedColumn(key) {
    const column = computedColumns.find((item) => item.key === key);
    if (!window.confirm(`ลบคอลัมน์สูตร "${column?.label || key}" ใช่ไหม?`)) return;
    setComputedColumns((prev) => prev.filter((c) => c.key !== key));
  }
  function updateComputedColumn(nextColumn, { resetOverrides }) {
    setComputedColumns((prev) =>
      updateGameinfoComputedColumn(prev, nextColumn, { resetOverrides })
    );
    setEditingComputedColumn(null);
  }
  function setFormulaOverride(columnKey, packId, formula) {
    setComputedColumns((prev) =>
      setGameinfoFormulaOverride(prev, columnKey, packId, formula)
    );
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
    setSavedAt(null);
    const invalid = validatePacks();
    if (invalid.size > 0) {
      setInvalidFields(invalid);
      setError(
        "กรุณากรอกข้อมูลให้ครบก่อนบันทึก: ชื่อ pack, ราคา, ยอดที่กด + fee, ช่องทางหลัก (ช่องที่ไฮไลต์สีแดง)"
      );
      // The floating บันทึก/ยกเลิก bar is fixed to the bottom of the
      // viewport, so if the user is scrolled up while a pack further down
      // fails validation, nothing near their cursor visibly changes — it
      // just looks like the button did nothing. Jump to the first invalid
      // pack row (see the matching id={`pack-row-${pack.id}`} in PackRow)
      // so the red-highlighted fields are actually on screen; the error
      // text itself is also mirrored into the fixed bar below so it's
      // visible regardless of scroll position.
      const [firstKey] = invalid;
      const firstPackId = firstKey.split(":")[0];
      document.getElementById(`pack-row-${firstPackId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }
    setInvalidFields(new Set());
    startTransition(async () => {
      try {
        const data = await apiJson(savePacksUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currencies, computedColumns, costProfiles, auditSource }),
        });
        const savedGame = data.game || {};
        const nextCurrencies = Array.isArray(savedGame.currencies) ? savedGame.currencies : currencies;
        const nextComputedColumns = Array.isArray(savedGame.computedColumns)
          ? savedGame.computedColumns
          : computedColumns;
        const nextCostProfiles = Array.isArray(savedGame.costProfiles)
          ? savedGame.costProfiles
          : costProfiles;
        setCurrencies(nextCurrencies);
        setComputedColumns(nextComputedColumns);
        setSavedCurrencies(nextCurrencies);
        setSavedComputedColumns(nextComputedColumns);
        setCostProfiles(nextCostProfiles);
        setSavedCostProfiles(nextCostProfiles);
        setAuditSource("editor");
        setSavedAt(Date.now());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  function cancel() {
    if (!window.confirm("ยกเลิกการแก้ไข? ข้อมูลที่ยังไม่บันทึกจะหายไป")) return;
    setCurrencies(savedCurrencies);
    setComputedColumns(savedComputedColumns);
    setCostProfiles(savedCostProfiles);
    setInvalidFields(new Set());
    setError("");
    setSavedAt(null);
    setAuditSource("editor");
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
      const data = await apiJson(importPreviewUrl, {
        method: "POST",
        body: fd,
        fallbackError: "อ่านไฟล์ไม่สำเร็จ",
      });
      const errors = data.errors ?? [];
      if (currencies.length === 0) {
        setCurrencies(data.game.currencies);
        setAuditSource("csv_replace");
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
      setAuditSource("csv_replace");
    } else {
      setCurrencies((prev) => mergeCurrencies(prev, pendingImport.currencies));
      setAuditSource("csv_append");
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
      <div className="flex justify-end gap-2">
        <GameinfoFormulaModeToggle
          mode={formulaMode}
          onChange={setFormulaMode}
          disabled={computedColumns.length === 0}
        />
        <GameinfoPackColumnControls
          columns={packLayout.orderedColumns}
          hidden={packLayout.layout.hidden}
          filters={packLayout.layout.filters}
          presets={packLayout.presets}
          selectedPresetId={packLayout.selectedPresetId}
          presetName={packLayout.presetName}
          dirty={packLayout.dirty}
          loading={packLayout.loading}
          saving={packLayout.saving}
          error={packLayout.error}
          notice={packLayout.notice}
          legacyDraft={packLayout.legacyDraft}
          onSetVisible={packLayout.setVisible}
          onFiltersChange={packLayout.setFilters}
          onReset={packLayout.reset}
          onSelectPreset={packLayout.selectPreset}
          onPresetNameChange={packLayout.setPresetName}
          onSavePreset={packLayout.savePreset}
          lockRequired
        />
        <GameinfoPackHistory gameId={game.id} historyUrl={historyUrl} />
      </div>
      <section className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-linear-ink">นำเข้าแพ็กจาก CSV (เกมนี้)</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <a
              href="/api/gameinfo/import/template"
              className="flex items-center gap-1 rounded-md border border-linear-primary/40 px-2 py-1 text-linear-primary hover:bg-linear-primary/10"
            >
              <Download size={13} /> template
            </a>
            <a
              href={exportUrl}
              className="flex items-center gap-1 rounded-md border border-linear-hairline-strong px-2 py-1 text-linear-ink-muted hover:bg-linear-surface-2"
            >
              <Download size={13} /> export เกมนี้
            </a>
          </div>
        </div>
        <p className="mb-2 text-xs text-linear-ink-subtle">
          อัปโหลดไฟล์ .csv ตามรูปแบบ pack template (ไม่ต้องมีคอลัมน์ game_id ก็ได้ ทุกแถวถือเป็นของเกมนี้)
          — ยังไม่บันทึกจนกว่าจะกด &quot;บันทึกตารางแพ็ก&quot;
        </p>
        <details className="mb-3 rounded-md border border-linear-hairline bg-linear-surface-2 px-3 py-2 text-xs text-linear-ink-subtle">
          <summary className="cursor-pointer font-medium text-linear-primary">ดูคู่มือคอลัมน์ CSV และการใช้ ID</summary>
          <div className="mt-2 space-y-2">
            <p>
              <code>game_id</code> คือ ID ตัวเลขของเกมจากฐานข้อมูล ไม่ใช่ชื่อเกมหรือลำดับแถว
              แต่เมื่อนำเข้าจากหน้านี้ ระบบจะยึดเกม ID {game.id} จาก URL และไม่ใช้ค่า
              <code> game_id</code> ในไฟล์
            </p>
            <p>
              1 แถวเท่ากับ 1 pack · ช่องทางหลายค่าให้คั่นด้วย comma เช่น
              <code> Wavepay, Razer</code> · การเลือก “เพิ่มเข้าไป” จะสร้าง pack ID ใหม่ทุกแถว
              จึงนำเข้าข้อมูลซ้ำเป็นสำเนาได้
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-[620px] text-left">
                <thead className="text-linear-ink-muted">
                  <tr>
                    <th className="pr-3 font-medium">คอลัมน์</th>
                    <th className="pr-3 font-medium">ใช้ทำอะไร</th>
                    <th className="font-medium">จำเป็น</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["game_id", "ID เกม (หน้านี้ไม่ใช้ค่าในไฟล์)", "ไม่"],
                    ["game_name", "ชื่อสำหรับช่วยตรวจไฟล์ ไม่ใช้ผูกเกม", "ไม่"],
                    ["currency_name", "ชื่อสกุลเงิน/กลุ่มใหญ่", "ไม่"],
                    ["currency_image", "URL รูปสกุลเงิน", "ไม่"],
                    ["category_name", "ชื่อหมวดหมู่", "ไม่"],
                    ["pack_name", "ชื่อ pack", "ใช่"],
                    ["pack_image", "URL รูป pack", "ไม่"],
                    ["price", "ราคาขาย", "ใช่"],
                    ["amount_charged_fee", "ยอดที่กดรวม fee", "ใช่"],
                    ["channel_main", "ช่องทางหลัก", "ใช่"],
                    ["channel_secondary", "ช่องทางรอง", "ไม่"],
                    ["country", "ประเทศสำหรับ pack ที่ต้องใช้ VPN", "ไม่"],
                  ].map(([column, description, required]) => (
                    <tr key={column} className="border-t border-linear-hairline">
                      <td className="py-1 pr-3"><code>{column}</code></td>
                      <td className="py-1 pr-3">{description}</td>
                      <td className="py-1">{required}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              คอลัมน์เก่า <code>amount_charged</code> เลิกใช้แล้ว ระบบจะแจ้งเตือนและไม่นำค่าเข้ามา
            </p>
          </div>
        </details>
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
        {importing && <p className="mt-2 text-sm text-linear-ink-subtle">กำลังอ่านไฟล์...</p>}
        {importMsg && <p className="mt-2 text-sm text-emerald-400">{importMsg}</p>}
        {importErrors.length > 0 && (
          <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
            <ul className="ml-4 list-disc">
              {importErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {pendingImport && (
          <div className="mt-3 rounded-md border border-linear-primary/30 bg-linear-primary/10 p-3">
            <p className="mb-2 text-sm text-linear-primary">
              พบ {pendingImport.packCount} แพ็กในไฟล์ — เลือกวิธีนำเข้า (มีข้อมูลแพ็กอยู่แล้ว)
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPendingImport("replace")}
                className="rounded-md border border-red-500/40 bg-linear-surface-1 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
              >
                แทนที่ทั้งชุด
              </button>
              <button
                type="button"
                onClick={() => applyPendingImport("add")}
                className="rounded-md border border-linear-primary/40 bg-linear-surface-1 px-3 py-1.5 text-sm text-linear-primary hover:bg-linear-primary/15"
              >
                เพิ่มเข้าไป
              </button>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-3 py-1.5 text-sm text-linear-ink-muted hover:bg-linear-surface-2"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </section>

      <GameinfoRatePanel
        rates={rateState.rates}
        loading={rateState.loading}
        error={rateState.error}
        onRefresh={rateState.refresh}
      />

      <section className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-linear-ink">ตัวแปรผสมสูตร/ราคา ({formulaVariables.length})</h2>
            <p className="mt-0.5 text-xs text-linear-ink-tertiary">ตัวแปรชุดกลาง ใช้ร่วมกันกับทุก pack ทุกเกม ผ่าน [ชื่อตัวแปร]</p>
          </div>
          <GameinfoFormulaVariablesButton
            gameId={game.id}
            initialVariables={formulaVariables}
            previewValues={sampleRow}
            onSaved={setFormulaVariables}
          />
        </div>
        {formulaVariables.length ? (
          <div className="mt-4">
            <GameinfoFormulaVariableSummary
              variables={formulaVariables}
              previewValues={sampleRow}
              previewLabel="ผลลัพธ์จาก Pack แรก"
            />
          </div>
        ) : null}
      </section>

      <p className="text-xs text-linear-ink-subtle">
        คอลัมน์สูตร ({computedColumns.length}) คำนวณจากฟิลด์จริงของแต่ละแพ็ก — สูตรเดียวกับที่ใช้ในระบบ
        systemdb แก้ไขได้จากทั้งสองฝั่ง กดปุ่ม + ท้ายคอลัมน์ในตารางแพ็กด้านล่างเพื่อเพิ่ม
        กดค้างที่หัวคอลัมน์แล้วลากเพื่อเปลี่ยนลำดับ
      </p>

      <section className="flex flex-wrap items-center gap-2 border-y border-linear-hairline py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-linear-ink-muted">
          <Languages size={14} className="text-linear-primary" />
          ภาษาชื่อ Pack
        </div>
        <select
          value={activeLanguageId}
          onChange={(event) => setActiveLanguageId(event.target.value)}
          className="h-9 min-w-44 rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-2 text-xs text-linear-ink outline-none focus:border-linear-primary"
          aria-label="เลือกภาษาของชื่อ Pack"
        >
          <option value="">ชื่อหลัก</option>
          {packLanguages.map((language) => (
            <option key={language.id} value={String(language.id)}>
              {language.name}
            </option>
          ))}
        </select>
        {addingLanguage ? (
          <form onSubmit={addPackLanguage} className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={languageDraft}
              onChange={(event) => {
                setLanguageDraft(event.target.value);
                setLanguageError("");
              }}
              maxLength={80}
              placeholder="ชื่อภาษา เช่น English"
              className="h-9 w-48 rounded-md border border-linear-primary/50 bg-linear-surface-1 px-2 text-xs text-linear-ink outline-none focus:border-linear-primary"
            />
            <button
              type="submit"
              disabled={languagePending}
              className="h-9 rounded-md bg-linear-primary px-3 text-xs font-medium text-white disabled:opacity-50"
            >
              {languagePending ? "กำลังเพิ่ม..." : "เพิ่มภาษา"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingLanguage(false);
                setLanguageDraft("");
                setLanguageError("");
              }}
              className="h-9 px-2 text-xs text-linear-ink-muted hover:text-linear-ink"
            >
              ยกเลิก
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingLanguage(true)}
            className="flex h-9 items-center gap-1 rounded-md border border-linear-primary/40 px-3 text-xs text-linear-primary hover:bg-linear-primary/10"
          >
            <Plus size={13} /> ภาษา
          </button>
        )}
        <span className="text-[11px] text-linear-ink-tertiary">
          {activeLanguageId ? "ชื่อที่ยังไม่เคยแปลจะแสดงเป็นช่องว่าง" : "ชื่อเดิมที่ระบบใช้แสดง"}
        </span>
        {languageError ? <span className="w-full text-xs text-red-400">{languageError}</span> : null}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-linear-ink">สกุลเงิน ({currencies.length})</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1 rounded-md border border-linear-primary/40 px-3 py-1 text-xs text-linear-primary hover:bg-linear-primary/10"
            >
              <Plus size={13} /> สูตร
            </button>
            <button
              type="button"
              onClick={addCurrency}
              className="flex items-center gap-1 rounded-md border border-linear-primary/40 px-3 py-1 text-xs text-linear-primary hover:bg-linear-primary/10"
            >
              <Plus size={13} /> สกุลเงิน
            </button>
          </div>
        </div>

        {currencies.length === 0 && (
          <div className="rounded-lg border border-dashed border-linear-hairline-strong bg-linear-surface-1 p-8 text-center text-sm text-linear-ink-tertiary">
            ยังไม่มีสกุลเงิน — กด &quot;เพิ่มสกุลเงิน&quot; เพื่อเริ่มสร้างแพ็ก
          </div>
        )}

        <div className="space-y-4">
          {currencies.map((currency, cIdx) => (
            <div key={currency.id} className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                  <span className="shrink-0 rounded-full bg-linear-primary/10 px-2 py-1 text-xs font-medium text-linear-primary">
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
                  title="ลบสกุลเงิน"
                  aria-label="ลบสกุลเงิน"
                  className="flex shrink-0 items-center justify-center rounded-md bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/15"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-linear-ink-muted">หมวดหมู่ pack</h3>
                <button
                  type="button"
                  onClick={() => addCategory(cIdx)}
                  className="flex items-center gap-1 rounded-md border border-linear-hairline-strong px-2 py-1 text-xs text-linear-ink-muted hover:bg-linear-surface-2"
                >
                  <Plus size={13} /> หมวดหมู่
                </button>
              </div>

              <div className="space-y-3">
                {currency.categories.map((cat, catIdx) => (
                  <CategoryBlock
                    key={cat.id}
                    category={cat}
                    suggestions={liveSuggestions}
                    game={game}
                    costProfiles={costProfiles}
                    formulaVariables={formulaVariables}
                    externalValues={rateState.externalValues}
                    columns={packLayout.visibleColumns}
                    allColumns={packLayout.orderedColumns}
                    filters={packLayout.layout.filters}
                    onSetCategoryStatus={(enabled) => {
                      updateCurrencies((draft) => {
                        for (const pack of draft[cIdx].categories[catIdx].packs) {
                          pack.serviceEnabled = enabled;
                          pack.serviceStatus = "";
                        }
                      });
                      setAuditSource("editor");
                    }}
                    formulaMode={formulaMode}
                    packNameLanguageId={activeLanguageId}
                    invalidFields={invalidFields}
                    onRemoveColumn={removeComputedColumn}
                    onEditColumn={setEditingComputedColumn}
                    onReorderColumns={packLayout.reorder}
                    onSetFormulaOverride={setFormulaOverride}
                    onRenameCategory={(name) =>
                      updateCurrencies((d) => {
                        d[cIdx].categories[catIdx].name = name;
                      })
                    }
                    onRemoveCategory={() => removeCategory(cIdx, catIdx)}
                    onAddPack={() => addPack(cIdx, catIdx)}
                    onUpdatePack={(pkIdx, patch) => updatePack(cIdx, catIdx, pkIdx, patch)}
                    onDuplicatePack={(pkIdx) => duplicatePack(cIdx, catIdx, pkIdx)}
                    onRemovePack={(pkIdx) => removePack(cIdx, catIdx, pkIdx)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Same floating pill pattern as the game list table's ยกเลิก/เพิ่มเกม/
          บันทึก bar (see gameinfo-gamelist-table.js) — ยกเลิก/บันทึก sit as
          plain text in fixed-width side slots so the pill stays symmetric,
          "กลับไปหน้าแก้" is the solid capsule popping out of the middle. Extra
          bottom padding on the page (see packs/page.js) keeps this from
          covering the last rows of a long pack table. The error/success
          message is mirrored here (not just left in the page's normal
          scroll flow) so it's visible next to the buttons regardless of
          where the user is scrolled — a validation error appearing only at
          the bottom of a long pack list, out of view, used to look like the
          save button just silently did nothing. */}
      <div className="fixed bottom-6 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col items-center gap-2">
        {error && (
          <p className="max-w-full rounded-full border border-red-500/40 bg-linear-surface-1 px-3 py-1.5 text-center text-xs text-red-400 shadow-lg">
            {error}
          </p>
        )}
        {savedAt && !pending && (
          <div
            className={`overflow-hidden transition-all duration-300 ease-out ${
              savedVisible ? "max-h-8 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <span className="text-xs text-linear-ink">บันทึกแล้ว</span>
          </div>
        )}
        <div className="flex h-11 items-center rounded-full border border-linear-hairline bg-linear-surface-1 shadow-lg">
          <div
            className={`min-w-0 flex-none flex justify-center overflow-hidden transition-all duration-300 ease-out ${
              dirty ? "w-[92px] opacity-100" : "w-0 opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={cancel}
              disabled={pending || !dirty}
              className="w-full whitespace-nowrap py-2 text-center text-sm font-medium text-linear-ink-muted hover:text-linear-ink disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              // Same "opened this page directly, nothing to go back to"
              // guard as GameinfoBackLink.
              if (window.history.length <= 1) router.push(`/gameinfo/${lang}/${game.id}`);
              else router.back();
            }}
            className="-my-0.5 flex h-10 items-center whitespace-nowrap rounded-full bg-linear-primary px-4 text-sm font-medium text-white shadow-md hover:bg-linear-primary-hover"
          >
            ย้อนกลับ
          </button>

          <div
            className={`min-w-0 flex-none flex justify-center overflow-hidden transition-all duration-300 ease-out ${
              dirty ? "w-[92px] opacity-100" : "w-0 opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              className="w-full whitespace-nowrap py-2 text-center text-sm font-medium text-linear-primary hover:text-linear-primary-hover disabled:opacity-50"
            >
              {pending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <GameinfoComputedEditor
          sampleRow={sampleRow}
          otherColumns={computedColumns}
          extraFieldNames={formulaVariables.map((variable) => variable.name)}
          onClose={() => setModalOpen(false)}
          onAdd={addComputedColumn}
        />
      )}
      {editingComputedColumn && (
        <GameinfoComputedEditor
          key={editingComputedColumn.key}
          initialColumn={editingComputedColumn}
          sampleRow={sampleRow}
          otherColumns={computedColumns.filter((column) => column.key !== editingComputedColumn.key)}
          extraFieldNames={formulaVariables.map((variable) => variable.name)}
          onClose={() => setEditingComputedColumn(null)}
          onSave={updateComputedColumn}
        />
      )}
    </div>
  );
}

function CategoryBlock({
  category,
  suggestions,
  game,
  costProfiles,
  formulaVariables,
  externalValues,
  columns,
  allColumns,
  filters,
  onSetCategoryStatus,
  formulaMode,
  packNameLanguageId,
  invalidFields,
  onRemoveColumn,
  onEditColumn,
  onReorderColumns,
  onSetFormulaOverride,
  onRenameCategory,
  onRemoveCategory,
  onAddPack,
  onUpdatePack,
  onDuplicatePack,
  onRemovePack,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const grid = packGridTemplate(columns);
  const hasPacks = category.packs.length > 0;
  const allPacksEnabled = hasPacks && category.packs.every(
    (pack) => pack.serviceEnabled !== false && pack.serviceStatus !== "new"
  );
  const allPacksDisabled = hasPacks && category.packs.every((pack) => pack.serviceEnabled === false);
  const columnSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const visiblePacks = category.packs
    .map((pack, pkIdx) => ({ pack, pkIdx }))
    .filter(({ pack }) =>
      matchesGameinfoPackFilters(pack, filters, (columnId, targetPack) => {
        const column = allColumns.find((item) => item.id === columnId);
        if (!column) return "";
        if (column.id === "costProfileId") {
          return costProfiles.find((profile) => profile.id === targetPack.costProfileId)?.label || "";
        }
        if (column.id === "name") return getGameinfoPackName(targetPack, packNameLanguageId);
        if (column.kind !== "computed") return targetPack[column.field];
        try {
          return evaluateGameinfoComputedColumn(
            column.computed,
            allColumns.filter((item) => item.kind === "computed").map((item) => item.computed),
            targetPack,
            game,
            { costProfiles, formulaVariables, externalValues }
          );
        } catch {
          return "";
        }
      })
    );

  function handleColumnDragEnd(e) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onReorderColumns(active.id, over.id);
  }

  return (
    <div className={collapsed ? "rounded-md border border-linear-hairline bg-linear-surface-2 p-3" : "p-3"}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-linear-ink-subtle hover:bg-linear-surface-4"
            title={collapsed ? "ขยายหมวดหมู่" : "พับเก็บหมวดหมู่"}
            aria-label={collapsed ? "ขยายหมวดหมู่" : "พับเก็บหมวดหมู่"}
          >
            <span className={`inline-flex transition-transform ${collapsed ? "-rotate-90" : ""}`}>
              <ChevronDown size={14} />
            </span>
          </button>
          <div className="w-56 shrink-0">
            <GameinfoMemoryInput
              value={category.name}
              onChange={onRenameCategory}
              suggestions={suggestions?.categoryNames || []}
              placeholder="ชื่อหมวดหมู่ เช่น เติมปกติ"
              className="w-full rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-2 py-1.5 text-sm outline-none focus:border-linear-primary"
            />
          </div>
          <span className="shrink-0 text-xs text-linear-ink-tertiary">
            ({visiblePacks.length === category.packs.length ? category.packs.length : `${visiblePacks.length}/${category.packs.length}`} แพ็ก)
          </span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={!hasPacks || allPacksEnabled}
            onClick={() => onSetCategoryStatus(true)}
            className="rounded-md border border-emerald-500/30 px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10 disabled:cursor-default disabled:opacity-40"
          >
            เปิดทั้งหมวด
          </button>
          <button
            type="button"
            disabled={!hasPacks || allPacksDisabled}
            onClick={() => onSetCategoryStatus(false)}
            className="rounded-md border border-linear-hairline-strong px-2 py-1 text-xs text-linear-ink-muted hover:bg-linear-surface-3 disabled:cursor-default disabled:opacity-40"
          >
            ปิดทั้งหมวด
          </button>
          <button
            type="button"
            onClick={onAddPack}
            className="flex items-center gap-1 rounded-md border border-linear-primary/40 px-2 py-1 text-xs text-linear-primary hover:bg-linear-primary/10"
          >
            <Plus size={13} /> pack
          </button>
          <button
            type="button"
            onClick={onRemoveCategory}
            title="ลบหมวดหมู่"
            aria-label="ลบหมวดหมู่"
            className="flex items-center justify-center rounded-md bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/15"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {collapsed ? null : visiblePacks.length === 0 ? (
        <p className="px-1 py-2 text-xs text-linear-ink-tertiary">
          {category.packs.length === 0 ? "ยังไม่มี pack" : "ไม่มี pack ที่ตรงกับตัวกรอง"}
        </p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-md border border-linear-hairline bg-linear-surface-1">
          {/* mt-2 keeps this box's rounded corner clear of the category
              card's own border right above it — without that gap the two
              curves sit close enough to visually clash (looks like a broken
              edge). overflow-hidden clips the header row's flat bg-linear-surface-2
              background to these rounded corners — without it, that square
              background pokes out past the curve at the top corners. No
              scrollbar here — the grid columns are minmax(min, fr) so the row
              shrinks to fit instead of overflowing. */}
          <div>
            <div
              style={{ gridTemplateColumns: grid.template }}
              className="grid gap-2 border-b border-linear-hairline bg-linear-surface-2 px-2 py-1.5 text-[10px] text-linear-ink-tertiary"
            >
              <DndContext
                sensors={columnSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleColumnDragEnd}
              >
                <SortableContext
                  items={columns.map((column) => column.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {columns.map((column, i) => (
                    <SortableColumnHeader
                      key={column.id}
                      column={column}
                      index={i}
                      onRemove={
                        column.kind === "computed"
                          ? () => onRemoveColumn(column.computed.key)
                          : undefined
                      }
                      onEdit={
                        column.kind === "computed"
                          ? () => onEditColumn(column.computed)
                          : undefined
                      }
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <span></span>
            </div>
            {visiblePacks.map(({ pack, pkIdx }) => (
              <PackRow
                key={pack.id}
                pack={pack}
                game={game}
                costProfiles={costProfiles}
                formulaVariables={formulaVariables}
                externalValues={externalValues}
                suggestions={suggestions}
                columns={columns}
                computedColumns={allColumns.filter((item) => item.kind === "computed").map((item) => item.computed)}
                formulaMode={formulaMode}
                packNameLanguageId={packNameLanguageId}
                gridTemplate={grid.template}
                invalid={{
                  name: invalidFields.has(`${pack.id}:name`),
                  price: invalidFields.has(`${pack.id}:price`),
                  amountChargedFee: invalidFields.has(`${pack.id}:amountChargedFee`),
                  channelsMain: invalidFields.has(`${pack.id}:channelsMain`),
                }}
                onUpdate={(patch) => onUpdatePack(pkIdx, patch)}
                onDuplicate={() => onDuplicatePack(pkIdx)}
                onRemove={() => onRemovePack(pkIdx)}
                onSetFormulaOverride={(columnKey, formula) =>
                  onSetFormulaOverride(columnKey, pack.id, formula)
                }
                onEditMainFormula={onEditColumn}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PackRow({
  pack,
  game,
  costProfiles,
  formulaVariables,
  externalValues,
  suggestions,
  columns,
  computedColumns,
  formulaMode,
  packNameLanguageId,
  gridTemplate,
  invalid,
  onUpdate,
  onDuplicate,
  onRemove,
  onSetFormulaOverride,
  onEditMainFormula,
}) {
  const [editing, setEditing] = useState(null);
  const [overrideColumn, setOverrideColumn] = useState(null);
  const isEditing = (field) => editing === field;

  return (
    <div
      id={`pack-row-${pack.id}`}
      style={{ gridTemplateColumns: gridTemplate }}
      className="grid items-center gap-2 border-b border-linear-hairline px-2 py-2 text-sm last:border-b-0"
    >
      {columns.map((column) => (
        <PackEditorColumn
          key={column.id}
          column={column}
          pack={pack}
          game={game}
          costProfiles={costProfiles}
          formulaVariables={formulaVariables}
          externalValues={externalValues}
          computedColumns={computedColumns}
          suggestions={suggestions}
          formulaMode={formulaMode}
          packNameLanguageId={packNameLanguageId}
          invalid={invalid}
          editing={isEditing(column.id)}
          onStartEdit={() => setEditing(column.id)}
          onCommit={() => setEditing(null)}
          onUpdate={onUpdate}
          onEditFormula={() => setOverrideColumn(column)}
          onEditMainFormula={() => onEditMainFormula(column.computed)}
        />
      ))}

      <div className="flex items-center justify-self-end gap-1">
        <button
          type="button"
          onClick={onDuplicate}
          title="ทำสำเนา pack"
          aria-label="ทำสำเนา pack"
          className="flex items-center justify-center rounded-md bg-linear-primary/10 p-1.5 text-linear-primary hover:bg-linear-primary/15"
        >
          <Copy size={13} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="ลบ pack"
          aria-label="ลบ pack"
          className="flex items-center justify-center rounded-md bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/15"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {overrideColumn ? (
        <GameinfoFormulaOverrideEditor
          column={overrideColumn.computed}
          pack={pack}
          game={game}
          costProfiles={costProfiles}
          formulaVariables={formulaVariables}
          externalValues={externalValues}
          computedColumns={computedColumns}
          onClose={() => setOverrideColumn(null)}
          onSave={(formula) => {
            onSetFormulaOverride(overrideColumn.computed.key, formula);
            setOverrideColumn(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PackEditorColumn({
  column,
  pack,
  game,
  costProfiles,
  formulaVariables,
  externalValues,
  computedColumns,
  suggestions,
  formulaMode,
  packNameLanguageId,
  invalid,
  editing,
  onStartEdit,
  onCommit,
  onUpdate,
  onEditFormula,
  onEditMainFormula,
}) {
  if (column.id === "serviceEnabled") {
    const enabled = pack.serviceEnabled !== false;
    const isNew = pack.serviceStatus === "new";
    const color = isNew ? "bg-red-500" : enabled ? "bg-emerald-400" : "bg-zinc-500";
    const label = isNew ? "ใหม่" : enabled ? "เปิด" : "ปิด";
    const nextPatch = isNew
      ? { serviceEnabled: true, serviceStatus: "" }
      : enabled
        ? { serviceEnabled: false, serviceStatus: "" }
        : { serviceEnabled: true, serviceStatus: "new" };
    return (
      <button
        type="button"
        onClick={() => onUpdate(nextPatch)}
        title={`${label} — กดเพื่อเปลี่ยนสถานะ เปิด → ปิด → ใหม่`}
        className={`flex items-center gap-1.5 rounded px-1.5 py-2 text-[10px] ${isNew ? "text-red-400" : enabled ? "text-emerald-400" : "text-linear-ink-tertiary"}`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        {label}
      </button>
    );
  }
  if (column.id === "image") {
    return <ImageUrlField value={pack.image ?? ""} onChange={(v) => onUpdate({ image: v })} compact />;
  }
  if (column.id === "channelsMain" || column.id === "channelsSecondary") {
    const main = column.id === "channelsMain";
    return (
      <GameinfoTagsInput
        values={pack[column.field] || []}
        onChange={(value) => onUpdate({ [column.field]: value })}
        suggestions={suggestions?.channels || []}
        placeholder="พิมพ์แล้ว Enter"
        invalid={main && invalid.channelsMain}
      />
    );
  }
  if (column.id === "country") {
    return (
      <PackCell
        editing={editing}
        value={pack.country ?? ""}
        placeholder="ประเทศ (กรณี VPN)"
        onStartEdit={onStartEdit}
        onCommit={onCommit}
      >
        <GameinfoMemoryInput
          value={pack.country ?? ""}
          onChange={(value) => onUpdate({ country: value })}
          suggestions={suggestions?.countries || []}
          placeholder="เลือก/พิมพ์ชื่อประเทศ"
          className="h-9 w-full rounded border border-linear-primary/40 px-2 text-sm outline-none"
          autoFocus
        />
      </PackCell>
    );
  }
  if (column.id === "costProfileId") {
    return (
      <select
        value={pack.costProfileId || ""}
        onChange={(event) => onUpdate({ costProfileId: event.target.value })}
        className="h-9 min-w-0 rounded border border-linear-hairline-strong bg-linear-surface-1 px-2 text-xs text-linear-ink outline-none focus:border-linear-primary"
        title="เลือกโปรไฟล์ต้นทุนสำหรับ pack นี้"
      >
        <option value="">ไม่ใช้ต้นทุน</option>
        {(costProfiles || []).map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.label || "(ไม่มีชื่อ)"}
          </option>
        ))}
      </select>
    );
  }
  if (column.kind === "computed") {
    const formula = column.computed;
    const effective = getGameinfoFormulaDisplay(formula, pack.id);
    let value = null;
    let formulaError = false;
    try {
      value = evaluateGameinfoComputedColumn(
        formula,
        computedColumns,
        pack,
        game,
        { costProfiles, formulaVariables, externalValues }
      );
    } catch {
      formulaError = true;
    }
    if (formulaMode === "formula") {
      return (
        <button
          type="button"
          onClick={effective.overridden ? onEditFormula : onEditMainFormula}
          className={`min-w-0 rounded px-2 py-1.5 text-left hover:bg-linear-surface-2 ${
            formulaError ? "text-red-400" : "text-linear-ink-muted"
          }`}
          title={`${effective.sourceLabel} — กดเพื่อแก้`}
        >
          <span className="block truncate font-mono text-[11px]" title={effective.formula}>
            {effective.formula || "(ไม่มีสูตร)"}
          </span>
          <span
            className={`mt-0.5 inline-block text-[9px] ${
              effective.overridden ? "text-linear-primary" : "text-linear-ink-tertiary"
            }`}
          >
            {formulaError ? `สูตรผิด · ${effective.sourceLabel}` : effective.sourceLabel}
          </span>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={formulaError && !effective.overridden ? onEditMainFormula : onEditFormula}
        className={`truncate rounded px-2 py-2 text-left hover:bg-linear-surface-2 ${
          formulaError ? "text-red-400" : "text-linear-ink-muted"
        }`}
        title={effective.overridden ? "สูตรเฉพาะ pack — กดเพื่อแก้" : "ใช้สูตรหลัก — กดเพื่อกำหนดสูตรเฉพาะ pack"}
      >
        {formulaError ? "สูตรผิด" : formatGameinfoPackColumnValue(value, column)}
        {effective.overridden ? <span className="ml-1 text-[9px] text-linear-primary">เฉพาะแถว</span> : null}
      </button>
    );
  }

  const isName = column.id === "name";
  const value = isName
    ? getGameinfoPackName(pack, packNameLanguageId)
    : pack[column.field] ?? "";
  const placeholder = isName ? "ชื่อ pack เช่น 86 Diamonds" : column.label;

  function updateName(value) {
    if (!packNameLanguageId) {
      onUpdate({ name: value });
      return;
    }
    const localizedNames = { ...(pack.localizedNames || {}) };
    if (value) localizedNames[packNameLanguageId] = value;
    else delete localizedNames[packNameLanguageId];
    onUpdate({ localizedNames });
  }
  return (
    <PackCell
      editing={editing}
      value={value}
      placeholder={placeholder}
      invalid={invalid[column.id]}
      onStartEdit={onStartEdit}
      onCommit={onCommit}
    >
      <input
        autoFocus
        inputMode={isName ? undefined : "decimal"}
        value={value}
        onChange={(event) =>
          isName
            ? updateName(event.target.value)
            : onUpdate({ [column.field]: numericOnly(event.target.value) })
        }
        onBlur={
          isName
            ? (event) => {
                const normalized = normalizeSpaces(event.target.value);
                if (normalized !== event.target.value) updateName(normalized);
              }
            : undefined
        }
        placeholder={placeholder}
        className="h-9 w-full rounded border border-linear-primary/40 px-2 text-sm outline-none"
      />
    </PackCell>
  );
}

function GameinfoFormulaOverrideEditor({
  column,
  pack,
  game,
  costProfiles,
  formulaVariables,
  externalValues,
  computedColumns,
  onClose,
  onSave,
}) {
  const existing = column.rowOverrides?.[pack.id] || "";
  const [formula, setFormula] = useState(existing);

  useEffect(() => {
    function handleKey(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const validation = useMemo(() => {
    if (!formula.trim()) return { ok: true, message: "เว้นว่างเพื่อใช้สูตรของคอลัมน์", value: null };
    try {
      const ast = parseFormula(formula);
      const unknown = [...extractFormulaRefs(ast)].filter(
        (name) =>
          !GAMEINFO_FIELD_NAMES.includes(name) &&
          !formulaVariables.some((variable) => variable.name === name) &&
          !computedColumns.some((computed) => computed.label === name)
      );
      if (unknown.length) {
        return { ok: false, message: `ไม่รู้จักคอลัมน์: ${unknown.join(", ")}`, value: null };
      }
      const value = evaluateFormula(ast, (label) => {
        const dependency = computedColumns.find((computed) => computed.label === label);
        return dependency
          ? evaluateGameinfoComputedColumn(dependency, computedColumns, pack, game, {
              costProfiles,
              formulaVariables,
              externalValues,
            })
          : resolveGameinfoField(pack, game, label, { costProfiles, formulaVariables, externalValues });
      });
      return {
        ok: true,
        message: `สูตรถูกต้อง · ผลลัพธ์แถวนี้ ${formatGameinfoPackColumnValue(value, column)}`,
        value,
      };
    } catch (error) {
      return { ok: false, message: error.message, value: null };
    }
  }, [column, computedColumns, costProfiles, externalValues, formula, formulaVariables, game, pack]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-linear-hairline bg-linear-surface-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-linear-hairline px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-linear-ink">สูตรเฉพาะ pack — {column.label}</h2>
            <p className="mt-0.5 text-xs text-linear-ink-tertiary">{pack.name || pack.id}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded p-1 text-linear-ink-tertiary hover:bg-linear-surface-2">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <p className="mb-1 text-xs text-linear-ink-tertiary">สูตรหลักของคอลัมน์</p>
            <code className="block rounded bg-linear-surface-2 px-3 py-2 text-xs text-linear-ink-subtle">
              {column.formula}
            </code>
          </div>
          <div>
            <label className="mb-1 block text-xs text-linear-ink-tertiary">สูตรเฉพาะ pack</label>
            <input
              autoFocus
              value={formula}
              onChange={(event) => setFormula(event.target.value)}
              placeholder="เว้นว่างเพื่อใช้สูตรหลัก"
              className="h-10 w-full rounded border border-linear-hairline-strong bg-linear-surface-2 px-3 font-mono text-xs text-linear-ink outline-none focus:border-linear-primary"
            />
            <p className={`mt-1 text-xs ${validation.ok ? "text-emerald-400" : "text-red-400"}`}>
              {validation.message}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {GAMEINFO_FIELD_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setFormula((current) => `${current}[${name}]`)}
                className="rounded bg-linear-surface-3 px-2 py-1 text-xs text-linear-ink-muted hover:bg-linear-surface-4"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-linear-hairline px-5 py-3">
          <button
            type="button"
            onClick={() => onSave("")}
            disabled={!existing}
            className="text-xs text-linear-primary hover:underline disabled:opacity-40"
          >
            กลับไปใช้สูตรหลัก
          </button>
          <button
            type="button"
            onClick={() => onSave(formula)}
            disabled={!validation.ok}
            className="rounded-md bg-linear-primary px-4 py-2 text-sm font-medium text-white hover:bg-linear-primary-hover disabled:opacity-50"
          >
            บันทึกสูตรแถวนี้
          </button>
        </div>
      </div>
    </div>
  );
}

// Computed-column header cell: press-and-hold anywhere on it and drag to
// reorder (the whole cell is the drag handle, not a separate grip icon). The
// remove button stops propagation so it doesn't also start a drag.
function SortableColumnHeader({ column, index, onRemove, onEdit }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
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
      className={`flex min-w-0 cursor-grab items-center gap-1 truncate px-2 active:cursor-grabbing ${
        column.kind === "computed" ? "text-linear-primary" : "text-linear-ink-tertiary"
      }`}
      title="กดค้างแล้วลากเพื่อเปลี่ยนลำดับ"
    >
      <span className="truncate">{column.label || `สูตร ${index + 1}`}</span>
      {onEdit ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="shrink-0 text-linear-ink-tertiary hover:text-linear-primary"
          title="แก้ไขสูตรหลัก"
          aria-label={`แก้ไขสูตรหลัก ${column.label || `สูตร ${index + 1}`}`}
        >
          <Pencil size={11} />
        </button>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="shrink-0 text-linear-ink-tertiary hover:text-red-400"
          title="ลบคอลัมน์นี้"
        >
          <X size={12} />
        </button>
      ) : null}
    </span>
  );
}

function PackCell({ editing, value, placeholder, invalid, onStartEdit, onCommit, children }) {
  if (editing) return <PackCellEditBox onCommit={onCommit}>{children}</PackCellEditBox>;
  return (
    <span
      onClick={onStartEdit}
      className={`flex h-9 cursor-pointer items-center truncate rounded border px-2 text-linear-ink-muted ${
        invalid ? "border-red-500/40" : "border-transparent hover:bg-linear-surface-2"
      }`}
    >
      {value || <span className="text-linear-ink-tertiary">{placeholder ?? "-"}</span>}
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
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-linear-surface-3 text-linear-ink-tertiary">
      <ImageIcon size={14} />
    </span>
  );
}

// Image field — hover the thumbnail to preview it, click to open a popup to
// either paste a URL or upload a file from disk (see
// gameinfo-image-picker-modal.js) — same click-the-thumbnail-itself pattern
// as the game list table's own image column (see RowThumb in
// gameinfo-gamelist-table.js), no separate "เปลี่ยนรูป" button. `compact`
// only adjusts the wrapper's own layout class so it drops into a dense
// pack row's CSS grid cell correctly.
function ImageUrlField({ value, onChange, compact }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const thumb = <PlainThumb value={value} />;

  return (
    <div className={compact ? "justify-self-start" : "shrink-0"}>
      {value ? (
        <GameinfoImagePreview src={value} alt="" onClick={() => setPickerOpen(true)}>
          {thumb}
        </GameinfoImagePreview>
      ) : (
        <button type="button" onClick={() => setPickerOpen(true)} title="ใส่รูปภาพ">
          {thumb}
        </button>
      )}
      {pickerOpen && (
        <GameinfoImagePickerModal value={value} onChange={onChange} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

// Responsive grid so every pack row lines up under its header without ever
// needing horizontal scroll — the index/image/delete columns stay a fixed
// small width, everything else is minmax(min, fr) so it shrinks to fit the
// available width instead of forcing the row wider than its container.
function packGridTemplate(columns) {
  const tracks = [...columns.map((column) => column.track), "72px"];
  return { template: tracks.join(" ") };
}
