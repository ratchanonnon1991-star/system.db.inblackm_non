"use client";

import { useEffect, useState } from "react";
import { Pin, PinOff } from "lucide-react";

// Account-sheet tabs a viewer added to the Stock menu. Kept in this browser only
// (no DB write): [{ kind: "1.2 บัญชีแลกเงิน", tab: "Binance MOM" }].
const KEY = "stock-nav-pins";
const EVENT = "stock-nav-pins";

const same = (a, b) => a.kind === b.kind && a.tab.trim().toLowerCase() === b.tab.trim().toLowerCase();

export function readPins() {
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((pin) => typeof pin?.kind === "string" && typeof pin?.tab === "string") : [];
  } catch {
    return [];
  }
}

function writePins(list) {
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked: menu stays as is */ }
  window.dispatchEvent(new Event(EVENT));
}

export function removePin(pin) {
  writePins(readPins().filter((item) => !same(item, pin)));
}

/** The pins, kept current when any page adds or removes one. */
export function usePins() {
  const [pins, setPins] = useState([]);
  useEffect(() => {
    const load = () => setPins(readPins());
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    return () => { window.removeEventListener(EVENT, load); window.removeEventListener("storage", load); };
  }, []);
  return pins;
}

/** /stock/sheets opens the newest month of that tab. */
export function pinHref(pin) {
  return `/stock/sheets?${new URLSearchParams({ kind: pin.kind, name: pin.tab })}`;
}

export function PinToMenuButton({ kind, tab }) {
  const pins = usePins();
  const pinned = pins.some((pin) => same(pin, { kind, tab }));
  const toggle = () => (pinned ? removePin({ kind, tab }) : writePins([...readPins(), { kind, tab }]));
  return (
    <button type="button" onClick={toggle}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold ring-1 ${pinned ? "bg-red-50 text-[#B00004] ring-red-200 hover:bg-red-100" : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50"}`}>
      {pinned ? <><PinOff size={12} aria-hidden="true" /> เอาออกจากเมนู</> : <><Pin size={12} aria-hidden="true" /> เพิ่มในเมนู</>}
    </button>
  );
}
