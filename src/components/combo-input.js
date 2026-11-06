"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { stockInputClass } from "@/components/stock-ui";
import { filterComboGroups } from "@/lib/combo-filter";

/**
 * A text box that is also a list: focus it to see every choice, type to narrow the list
 * letter by letter, pick with the mouse or ↑ ↓ Enter. Anything typed is kept as it is, so
 * a choice missing from the list can still be entered.
 * `groups`: [{ label, options: [text] }]; a group without a label is shown without a heading.
 */
export default function ComboInput({ id, value, onChange, groups, placeholder = "", upper = false, required = false }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(null); // null: not typed since focus, so show everything
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const shown = filterComboGroups(groups, query);
  const flat = shown.flatMap((group) => group.options);

  const pick = (text) => {
    onChange(text);
    setQuery(null);
    setOpen(false);
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (flat.length ? (current + (event.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length : 0));
    } else if (event.key === "Enter" && open && flat[active]) {
      event.preventDefault();
      pick(flat[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  let index = -1;
  return (
    <div ref={box} className="relative" onBlur={(event) => { if (!box.current?.contains(event.relatedTarget)) setOpen(false); }}>
      <input id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        value={value} placeholder={placeholder} required={required}
        onFocus={() => { setOpen(true); setQuery(null); setActive(0); }}
        onChange={(event) => {
          const text = upper ? event.target.value.toUpperCase() : event.target.value;
          onChange(text);
          setQuery(text);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={`${stockInputClass} pr-9`} />
      <button type="button" tabIndex={-1} aria-label="แสดงตัวเลือกทั้งหมด" onClick={() => { setOpen((current) => !current); setQuery(null); box.current?.querySelector("input")?.focus(); }}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500">
        <ChevronDown size={16} />
      </button>
      {open ? (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-zinc-200 bg-white py-1 text-sm shadow-lg">
          {flat.length ? shown.map((group, groupIndex) => (
            <li key={groupIndex} role="presentation">
              {group.label ? <p className="px-3 pb-0.5 pt-2 text-[11px] font-extrabold text-zinc-500">{group.label}</p> : null}
              <ul role="group">
                {group.options.map((option) => {
                  index += 1;
                  const mine = index;
                  return (
                    <li key={option} role="option" aria-selected={mine === active} tabIndex={-1}
                      onMouseDown={(event) => { event.preventDefault(); pick(option); }} onMouseEnter={() => setActive(mine)}
                      className={`cursor-pointer px-3 py-1.5 ${mine === active ? "bg-red-50 text-[#B00004]" : ""} ${option === value ? "font-extrabold" : ""}`}>
                      {option}
                    </li>
                  );
                })}
              </ul>
            </li>
          )) : <li className="px-3 py-2 text-xs text-zinc-500">ไม่มีในรายการ ใช้ &quot;{value}&quot; ตามที่พิมพ์</li>}
        </ul>
      ) : null}
    </div>
  );
}
