"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { stockInputClass } from "@/components/stock-ui";

const SHOW_AT_MOST = 80;

/**
 * One box to pick a game: it shows the chosen game, focus it to see the list, type to narrow
 * the same list, pick with the mouse or ↑ ↓ Enter. Only a game from the list can be chosen;
 * leaving the box without picking puts the chosen game's name back.
 * `games`: [{ key, name, hasStock }]; ★ marks a game that already has a stock account.
 */
export default function StockGamePicker({ id, games, value, onPick, placeholder = "พิมพ์ชื่อเกม" }) {
  const listId = useId();
  const box = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(null); // null: not typing, so the box shows the chosen game
  const [active, setActive] = useState(0);
  const chosen = games.find((game) => game.key === value);
  const needle = (query || "").trim().toLowerCase();
  const matches = needle ? games.filter((game) => game.name.toLowerCase().includes(needle)) : games;
  const shown = matches.slice(0, SHOW_AT_MOST);

  const close = () => { setOpen(false); setQuery(null); };
  const pick = (game) => { onPick(game.key); close(); };
  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (shown.length ? (current + (event.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length : 0));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (shown[active]) pick(shown[active]);
    } else if (event.key === "Escape") {
      close();
    }
  };

  return (
    <div ref={box} className="relative" onBlur={(event) => { if (!box.current?.contains(event.relatedTarget)) close(); }}>
      <input id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        value={query ?? (chosen ? `${chosen.hasStock ? "★ " : ""}${chosen.name}` : "")} placeholder={placeholder}
        onFocus={(event) => { setOpen(true); setActive(0); event.target.select(); }}
        onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
        onKeyDown={onKeyDown}
        className={`${stockInputClass} pr-9`} />
      <button type="button" tabIndex={-1} aria-label="แสดงเกมทั้งหมด"
        onClick={() => { if (open) close(); else box.current?.querySelector("input")?.focus(); }}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500">
        <ChevronDown size={16} />
      </button>
      {open ? (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-zinc-200 bg-white py-1 text-sm shadow-lg">
          {shown.map((game, index) => (
            <li key={game.key} role="option" aria-selected={index === active} tabIndex={-1}
              onMouseDown={(event) => { event.preventDefault(); pick(game); }} onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-3 py-1.5 ${index === active ? "bg-red-50 text-[#B00004]" : ""} ${game.key === value ? "font-extrabold" : ""}`}>
              {game.hasStock ? "★ " : ""}{game.name}
            </li>
          ))}
          {!shown.length ? <li className="px-3 py-2 text-xs text-zinc-500">ไม่พบเกมที่มีคำว่า &quot;{query}&quot;</li> : null}
          {matches.length > shown.length ? <li className="px-3 py-1.5 text-xs text-zinc-500">อีก {matches.length - shown.length} เกม · พิมพ์ต่อเพื่อค้นหา</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
