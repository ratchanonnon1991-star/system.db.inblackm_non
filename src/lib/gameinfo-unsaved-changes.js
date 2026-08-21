"use client";

import { useEffect, useRef } from "react";

const MESSAGE = "ยังไม่ได้บันทึกการแก้ไข ต้องการออกจากหน้านี้หรือไม่?";
const dirtySources = new Set();
let listening = false;
let allowingNavigation = false;

export function confirmGameinfoNavigation() {
  if (dirtySources.size === 0) return true;
  if (!window.confirm(MESSAGE)) return false;
  allowingNavigation = true;
  window.setTimeout(() => { allowingNavigation = false; }, 0);
  return true;
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("beforeunload", (event) => {
    if (dirtySources.size === 0 || allowingNavigation) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.navigation?.addEventListener("navigate", (event) => {
    if (dirtySources.size === 0 || !event.cancelable) return;
    if (allowingNavigation) {
      allowingNavigation = false;
      return;
    }
    if (!confirmGameinfoNavigation()) event.preventDefault();
  });
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download") || link.getAttribute("href")?.startsWith("#")) return;
    if (confirmGameinfoNavigation()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

export function useGameinfoUnsavedChanges(dirty) {
  const source = useRef(Symbol());
  useEffect(() => {
    const id = source.current;
    listen();
    if (dirty) dirtySources.add(id);
    else dirtySources.delete(id);
    return () => dirtySources.delete(id);
  }, [dirty]);
}
