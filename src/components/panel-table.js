"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerDownRight,
  ExternalLink,
  EyeOff,
  Layers,
  Pencil,
  Sigma,
  Trash2,
  Zap,
} from "lucide-react";
import {
  clampColumnWidth,
  formatCell,
  formatOf,
  MAX_NATURAL_WIDTH,
  MIN_COLUMN_WIDTH,
  ROW_NUMBER_WIDTH,
  ruleMatches,
  SUMMARY_KINDS,
  SUMMARY_LABELS,
  summarize,
  toneStyle,
  toNumber,
} from "@/lib/gamedb-layout";

const headerButton =
  "rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700";

// Only base columns carry `column`; computed, merged and compare columns each
// describe themselves differently.
function columnTooltip(col) {
  if (col.kind === "computed") return `สูตร: ${col.formula} — กดเพื่อเรียงลำดับ`;
  if (col.kind === "merged") return `ดึงมาจากคอลัมน์ ${col.source} ของอีก Query — กดเพื่อเรียงลำดับ`;
  if (col.kind === "compare") {
    return `เทียบค่า ${col.pair.left} กับ ${col.pair.right} ของอีก Query — กดเพื่อเรียงลำดับ`;
  }
  return `${col.column.name} — กดเพื่อเรียงลำดับ`;
}

const HEADER_TONE = {
  computed: "text-red-600",
  merged: "text-sky-700",
  compare: "text-sky-700",
  base: "text-zinc-700",
};

// Below this many rows the browser handles it fine and windowing only adds
// jitter; above it, only the visible slice is rendered with spacer rows top and
// bottom so the scrollbar still represents the whole result.
const VIRTUAL_THRESHOLD = 150;
const ROW_HEIGHT = 26;
const OVERSCAN = 12;

// Only these two schemes become a real link. Anything else — javascript:,
// data:, a bare "www.x.com" that the browser would resolve against this app —
// stays plain text.
const SAFE_URL = /^https?:\/\/\S+$/i;
const PLAIN_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Value plus a copy button that reports back for a moment. */
function CopyCell({ text }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <span className="flex items-center gap-1">
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          navigator.clipboard?.writeText(text).then(
            () => setCopied(true),
            () => {}
          );
        }}
        className="shrink-0 rounded p-0.5 text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-zinc-700 group-hover/row:opacity-100"
        title="คัดลอก"
      >
        {copied ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} />}
      </button>
    </span>
  );
}

/** What goes inside a cell once its column has a render mode set. */
function CellContent({ text, render, tone }) {
  if (!text || text === "—") return text;
  if (render === "link" && SAFE_URL.test(text)) {
    return (
      <a
        href={text}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="inline-flex max-w-full items-center gap-1 truncate text-sky-700 underline underline-offset-2"
      >
        <span className="truncate">{hostnameOf(text)}</span>
        <ExternalLink size={9} className="shrink-0" />
      </a>
    );
  }
  if (render === "email" && PLAIN_EMAIL.test(text.trim())) {
    return (
      <a
        href={`mailto:${text.trim()}`}
        onClick={(event) => event.stopPropagation()}
        className="truncate text-sky-700 underline underline-offset-2"
      >
        {text}
      </a>
    );
  }
  if (render === "chip") {
    return (
      <span
        className="inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-black"
        style={toneStyle(tone) || { backgroundColor: "#f4f4f5", color: "#3f3f46" }}
      >
        {text}
      </span>
    );
  }
  if (render === "copy") return <CopyCell text={text} />;
  return text;
}

export default function PanelTable({
  columns,
  allColumns,
  rows,
  layout,
  mutateLayout,
  height,
  canEdit,
  editableColumns,
  editPending,
  onEditCell,
  changedKeys,
  onDrill,
  drillLabel,
  actions = [],
  onRunAction,
  onDeleteRow,
}) {
  const [naturalWidths, setNaturalWidths] = useState({});
  const [resizing, setResizing] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const headRefs = useRef({});
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const frameRef = useRef({ raf: 0, timer: 0 });

  // Grouping and windowing are mutually exclusive: a grouped table is a
  // browsing aid, and its rows move around as groups collapse.
  const groupColIndex = layout.group
    ? columns.findIndex((col) => col.id === layout.group.colId)
    : -1;
  const grouped = groupColIndex !== -1;
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());

  const groups = useMemo(() => {
    if (!grouped) return null;
    const map = new Map();
    for (const row of rows) {
      const key = row.cells[groupColIndex]?.text ?? "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.entries()].map(([key, groupRows]) => ({ key, rows: groupRows }));
  }, [grouped, groupColIndex, rows]);

  // Windowing assumes every row is ROW_HEIGHT tall; a wrapped column breaks
  // that assumption, so the two features take turns.
  const hasWrap = useMemo(
    () => columns.some((col) => formatOf(layout, col.id).wrap),
    [columns, layout]
  );

  const virtual = !grouped && !hasWrap && rows.length > VIRTUAL_THRESHOLD;
  const firstVisible = virtual
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    : 0;
  const lastVisible = virtual
    ? Math.min(rows.length, firstVisible + Math.ceil(height / ROW_HEIGHT) + OVERSCAN * 2)
    : rows.length;
  const visibleRows = virtual ? rows.slice(firstVisible, lastVisible) : rows;
  const padTop = firstVisible * ROW_HEIGHT;
  const padBottom = Math.max(0, (rows.length - lastVisible) * ROW_HEIGHT);

  const onScroll = (event) => {
    if (!virtual) return;
    const { scrollTop: next } = event.currentTarget;
    // One state update per frame while the tab is on screen. A background tab
    // gets no animation frames at all, so a timer runs alongside and whichever
    // arrives first wins — otherwise the window would freeze where it was.
    cancelAnimationFrame(frameRef.current.raf);
    clearTimeout(frameRef.current.timer);
    const apply = () => {
      cancelAnimationFrame(frameRef.current.raf);
      clearTimeout(frameRef.current.timer);
      setScrollTop(next);
    };
    frameRef.current.raf = requestAnimationFrame(apply);
    frameRef.current.timer = setTimeout(apply, 32);
  };

  useEffect(() => {
    const handles = frameRef.current;
    return () => {
      cancelAnimationFrame(handles.raf);
      clearTimeout(handles.timer);
    };
  }, []);

  const widthOf = useCallback(
    (colId) => layout.widths[colId] || naturalWidths[colId] || null,
    [layout.widths, naturalWidths]
  );

  const measured = columns.length > 0 && columns.every((col) => widthOf(col.id));

  // First paint uses auto table layout so the browser sizes each column to its
  // content; we snapshot those widths and then switch to a fixed layout, which
  // is what makes dragging a column edge behave predictably.
  useLayoutEffect(() => {
    if (measured) return;
    const next = {};
    for (const col of columns) {
      if (widthOf(col.id)) continue;
      const el = headRefs.current[col.id];
      if (!el) continue;
      const width = Math.ceil(el.getBoundingClientRect().width) + 8;
      next[col.id] = Math.min(MAX_NATURAL_WIDTH, clampColumnWidth(width));
    }
    if (Object.keys(next).length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measuring the DOM after paint is the point here
    setNaturalWidths((prev) => ({ ...prev, ...next }));
  }, [measured, columns, widthOf]);

  const setColumnWidth = useCallback(
    (colId, width) => {
      mutateLayout((prev) => ({
        ...prev,
        widths: { ...prev.widths, [colId]: clampColumnWidth(width) },
      }));
    },
    [mutateLayout]
  );

  useEffect(() => {
    if (!resizing) return undefined;
    const move = (event) =>
      setColumnWidth(resizing.colId, resizing.startWidth + (event.clientX - resizing.startX));
    const stop = () => setResizing(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [resizing, setColumnWidth]);

  const resetColumnWidth = (colId) => {
    mutateLayout((prev) => {
      const widths = { ...prev.widths };
      delete widths[colId];
      return { ...prev, widths };
    });
    setNaturalWidths((prev) => {
      const next = { ...prev };
      delete next[colId];
      return next;
    });
  };

  const moveColumn = (colId, direction) => {
    const ids = allColumns.map((col) => col.id);
    const from = ids.indexOf(colId);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    mutateLayout((prev) => ({ ...prev, order: ids }));
  };

  const renameColumn = (col) => {
    const next = window.prompt("ตั้งชื่อคอลัมน์ใหม่", col.label);
    if (next === null) return;
    mutateLayout((prev) => ({
      ...prev,
      labels: { ...prev.labels, [col.id]: next.trim() || col.label },
    }));
  };

  const toggleSort = (colId) => {
    mutateLayout((prev) => {
      const current = prev.sort;
      if (!current || current.colId !== colId) return { ...prev, sort: { colId, dir: "asc" } };
      if (current.dir === "asc") return { ...prev, sort: { colId, dir: "desc" } };
      return { ...prev, sort: null };
    });
  };

  const cycleSummary = (colId) => {
    mutateLayout((prev) => {
      const current = prev.summary[colId];
      const index = SUMMARY_KINDS.indexOf(current);
      const next = index === -1 ? SUMMARY_KINDS[0] : SUMMARY_KINDS[index + 1];
      const summary = { ...prev.summary };
      if (next) summary[colId] = next;
      else delete summary[colId];
      return { ...prev, summary };
    });
  };

  // Rules, formats and bar maxima are per column, so resolve them once per
  // render instead of inside the cell loop.
  const columnStyling = useMemo(() => {
    return columns.map((col, index) => {
      const rules = layout.rules.filter(
        (rule) => rule.colId === col.id && rule.scope !== "row"
      );
      const barRule = rules.find((rule) => rule.tone === "bar");
      let barMax = 0;
      if (barRule) {
        for (const row of rows) {
          const value = toNumber(row.cells[index]?.raw);
          if (value !== null) barMax = Math.max(barMax, Math.abs(value));
        }
      }
      return { rules, barMax, format: formatOf(layout, col.id) };
    });
  }, [columns, layout, rows]);

  // A rule may compare against "[Another column]", so give it a way to read the
  // rest of the row by either display id or visible label.
  const columnIndexByName = useMemo(() => {
    const map = new Map();
    columns.forEach((col, index) => {
      map.set(col.id, index);
      if (!map.has(col.label)) map.set(col.label, index);
    });
    return map;
  }, [columns]);

  const resolverFor = useCallback(
    (row) => (name) => {
      const index = columnIndexByName.get(name);
      return index === undefined ? undefined : row.cells[index]?.raw;
    },
    [columnIndexByName]
  );

  // Row-scoped rules read one column and paint the whole row, which is how a
  // status column ends up colouring everything beside it.
  const rowRules = useMemo(
    () =>
      layout.rules
        .filter((rule) => rule.scope === "row" && rule.tone !== "bar")
        .map((rule) => ({ rule, index: columns.findIndex((col) => col.id === rule.colId) }))
        .filter((entry) => entry.index !== -1),
    [layout.rules, columns]
  );

  // Columns pinned to the left need their own offsets, and those only exist
  // once every width is known.
  const freezeCount = measured ? Math.min(layout.freeze || 0, columns.length) : 0;
  const freezeOffsets = useMemo(() => {
    if (!freezeCount) return [];
    const offsets = [];
    let left = ROW_NUMBER_WIDTH;
    for (let index = 0; index < freezeCount; index += 1) {
      offsets.push(left);
      left += widthOf(columns[index].id) || MIN_COLUMN_WIDTH;
    }
    return offsets;
  }, [freezeCount, columns, widthOf]);

  const summaryValues = useMemo(() => {
    if (!Object.keys(layout.summary).length) return null;
    return columns.map((col, index) => {
      const kind = layout.summary[col.id];
      if (!kind) return null;
      const value = summarize(kind, rows.map((row) => row.cells[index]?.raw));
      return { kind, value };
    });
  }, [columns, layout.summary, rows]);

  const startEdit = (row, col, colIndex) => {
    if (!canEdit || col.kind !== "base" || !editableColumns.includes(col.column.name)) return;
    setEditingCell({
      sourceIndex: row.sourceIndex,
      colId: col.id,
      colIndex,
      value: row.cells[colIndex]?.raw ?? "",
    });
  };

  const commitEdit = async () => {
    if (!editingCell) return;
    const pending = editingCell;
    setEditingCell(null);
    await onEditCell(pending);
  };

  // Shared by the windowed and the grouped rendering paths below.
  const renderRow = (row, rowIndex) => {
    const resolve = resolverFor(row);
    const rowRule = rowRules.find((entry) =>
      ruleMatches(entry.rule, row.cells[entry.index]?.raw, row.cells[entry.index]?.text, resolve)
    );
    const rowTone = rowRule ? toneStyle(rowRule.rule.tone) : null;

    return (
    <tr
      key={row.sourceIndex}
      // Pinned cells inherit the row's background, and a translucent one would
      // let the columns scrolling underneath show through, so striping goes
      // solid as soon as anything is frozen.
      className={`group/row ${
        rowTone
          ? ""
          : freezeCount
            ? "odd:bg-white even:bg-zinc-50 hover:bg-amber-50"
            : "odd:bg-white even:bg-zinc-50/60 hover:bg-amber-50/60"
      }`}
      style={rowTone || undefined}
    >
      <td
        className="border border-zinc-200 bg-inherit px-1 py-1.5 text-center font-bold text-zinc-400"
        style={freezeCount ? { position: "sticky", left: 0, zIndex: 2 } : undefined}
      >
        {onDrill || onDeleteRow || actions.length > 0 ? (
          <>
            <span className="group-hover/row:hidden">{rowIndex + 1}</span>
            <span className="hidden items-center justify-center gap-0.5 group-hover/row:flex">
              {onDrill && (
                <button
                  type="button"
                  onClick={() => onDrill(row)}
                  className="text-red-600"
                  title={drillLabel}
                >
                  <CornerDownRight size={12} />
                </button>
              )}
              {actions.map((action, index) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => onRunAction(row, index)}
                  className="text-amber-600 hover:text-amber-700"
                  title={`${action.label} (${action.method})`}
                >
                  <Zap size={12} />
                </button>
              ))}
              {onDeleteRow && (
                <button
                  type="button"
                  onClick={() => onDeleteRow(row)}
                  className="text-zinc-400 hover:text-red-600"
                  title="ลบแถวนี้"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </span>
          </>
        ) : (
          rowIndex + 1
        )}
      </td>
      {row.cells.map((cell, cellIndex) => {
        const col = columns[cellIndex];
        const { format } = columnStyling[cellIndex];
        // Computed columns carry a real type now, so a formula returning text
        // is no longer right-aligned in a monospace font.
        const numeric = col.type === "number";
        const styling = columnStyling[cellIndex];
        const tone = styling.rules.find(
          (rule) => rule.tone !== "bar" && ruleMatches(rule, cell.raw, cell.text, resolve)
        );
        const barRule = styling.rules.find(
          (rule) => rule.tone === "bar" && ruleMatches(rule, cell.raw, cell.text, resolve)
        );
        const barPercent =
          barRule && styling.barMax
            ? Math.min(100, (Math.abs(toNumber(cell.raw) ?? 0) / styling.barMax) * 100)
            : 0;
        const editing =
          editingCell &&
          editingCell.sourceIndex === row.sourceIndex &&
          editingCell.colId === col.id;
        const editable =
          canEdit && col.kind === "base" && editableColumns.includes(col.column.name);
        const changed = changedKeys.has(`${row.sourceIndex}:${col.id}`);
        const saving =
          editPending &&
          editPending.sourceIndex === row.sourceIndex &&
          editPending.colId === col.id;
        const frozen = cellIndex < freezeCount;

        // A chip carries the colour itself, so the cell behind it stays plain.
        const chip = format.render === "chip";
        const cellTone = chip ? null : toneStyle(tone?.tone) || toneStyle(format.bg);
        const textTone = chip || cellTone ? null : toneStyle(format.fg);
        const align =
          format.align || (numeric ? "right" : "left");

        return (
          <td
            key={col.id}
            title={editable ? `${cell.text} — ดับเบิลคลิกเพื่อแก้ไข` : cell.text}
            onDoubleClick={() => startEdit(row, col, cellIndex)}
            className={`relative border border-zinc-200 px-2 py-1.5 font-semibold ${
              format.wrap ? "whitespace-pre-wrap break-words align-top" : "truncate"
            } ${numeric && !format.align ? "font-mono tabular-nums" : ""} ${
              cellTone || changed ? "" : "bg-inherit"
            } ${changed ? "bg-yellow-100" : ""} ${
              cellTone || textTone || rowTone ? "" : "text-zinc-700"
            } ${editable ? "cursor-cell" : ""} ${saving ? "opacity-50" : ""}`}
            style={{
              textAlign: align,
              ...(cellTone || {}),
              ...(textTone ? { color: textTone.color } : {}),
              ...(barPercent
                ? {
                    backgroundImage: `linear-gradient(to right, rgba(220,38,38,0.18) ${barPercent}%, transparent ${barPercent}%)`,
                  }
                : {}),
              ...(frozen
                ? { position: "sticky", left: freezeOffsets[cellIndex], zIndex: 2 }
                : {}),
            }}
          >
            {editing ? (
              <input
                autoFocus
                value={editingCell.value ?? ""}
                onChange={(e) =>
                  setEditingCell((prev) => ({ ...prev, value: e.target.value }))
                }
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") setEditingCell(null);
                }}
                className="w-full rounded border border-red-500 bg-white px-1 py-0.5 text-[11px] font-semibold outline-none"
              />
            ) : (
              <CellContent
                text={cell.text}
                render={format.render}
                tone={tone?.tone || format.bg}
              />
            )}
          </td>
        );
      })}
      {measured && <td className="border border-zinc-200 bg-inherit" />}
    </tr>
    );
  };

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="overflow-auto border-t border-zinc-100"
      style={{ height }}
    >
      <table
        className="border-collapse text-[11px]"
        style={
          measured
            ? {
                tableLayout: "fixed",
                width: "100%",
                minWidth:
                  columns.reduce((sum, col) => sum + (widthOf(col.id) || 0), 0) +
                  ROW_NUMBER_WIDTH,
              }
            : { tableLayout: "auto", width: "100%" }
        }
      >
        {measured && (
          <colgroup>
            <col style={{ width: ROW_NUMBER_WIDTH }} />
            {columns.map((col) => (
              <col key={col.id} style={{ width: widthOf(col.id) }} />
            ))}
            <col />
          </colgroup>
        )}
        <thead>
          <tr className="bg-zinc-100">
            <th
              className="sticky top-0 border border-zinc-200 bg-zinc-100 px-2 py-2 text-center font-black text-zinc-400"
              style={freezeCount ? { left: 0, zIndex: 20 } : { zIndex: 10 }}
            >
              #
            </th>
            {columns.map((col, index) => {
              const sorted = layout.sort && layout.sort.colId === col.id ? layout.sort.dir : null;
              const summaryKind = layout.summary[col.id];
              const headTone = toneStyle(columnStyling[index].format.headerBg, "head");
              const frozen = index < freezeCount;
              return (
                <th
                  key={col.id}
                  ref={(el) => {
                    headRefs.current[col.id] = el;
                  }}
                  className={`group sticky top-0 border border-zinc-200 px-2 py-1.5 text-left ${
                    headTone ? "" : "bg-zinc-100"
                  }`}
                  style={{
                    zIndex: frozen ? 20 : 10,
                    ...(headTone || {}),
                    ...(frozen ? { left: freezeOffsets[index] } : {}),
                  }}
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.id)}
                      className={`flex min-w-0 flex-1 items-center gap-1 truncate text-left font-black ${
                        headTone ? "" : HEADER_TONE[col.kind] || "text-zinc-700"
                      }`}
                      title={columnTooltip(col)}
                    >
                      <span className="min-w-0 truncate">{col.label}</span>
                      {sorted === "asc" && <ArrowUp size={10} className="shrink-0" />}
                      {sorted === "desc" && <ArrowDown size={10} className="shrink-0" />}
                      {summaryKind && (
                        <span className="shrink-0 rounded bg-zinc-200 px-1 text-[8px] font-black text-zinc-500">
                          {SUMMARY_LABELS[summaryKind]}
                        </span>
                      )}
                    </button>
                    <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      <button type="button" onClick={() => moveColumn(col.id, -1)} className={headerButton} title="เลื่อนซ้าย">
                        <ArrowLeft size={11} />
                      </button>
                      <button type="button" onClick={() => moveColumn(col.id, 1)} className={headerButton} title="เลื่อนขวา">
                        <ArrowRight size={11} />
                      </button>
                      <button type="button" onClick={() => cycleSummary(col.id)} className={headerButton} title="สรุปท้ายตาราง (รวม → เฉลี่ย → ต่ำสุด → สูงสุด → นับ → ปิด)">
                        <Sigma size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          mutateLayout((prev) => ({
                            ...prev,
                            group: prev.group?.colId === col.id ? null : { colId: col.id },
                          }))
                        }
                        className={`${headerButton} ${
                          layout.group?.colId === col.id ? "bg-zinc-300 text-zinc-700" : ""
                        }`}
                        title="จัดกลุ่มตามคอลัมน์นี้"
                      >
                        <Layers size={11} />
                      </button>
                      <button type="button" onClick={() => renameColumn(col)} className={headerButton} title="เปลี่ยนชื่อ">
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          mutateLayout((prev) => ({
                            ...prev,
                            hidden: [...new Set([...prev.hidden, col.id])],
                          }))
                        }
                        className={headerButton}
                        title="ซ่อนคอลัมน์"
                      >
                        <EyeOff size={11} />
                      </button>
                      {col.kind === "computed" && (
                        <button
                          type="button"
                          onClick={() =>
                            mutateLayout((prev) => ({
                              ...prev,
                              computed: prev.computed.filter((item) => `#${item.key}` !== col.id),
                              order: prev.order.filter((id) => id !== col.id),
                              hidden: prev.hidden.filter((id) => id !== col.id),
                            }))
                          }
                          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-red-600"
                          title="ลบคอลัมน์สูตร"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </span>
                  </div>
                  <span
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setResizing({
                        colId: col.id,
                        startX: event.clientX,
                        startWidth: widthOf(col.id) || MIN_COLUMN_WIDTH,
                      });
                    }}
                    onDoubleClick={() => resetColumnWidth(col.id)}
                    className={`absolute right-0 top-0 flex h-full w-2 touch-none cursor-col-resize items-center justify-center ${
                      resizing?.colId === col.id ? "bg-red-500/30" : "hover:bg-red-500/20"
                    }`}
                    title="ลากเพื่อปรับความกว้าง · ดับเบิลคลิกเพื่อรีเซ็ต"
                  >
                    <span className="h-1/2 w-px bg-zinc-300" />
                  </span>
                </th>
              );
            })}
            {measured && <th className="sticky top-0 z-10 border border-zinc-200 bg-zinc-100" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (measured ? 2 : 1)}
                className="border border-zinc-200 px-3 py-8 text-center font-semibold text-zinc-400"
              >
                ไม่มีข้อมูล
              </td>
            </tr>
          ) : (
            <>
            {padTop > 0 && (
              <tr aria-hidden="true">
                <td colSpan={columns.length + (measured ? 2 : 1)} style={{ height: padTop, padding: 0 }} />
              </tr>
            )}
            {grouped
              ? groups.map((group) => {
                  const collapsed = collapsedGroups.has(group.key);
                  return (
                    <Fragment key={group.key}>
                      <tr className="bg-zinc-100/80">
                        <td
                          colSpan={columns.length + (measured ? 2 : 1)}
                          className="border border-zinc-200 px-2 py-1"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsedGroups((prev) => {
                                const next = new Set(prev);
                                if (next.has(group.key)) next.delete(group.key);
                                else next.add(group.key);
                                return next;
                              })
                            }
                            className="flex w-full items-center gap-1.5 text-left text-[11px] font-black text-zinc-700"
                          >
                            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                            {group.key}
                            <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[9px] font-black text-zinc-500">
                              {group.rows.length.toLocaleString("th-TH")} แถว
                            </span>
                          </button>
                        </td>
                      </tr>
                      {!collapsed && group.rows.map((row, i) => renderRow(row, i))}
                    </Fragment>
                  );
                })
              : visibleRows.map((row, i) => renderRow(row, firstVisible + i))}
            {padBottom > 0 && (
              <tr aria-hidden="true">
                <td colSpan={columns.length + (measured ? 2 : 1)} style={{ height: padBottom, padding: 0 }} />
              </tr>
            )}
            </>
          )}
        </tbody>
        {summaryValues && (
          <tfoot>
            <tr className="bg-zinc-100 font-black">
              <td
                className="border border-zinc-200 bg-inherit px-2 py-1.5 text-center text-zinc-400"
                style={freezeCount ? { position: "sticky", left: 0, zIndex: 2 } : undefined}
              >
                Σ
              </td>
              {summaryValues.map((entry, index) => (
                <td
                  key={columns[index].id}
                  className={`border border-zinc-200 bg-inherit px-2 py-1.5 text-zinc-700 ${
                    columns[index].type === "number" ? "text-right font-mono tabular-nums" : ""
                  }`}
                  style={
                    index < freezeCount
                      ? { position: "sticky", left: freezeOffsets[index], zIndex: 2 }
                      : undefined
                  }
                >
                  {entry ? (
                    <span title={`${SUMMARY_LABELS[entry.kind]} ของ ${columns[index].label}`}>
                      {entry.value === null ? "—" : formatCell(entry.value, "number")}
                    </span>
                  ) : null}
                </td>
              ))}
              {measured && <td className="border border-zinc-200" />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
