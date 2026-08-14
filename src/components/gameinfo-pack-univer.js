"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  BooleanNumber,
  LocaleType,
  LogLevel,
  mergeLocales,
  Univer,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import DesignEnUS from "@univerjs/design/locale/en-US";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import DocsUIEnUS from "@univerjs/docs-ui/locale/en-US";
import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import SheetsEnUS from "@univerjs/sheets/locale/en-US";
import { UniverSheetsFormulaPlugin } from "@univerjs/sheets-formula";
import { UniverSheetsFormulaUIPlugin } from "@univerjs/sheets-formula-ui";
import SheetsFormulaUIEnUS from "@univerjs/sheets-formula-ui/locale/en-US";
import { UniverSheetsNumfmtPlugin } from "@univerjs/sheets-numfmt";
import { UniverSheetsNumfmtUIPlugin } from "@univerjs/sheets-numfmt-ui";
import SheetsNumfmtUIEnUS from "@univerjs/sheets-numfmt-ui/locale/en-US";
import { UniverSheetsUIPlugin } from "@univerjs/sheets-ui";
import SheetsUIEnUS from "@univerjs/sheets-ui/locale/en-US";
import { UniverUIPlugin } from "@univerjs/ui";
import UIEnUS from "@univerjs/ui/locale/en-US";
import { parseFormula } from "@/lib/gamedb-formula";

import "@univerjs/engine-formula/facade";
import "@univerjs/ui/facade";
import "@univerjs/docs-ui/facade";
import "@univerjs/sheets/facade";
import "@univerjs/sheets-ui/facade";
import "@univerjs/sheets-formula/facade";
import "@univerjs/sheets-numfmt/facade";

const META_KEY = "__pack_meta";
const TOGGLE_KEY = "__group_toggle";
const LOCKED_FREEZE_COMMANDS = new Set([
  "sheet.command.set-frozen",
  "sheet.command.cancel-frozen",
  "sheet.command.set-selection-frozen",
  "sheet.command.set-row-frozen",
  "sheet.command.set-col-frozen",
  "sheet.command.set-first-row-frozen",
  "sheet.command.set-first-column-frozen",
  "sheet.mutation.set-frozen",
]);
// This compact sheet only exposes column-width adjustment. Row height is a
// part of the component layout (and therefore stays aligned with folding),
// while double-clicking a vertical column divider still runs Univer's native
// auto-width command. Moving data columns remains enabled separately below.
const LOCKED_TABLE_LAYOUT_COMMANDS = new Set([
  "sheet.command.delta-row-height",
  "sheet.command.set-row-height",
  "sheet.command.set-row-is-auto-height",
  "sheet.command.set-row-header-width",
  "sheet.command.set-col-header-height",
  "sheet.command.move-rows",
]);

export const PACK_BASE_COLUMNS = [
  { key: "name", label: "ชื่อ pack", formulaLabel: "ชื่อแพ็ก", width: 220 },
  { key: "image", label: "รูป (URL)", width: 180 },
  { key: "price", label: "ราคา", formulaLabel: "ราคา", width: 100, numeric: true },
  {
    key: "amountCharged",
    label: "ยอดที่กด",
    formulaLabel: "ยอดที่กด",
    width: 120,
    numeric: true,
  },
  {
    key: "amountChargedFee",
    label: "ยอดที่กด + fee",
    formulaLabel: "ยอดที่กด + fee",
    width: 145,
    numeric: true,
  },
  { key: "channelsMain", label: "ช่องทางหลัก", width: 210, list: true },
  { key: "channelsSecondary", label: "ช่องทางรอง", width: 210, list: true },
  { key: "country", label: "ประเทศ", formulaLabel: "ประเทศ", width: 140 },
];

function computedKey(key) {
  return `computed:${key}`;
}

function columnName(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const digit = (value - 1) % 26;
    result = String.fromCharCode(65 + digit) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function cellValue(cell) {
  if (!cell) return "";
  if (cell.f) return cell.f;
  return cell.v ?? "";
}

function sectionMarker(type, ids) {
  return JSON.stringify({ type, ...ids });
}

function readMarker(value) {
  if (typeof value !== "string" || !value.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed.type === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function orderedColumns(computedColumns, savedOrder) {
  const available = [
    ...PACK_BASE_COLUMNS.map((column) => column.key),
    ...computedColumns.map((column) => computedKey(column.key)),
  ];
  const known = new Set(available);
  const order = Array.isArray(savedOrder)
    ? savedOrder.filter((key, index) => known.has(key) && savedOrder.indexOf(key) === index)
    : [];
  for (const key of available) if (!order.includes(key)) order.push(key);
  return order.map((key) => {
    if (key.startsWith("computed:")) {
      const formulaColumn = computedColumns.find((column) => computedKey(column.key) === key);
      return {
        key,
        label: formulaColumn?.label || "สูตร",
        width: 140,
        computed: formulaColumn,
      };
    }
    return PACK_BASE_COLUMNS.find((column) => column.key === key);
  });
}

function literal(value) {
  if (value === null || value === undefined || value === "") return '""';
  const number = Number(value);
  if (typeof value !== "boolean" && Number.isFinite(number)) return String(number);
  return `"${String(value).replaceAll('"', '""')}"`;
}

function formulaToA1(formula, rowIndex, columns, game) {
  const formulaFields = new Map();
  columns.forEach((column, index) => {
    // A is hidden metadata and B is the fixed fold control. Pack data starts
    // at C, regardless of how the user reorders the data columns after it.
    if (column.formulaLabel) formulaFields.set(column.formulaLabel, `${columnName(index + 2)}${rowIndex + 1}`);
  });
  const gameFields = new Map([
    ["ชื่อเกม", literal(game.gameName)],
    ["ภูมิภาค", literal(game.region)],
    ["แพลตฟอร์ม", literal(game.platform)],
    ["เซิร์ฟเวอร์", literal(game.server)],
    // Keep the market rate as a native Univer defined name. This makes the
    // generated formula and formulas typed directly into the formula bar use
    // the same USDT_THB token instead of baking a stale number into each cell.
    ["USDT/THB", "USDT_THB"],
  ]);
  const expression = String(formula || "").replace(/\[([^\]]+)\]/g, (match, label) => {
    return formulaFields.get(label) || gameFields.get(label) || match;
  });
  return expression.trim() ? `=${expression.replace(/^=/, "")}` : "";
}

function formulaFromA1(formula, rowIndex, columns) {
  if (typeof formula !== "string" || !formula.startsWith("=")) return null;
  let invalid = false;
  const expression = formula.slice(1).replace(/\$?([A-Z]+)\$?(\d+)/gi, (match, letters, row) => {
    if (Number(row) !== rowIndex + 1) {
      invalid = true;
      return match;
    }
    let index = 0;
    for (const char of letters.toUpperCase()) index = index * 26 + char.charCodeAt(0) - 64;
    // Column A is hidden metadata and B is the fold control; data starts at C.
    const column = columns[index - 3];
    if (!column?.formulaLabel) {
      invalid = true;
      return match;
    }
    return `[${column.formulaLabel}]`;
  });
  if (invalid) return null;
  const gameinfoExpression = expression.replace(/\bUSDT_THB\b/gi, "[USDT/THB]");
  try {
    parseFormula(gameinfoExpression);
    return gameinfoExpression;
  } catch {
    return null;
  }
}

function buildWorkbookData({ currencies, computedColumns, columnOrder, game, dark, invalidFields }) {
  const columns = orderedColumns(computedColumns, columnOrder);
  const cellData = {};
  const rowData = {};
  const sections = [];
  const header = {
    0: { v: META_KEY, s: "header", custom: { columnKey: META_KEY } },
    1: { v: "", s: "header", custom: { columnKey: TOGGLE_KEY } },
  };
  columns.forEach((column, index) => {
    header[index + 2] = {
      v: column.label,
      s: "header",
      custom: { columnKey: column.key },
    };
  });
  cellData[0] = header;
  rowData[0] = { h: 34 };

  let row = 1;
  currencies.forEach((currency) => {
    // Keep an empty currency visible so it can still be selected and receive
    // its first category. Currencies that already have categories do not need
    // a separate banner row—the group label sits beside the first pack.
    if (currency.categories.length === 0) {
      cellData[row] = {
        0: {
          v: sectionMarker("currency", {
            currencyId: currency.id,
            currencyName: currency.name,
          }),
        },
        1: { v: currency.name || "สกุลเงินใหม่", s: "currency" },
      };
        for (let column = 2; column <= columns.length + 1; column += 1) {
          cellData[row][column] = { v: "", s: "locked" };
      }
      rowData[row] = { h: 34 };
      row += 1;
    }

    currency.categories.forEach((category) => {
      // An empty category keeps one placeholder row; once it has packs the
      // first pack takes this exact row and the remaining packs continue
      // immediately below it.
      if (category.packs.length === 0) {
        cellData[row] = {
          0: {
            v: sectionMarker("category", {
              currencyId: currency.id,
              currencyName: currency.name,
              categoryId: category.id,
              categoryName: category.name,
            }),
          },
          1: { v: category.name || "หมวดหมู่ใหม่", s: "category" },
        };
        for (let column = 2; column <= columns.length + 1; column += 1) {
          cellData[row][column] = { v: "", s: "locked" };
        }
        rowData[row] = { h: 32 };
        row += 1;
        return;
      }

      // A collapsed-only heading lets us hide every pack, including the
      // first one, without losing the control needed to expand the group.
      // It is hidden while expanded, so the normal layout still has the
      // group label and first pack sharing one row.
      const collapsedHeaderRow = row;
      cellData[row] = {
        0: {
          v: sectionMarker("category", {
            currencyId: currency.id,
            currencyName: currency.name,
            categoryId: category.id,
            categoryName: category.name,
          }),
        },
        1: { v: `▸  ${category.name || currency.name || "หมวดหมู่"}`, s: "category" },
      };
      for (let column = 2; column <= columns.length + 1; column += 1) {
        cellData[row][column] = { v: "", s: "locked" };
      }
      rowData[row] = { h: 32, hd: BooleanNumber.TRUE };
      row += 1;
      const firstPackRow = row;

      category.packs.forEach((pack, packIndex) => {
        const isGroupStart = packIndex === 0;
        const packRow = {
          0: {
            v: sectionMarker("pack", {
              currencyId: currency.id,
              currencyName: currency.name,
              categoryId: category.id,
              categoryName: category.name,
              packId: pack.id,
              groupStart: isGroupStart,
            }),
          },
          1: {
            v: isGroupStart ? `▾  ${category.name || currency.name || "หมวดหมู่"}` : "",
            s: isGroupStart ? "category" : "locked",
          },
        };
        columns.forEach((column, index) => {
          const cellIndex = index + 2;
          if (column.computed) {
            packRow[cellIndex] = {
              f: formulaToA1(column.computed.formula, row, columns, game),
              s: "formula",
            };
          } else {
            const raw = column.list
              ? Array.isArray(pack[column.key])
                ? pack[column.key].join(", ")
                : ""
              : pack[column.key] ?? "";
            const numeric = column.numeric && raw !== "" && Number.isFinite(Number(raw));
            const invalid = invalidFields?.has(`${pack.id}:${column.key}`);
            packRow[cellIndex] = {
              v: numeric ? Number(raw) : raw,
              s: invalid ? "invalid" : numeric ? "number" : "body",
            };
          }
        });
        cellData[row] = packRow;
        rowData[row] = { h: 32 };
        row += 1;
      });

      sections.push({
        marker: sectionMarker("category", {
          currencyId: currency.id,
          categoryId: category.id,
        }),
        row: firstPackRow,
        collapsedHeaderRow,
        start: firstPackRow,
        count: category.packs.length,
      });
    });
  });

  const columnData = {
    0: { w: 1, hd: BooleanNumber.TRUE },
    1: { w: 190 },
  };
  columns.forEach((column, index) => {
    columnData[index + 2] = { w: column.width || 140 };
  });

  const ink = dark ? "#d0d6e0" : "#334155";
  const subtle = dark ? "#8a8f98" : "#64748b";
  return {
    columns,
    sections,
    workbook: {
      id: `pack-${game.id}`,
      name: `Packs — ${game.gameName}`,
      locale: LocaleType.EN_US,
      appVersion: "0.25.1",
      sheetOrder: ["packs"],
      styles: {
        header: { bg: { rgb: dark ? "#18191a" : "#f1f5f9" }, cl: { rgb: subtle }, bl: 1 },
        currency: { bg: { rgb: dark ? "#20233a" : "#eef2ff" }, cl: { rgb: dark ? "#aeb7ff" : "#4338ca" }, bl: 1 },
        category: { bg: { rgb: dark ? "#171c27" : "#f8fafc" }, cl: { rgb: ink }, bl: 1 },
        locked: { bg: { rgb: dark ? "#111213" : "#f8fafc" }, cl: { rgb: subtle } },
        body: { cl: { rgb: ink } },
        number: { cl: { rgb: ink }, ht: 3 },
        formula: { bg: { rgb: dark ? "#151722" : "#fafaff" }, cl: { rgb: dark ? "#aeb7ff" : "#4f46e5" } },
        invalid: {
          bg: { rgb: dark ? "#3b171c" : "#fff1f2" },
          cl: { rgb: dark ? "#fecdd3" : "#be123c" },
          bd: {
            t: { s: 1, cl: { rgb: "#ef4444" } },
            b: { s: 1, cl: { rgb: "#ef4444" } },
            l: { s: 1, cl: { rgb: "#ef4444" } },
            r: { s: 1, cl: { rgb: "#ef4444" } },
          },
        },
      },
      sheets: {
        packs: {
          id: "packs",
          name: "Packs",
          // Header + exactly the rows represented by the pack tree. Univer's
          // default spare grid rows make a short pack list look unfinished.
          rowCount: Math.max(row, 1),
          columnCount: columns.length + 2,
          cellData,
          rowData,
          columnData,
          showGridlines: 1,
          freeze: { startRow: 1, ySplit: 1, startColumn: 2, xSplit: 2 },
        },
      },
    },
  };
}

function stripSectionPrefix(value) {
  return String(value ?? "").replace(/^[▾▸]\s*/, "").trim();
}

function splitList(value) {
  return String(value ?? "")
    .split(/[,·]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readSheet(workbook, previousCurrencies, computedColumns) {
  const snapshot = workbook.getSnapshot();
  const sheet = snapshot.sheets?.packs;
  if (!sheet) return null;
  const cells = sheet.cellData || {};
  const headerCells = cells[0] || {};
  const columnEntries = Object.entries(headerCells)
    .map(([index, cell]) => ({ index: Number(index), key: cell?.custom?.columnKey }))
    .filter((item) => item.key && item.key !== META_KEY && item.key !== TOGGLE_KEY)
    .sort((a, b) => a.index - b.index);
  const metaEntry = Object.entries(headerCells).find(([, cell]) => cell?.custom?.columnKey === META_KEY);
  const metaColumn = metaEntry ? Number(metaEntry[0]) : 0;
  const toggleEntry = Object.entries(headerCells).find(([, cell]) => cell?.custom?.columnKey === TOGGLE_KEY);
  const toggleColumn = toggleEntry ? Number(toggleEntry[0]) : 1;
  const columns = columnEntries.map(({ key }) => {
    if (key.startsWith("computed:")) {
      return {
        key,
        computed: computedColumns.find((column) => computedKey(column.key) === key),
      };
    }
    return PACK_BASE_COLUMNS.find((column) => column.key === key);
  });

  const currencyById = new Map(previousCurrencies.map((currency) => [String(currency.id), currency]));
  const nextCurrencies = [];
  const currencyMap = new Map();
  const categoryMap = new Map();
  const formulaCandidates = new Map();

  function ensureCurrency(marker, row) {
    const id = String(marker.currencyId);
    if (currencyMap.has(id)) return currencyMap.get(id);
    const original = currencyById.get(id);
    const currency = {
      id: marker.currencyId,
      name: marker.currencyName || original?.name ||
        (marker.type === "currency" ? stripSectionPrefix(cellValue(row[toggleColumn])) : ""),
      image: original?.image || "",
      categories: [],
    };
    nextCurrencies.push(currency);
    currencyMap.set(id, currency);
    return currency;
  }

  function ensureCategory(marker, row) {
    const currency = ensureCurrency(marker, row);
    const key = `${marker.currencyId}:${marker.categoryId}`;
    if (categoryMap.has(key)) {
      const existing = categoryMap.get(key);
      // The hidden collapsed heading is encountered first in cellData. While
      // expanded, the inline label on the first pack is the editable source.
      if (marker.groupStart) {
        existing.name = stripSectionPrefix(cellValue(row[toggleColumn])) || existing.name;
      }
      return existing;
    }
    const category = {
      id: marker.categoryId,
      name: marker.groupStart || marker.type === "category"
        ? stripSectionPrefix(cellValue(row[toggleColumn])) || marker.categoryName || ""
        : marker.categoryName || "",
      packs: [],
    };
    currency.categories.push(category);
    categoryMap.set(key, category);
    return category;
  }

  Object.keys(cells)
    .map(Number)
    .filter((row) => row > 0)
    .sort((a, b) => a - b)
    .forEach((rowIndex) => {
      const row = cells[rowIndex] || {};
      const marker = readMarker(cellValue(row[metaColumn]));
      if (!marker) return;
      if (marker.type === "currency") {
        ensureCurrency(marker, row);
        return;
      }
      if (marker.type === "category") {
        ensureCategory(marker, row);
        return;
      }
      if (marker.type !== "pack") return;
      const category = ensureCategory(marker, row);
      const pack = { id: marker.packId };
      columnEntries.forEach(({ index, key }) => {
        const value = cellValue(row[index]);
        if (key.startsWith("computed:")) {
          const translated = formulaFromA1(value, rowIndex, columns);
          if (translated && !formulaCandidates.has(key)) formulaCandidates.set(key, translated);
          return;
        }
        const definition = PACK_BASE_COLUMNS.find((column) => column.key === key);
        if (!definition) return;
        pack[key] = definition.list ? splitList(value) : String(value ?? "");
      });
      for (const definition of PACK_BASE_COLUMNS) {
        if (!(definition.key in pack)) pack[definition.key] = definition.list ? [] : "";
      }
      category.packs.push(pack);
    });

  const nextComputed = computedColumns
    .map((column) => ({
      ...column,
      formula: formulaCandidates.get(computedKey(column.key)) || column.formula,
    }))
    .sort((a, b) => {
      const aIndex = columnEntries.findIndex((entry) => entry.key === computedKey(a.key));
      const bIndex = columnEntries.findIndex((entry) => entry.key === computedKey(b.key));
      return aIndex - bIndex;
    });
  return {
    currencies: nextCurrencies,
    computedColumns: nextComputed,
    columnOrder: columnEntries.map((entry) => entry.key),
  };
}

export default function GameinfoPackUniver({
  game,
  currencies,
  computedColumns,
  columnOrder,
  revision,
  invalidFields,
  onChange,
  onSelectionContext,
  canDeleteRow,
  onDeleteRow,
  canDeleteColumn,
  onDeleteColumn,
}) {
  const shellRef = useRef(null);
  const containerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onSelectionRef = useRef(onSelectionContext);
  const [collapseHeight, setCollapseHeight] = useState({ revision, hiddenRows: 0 });
  const invalidSignature = Array.from(invalidFields || []).sort().join("|");
  const dataRowCount = currencies.reduce((currencyTotal, currency) => {
    if (currency.categories.length === 0) return currencyTotal + 1;
    return currencyTotal + currency.categories.reduce(
      (categoryTotal, category) => categoryTotal + Math.max(category.packs.length, 1),
      0
    );
  }, 0);
  // Formula bar + column header + every real row. The Pack sheet grows with
  // its content so the page owns vertical scrolling; Univer only needs its
  // horizontal scrollbar when the columns are wider than the viewport.
  const hiddenRows = collapseHeight.revision === revision ? collapseHeight.hiddenRows : 0;
  const sheetHeight = Math.max(118, 92 + Math.max(0, dataRowCount - hiddenRows) * 32);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSelectionRef.current = onSelectionContext;
  }, [onChange, onSelectionContext]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const dark = document.documentElement.dataset.theme !== "light";
    const data = buildWorkbookData({
      currencies,
      computedColumns,
      columnOrder,
      game,
      dark,
      invalidFields,
    });
    const univer = new Univer({
      locale: LocaleType.EN_US,
      locales: {
        [LocaleType.EN_US]: mergeLocales(
          DesignEnUS,
          UIEnUS,
          DocsUIEnUS,
          SheetsEnUS,
          SheetsUIEnUS,
          SheetsFormulaUIEnUS,
          SheetsNumfmtUIEnUS
        ),
      },
      logLevel: LogLevel.ERROR,
    });
    univer.registerPlugin(UniverRenderEnginePlugin);
    univer.registerPlugin(UniverFormulaEnginePlugin);
    univer.registerPlugin(UniverUIPlugin, {
      container: containerRef.current,
      header: false,
      toolbar: false,
      footer: false,
      contextMenu: false,
    });
    univer.registerPlugin(UniverDocsPlugin);
    univer.registerPlugin(UniverDocsUIPlugin);
    univer.registerPlugin(UniverSheetsPlugin);
    univer.registerPlugin(UniverSheetsUIPlugin, {
      formulaBar: true,
      footer: false,
      disableForceStringAlert: true,
      protectedRangeShadow: false,
    });
    univer.registerPlugin(UniverSheetsFormulaPlugin);
    univer.registerPlugin(UniverSheetsFormulaUIPlugin);
    univer.registerPlugin(UniverSheetsNumfmtPlugin);
    univer.registerPlugin(UniverSheetsNumfmtUIPlugin);

    const univerAPI = FUniver.newAPI(univer);
    univerAPI.toggleDarkMode(dark);
    const workbook = univerAPI.createWorkbook(data.workbook);
    const worksheet = workbook.getActiveSheet();
    const usdtThb = Number(game.usdtThb);
    const usdtDefinedName = workbook
      .newDefinedNameBuilder()
      .setName("USDT_THB")
      .setFormula(String(Number.isFinite(usdtThb) && usdtThb > 0 ? usdtThb : 0))
      .setComment("ราคา 1 USDT เป็นเงินบาท อัปเดตทุก 1 ชั่วโมง")
      .setHidden(true)
      .build();
    workbook.insertDefinedNameBuilder(usdtDefinedName);
    let changeTimer;
    let hasSheetSelection = false;
    const collapsed = new Set();

    const forwardVerticalWheelToPage = (event) => {
      // Keep horizontal trackpad gestures available for wide sheets, but the
      // vertical wheel belongs to the document because this component already
      // expands to show every row. Capture before Univer's canvas consumes it.
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      event.stopPropagation();
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      window.scrollBy({ top: event.deltaY * scale, left: 0, behavior: "auto" });
    };
    const container = containerRef.current;
    container.addEventListener("wheel", forwardVerticalWheelToPage, {
      passive: false,
      capture: true,
    });

    const clearSelection = (saveEditing) => {
      const hideSelection = () => {
        workbook.transparentSelection();
        hasSheetSelection = false;
        onSelectionRef.current?.(null);
      };
      if (workbook.isCellEditing()) {
        void workbook.endEditingAsync(saveEditing).then(hideSelection);
      } else {
        hideSelection();
      }
    };
    const handleOutsidePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (shellRef.current?.contains(target) || target.closest("[data-pack-sheet-controls]")) return;
      clearSelection(true);
    };
    const handleEscape = (event) => {
      if (!hasSheetSelection) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        clearSelection(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        clearSelection(true);
      }
    };
    const showSelection = () => workbook.showSelection();
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    document.addEventListener("keydown", handleEscape, true);
    container.addEventListener("pointerdown", showSelection, true);

    // The heavy divider is part of the Pack component's layout: it keeps the
    // header row and group column visible while scrolling. Univer normally
    // lets users drag or cancel that divider, so cancel every freeze command
    // (including the underlying mutation used by the drag handle).
    const freezeGuardDisposable = univerAPI.addEvent(
      univerAPI.Event.BeforeCommandExecute,
      (event) => {
        if (LOCKED_FREEZE_COMMANDS.has(event.id) || LOCKED_TABLE_LAYOUT_COMMANDS.has(event.id)) {
          event.cancel = true;
          return;
        }

        // Metadata and the fold-control column are adapter structure, not
        // user columns. Data columns can still be dragged and reordered, but
        // they must never cross the two fixed columns at the left.
        if (event.id === "sheet.command.move-cols") {
          const fromRange = event.params?.fromRange;
          const toRange = event.params?.toRange;
          if (
            !fromRange ||
            !toRange ||
            fromRange.startColumn < 2 ||
            toRange.startColumn < 2
          ) {
            event.cancel = true;
          }
        }
      }
    );

    const editGuardDisposable = univerAPI.addEvent(
      univerAPI.Event.BeforeSheetEditStart,
      (params) => {
        const { row, column } = params;
        // Header labels and the hidden metadata column describe the adapter,
        // not user data. Letting them change can make a visible column stop
        // mapping back to the stored pack field.
        if (row === 0 || column === 0) {
          params.cancel = true;
          return;
        }
        const marker = readMarker(worksheet.getRange(row, 0).getValue());
        if (!marker) {
          params.cancel = true;
          return;
        }
        if (column === 1) {
          // Only the inline group label has a stored meaning. Blank group
          // cells on the following pack rows are visual indentation only.
          const editableGroupLabel =
            marker.type === "currency" ||
            marker.type === "category" ||
            (marker.type === "pack" && marker.groupStart);
          if (!editableGroupLabel) params.cancel = true;
          return;
        }
        // Empty currency/category placeholder rows have no pack record, so
        // all apparent data cells on those rows are deliberately read-only.
        if (marker.type !== "pack") params.cancel = true;
      }
    );

    const isEditableCell = (row, column, marker, isGroupToggle = false) => {
      if (row === 0 || column === 0 || !marker || isGroupToggle) return false;
      if (column === 1) {
        return marker.type === "currency" || marker.type === "category";
      }
      return marker.type === "pack";
    };

    const clickDisposable = univerAPI.addEvent(univerAPI.Event.CellClicked, ({ row, column }) => {
      hasSheetSelection = true;
      const selectedColumn = column >= 2 ? data.columns[column - 2] : null;
      const markerValue = worksheet.getRange(row, 0).getValue();
      const marker = readMarker(markerValue);
      if (!marker) {
        onSelectionRef.current?.(
          selectedColumn
            ? {
                type: "column",
                columnKey: selectedColumn.key,
                columnLabel: selectedColumn.label,
                computedColumnKey: selectedColumn.computed?.key || null,
                name: selectedColumn.label,
              }
            : null
        );
        return;
      }
      const isInlineGroupToggle = marker.type === "pack" && marker.groupStart && column === 1;
      const isCollapsedGroupToggle = marker.type === "category" && column === 1 &&
        data.sections.some((section) => section.collapsedHeaderRow === row);
      const isGroupToggle = isInlineGroupToggle || isCollapsedGroupToggle;
      const selectedCurrency = currencies.find(
        (currency) => String(currency.id) === String(marker.currencyId)
      );
      const selectedCategory = selectedCurrency?.categories.find(
        (category) => String(category.id) === String(marker.categoryId)
      );
      const selectedName = isInlineGroupToggle
        ? selectedCategory?.name
        : marker.type === "pack"
          ? selectedCategory?.packs.find((pack) => String(pack.id) === String(marker.packId))?.name
          : marker.type === "category"
            ? selectedCategory?.name
            : selectedCurrency?.name;
      onSelectionRef.current?.(
        isInlineGroupToggle
          ? { type: "category", currencyId: marker.currencyId, categoryId: marker.categoryId, name: selectedName || "" }
          : {
              ...marker,
              name: selectedName || "",
              columnKey: selectedColumn?.key || null,
              columnLabel: selectedColumn?.label || "",
              computedColumnKey: selectedColumn?.computed?.key || null,
            }
      );

      if (!isGroupToggle) {
        if (isEditableCell(row, column, marker)) workbook.startEditing();
        return;
      }
      const markerText = sectionMarker("category", {
        currencyId: marker.currencyId,
        categoryId: marker.categoryId,
      });
      const section = data.sections.find((item) => item.marker === markerText);
      if (!section || section.count === 0) return;
      if (collapsed.has(section.marker)) {
        worksheet.showRows(section.start, section.count);
        worksheet.hideRows(section.collapsedHeaderRow, 1);
        collapsed.delete(section.marker);
        setCollapseHeight((current) => ({
          revision,
          hiddenRows: Math.max(
            0,
            (current.revision === revision ? current.hiddenRows : 0) - Math.max(0, section.count - 1)
          ),
        }));
      } else {
        worksheet.showRows(section.collapsedHeaderRow, 1);
        worksheet.hideRows(section.start, section.count);
        collapsed.add(section.marker);
        setCollapseHeight((current) => ({
          revision,
          hiddenRows:
            (current.revision === revision ? current.hiddenRows : 0) + Math.max(0, section.count - 1),
        }));
      }
    });

    const commandDisposable = workbook.onCommandExecuted(() => {
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => {
        const next = readSheet(workbook, currencies, computedColumns);
        if (next) onChangeRef.current?.(next);
      }, 160);
    });

    return () => {
      clearTimeout(changeTimer);
      container.removeEventListener("wheel", forwardVerticalWheelToPage, { capture: true });
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      document.removeEventListener("keydown", handleEscape, true);
      container.removeEventListener("pointerdown", showSelection, true);
      freezeGuardDisposable?.dispose();
      editGuardDisposable?.dispose();
      clickDisposable?.dispose();
      commandDisposable?.dispose();
      univer.dispose();
    };
    // `revision` deliberately controls destructive rebuilds. Ordinary cell
    // edits flow out through onChange without recreating the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, invalidSignature, game.usdtThb]);

  return (
    <div
      ref={shellRef}
      className="overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1"
    >
      <div className="flex items-center justify-between border-b border-linear-hairline bg-linear-surface-2 px-3 py-2">
        <div>
          <p className="text-sm font-medium text-linear-ink">Pack sheet</p>
          <p className="text-[11px] text-linear-ink-subtle">
            กดหัวข้อเพื่อพับ · เพิ่มคอลัมน์สูตรแล้วพิมพ์ = · ลากมุมเซลล์เพื่อเติมสูตร
          </p>
          <p className="mt-0.5 text-[11px] text-linear-primary">
            สูตร USDT ใช้ USDT_THB · เช่น =(E3*0.5)/USDT_THB
            {Number.isFinite(Number(game.usdtThb)) ? ` · ตอนนี้ ฿${Number(game.usdtThb).toFixed(4)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDeleteRow}
            disabled={!canDeleteRow}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 text-[11px] font-medium text-red-400 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-35"
            title={canDeleteRow ? "ลบแถว Pack ที่เลือก" : "เลือกแถว Pack ก่อน"}
          >
            <Trash2 size={12} /> ลบแถว
          </button>
          <button
            type="button"
            onClick={onDeleteColumn}
            disabled={!canDeleteColumn}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 text-[11px] font-medium text-red-400 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-35"
            title={canDeleteColumn ? "ลบคอลัมน์สูตรที่เลือก" : "เลือกคอลัมน์สูตรก่อน"}
          >
            <Trash2 size={12} /> ลบคอลัมน์
          </button>
          <span className="rounded-full border border-linear-primary/30 bg-linear-primary/10 px-2 py-1 text-[10px] font-medium text-linear-primary">
            Univer compact
          </span>
        </div>
      </div>
      <div
        ref={containerRef}
        className="gameinfo-pack-univer w-full"
        style={{ height: sheetHeight }}
      />
    </div>
  );
}
