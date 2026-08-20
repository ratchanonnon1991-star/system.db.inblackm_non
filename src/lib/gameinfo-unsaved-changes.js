"use client";

import { useEffect, useRef } from "react";

const MESSAGE = "ยังไม่ได้บันทึกการแก้ไข ต้องการออกจากหน้านี้หรือไม่?";
const dirtySources = new Set();
let listening = false;
let restoringHistory = false;

export function confirmGameinfoNavigation() {
  return dirtySources.size === 0 || window.confirm(MESSAGE);
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("beforeunload", (event) => {
    if (dirtySources.size === 0) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("popstate", () => {
    if (restoringHistory) {
      restoringHistory = false;
      return;
    }
    if (confirmGameinfoNavigation()) return;
    restoringHistory = true;
    window.history.forward();
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
