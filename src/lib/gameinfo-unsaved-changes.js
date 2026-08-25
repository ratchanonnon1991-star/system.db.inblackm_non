"use client";

import { useEffect, useRef } from "react";
import {
  GAMEINFO_HISTORY_KEY,
  getGameinfoReturnHref,
  normalizeGameinfoHistoryStack,
  updateGameinfoHistoryStack,
} from "@/lib/gameinfo-navigation-history";

export const GAMEINFO_NAVIGATION_REQUEST = "gameinfo:navigation-request";
const dirtySources = new Set();
let listening = false;
let allowingNavigation = false;
let navigationAllowanceTimer = null;

export function allowGameinfoNavigation() {
  allowingNavigation = true;
  if (navigationAllowanceTimer) window.clearTimeout(navigationAllowanceTimer);
  navigationAllowanceTimer = window.setTimeout(() => {
    allowingNavigation = false;
    navigationAllowanceTimer = null;
  }, 1000);
}

export function isGameinfoNavigationLeaving(currentHref, destinationHref) {
  try {
    const fallbackOrigin = "http://gameinfo.local";
    const current = new URL(currentHref, fallbackOrigin);
    const destination = new URL(destinationHref, current.href);
    return current.origin !== destination.origin ||
      current.pathname !== destination.pathname ||
      current.search !== destination.search;
  } catch {
    return true;
  }
}

function dispatchNavigationRequest(detail) {
  window.dispatchEvent(new CustomEvent(GAMEINFO_NAVIGATION_REQUEST, { detail }));
}

export function requestGameinfoDiscard({
  title = "มีข้อมูลที่ยังไม่บันทึก",
  message = "หากดำเนินการต่อ การแก้ไขล่าสุดจะหายไป",
  confirmLabel = "ละทิ้งการแก้ไข",
  onConfirm,
}) {
  dispatchNavigationRequest({ kind: "discard", title, message, confirmLabel, onConfirm });
}

export function requestGameinfoReload() {
  if (dirtySources.size === 0) {
    allowGameinfoNavigation();
    window.location.reload();
    return;
  }
  dispatchNavigationRequest({ kind: "reload" });
}

export function hasGameinfoUnsavedChanges() {
  return dirtySources.size > 0;
}

function readGameinfoHistory() {
  try {
    return normalizeGameinfoHistoryStack(JSON.parse(window.sessionStorage.getItem(GAMEINFO_HISTORY_KEY) || "[]"));
  } catch {
    return [];
  }
}

function writeGameinfoHistory(stack) {
  try {
    window.sessionStorage.setItem(GAMEINFO_HISTORY_KEY, JSON.stringify(stack));
  } catch {
    // Navigation still uses the supplied fallback when browser storage is unavailable.
  }
}

export function rememberGameinfoLocation(href) {
  writeGameinfoHistory(updateGameinfoHistoryStack(readGameinfoHistory(), href));
}

export function consumeGameinfoBackHref(fallbackHref) {
  const stack = readGameinfoHistory();
  const returnHref = getGameinfoReturnHref(stack, fallbackHref);
  if (stack.length > 1) writeGameinfoHistory(stack.slice(0, -1));
  return returnHref;
}

export function performGameinfoBack(fallbackHref) {
  const returnHref = consumeGameinfoBackHref(fallbackHref);
  allowGameinfoNavigation();
  window.location.assign(returnHref);
}

export function requestGameinfoBack(fallbackHref) {
  if (dirtySources.size === 0) {
    performGameinfoBack(fallbackHref);
    return;
  }
  dispatchNavigationRequest({ kind: "back", fallbackHref });
}

export function requestGameinfoNavigation(href) {
  if (dirtySources.size === 0) {
    allowGameinfoNavigation();
    window.location.assign(href);
    return;
  }
  dispatchNavigationRequest({ kind: "navigate", href });
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
    if (dirtySources.size === 0 || !event.cancelable || allowingNavigation) return;
    const href = event.destination?.url;
    if (!href) return;
    if (!isGameinfoNavigationLeaving(window.location.href, href)) return;
    event.preventDefault();
    dispatchNavigationRequest({ kind: "navigate", href });
  });
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download") || link.getAttribute("href")?.startsWith("#")) return;
    if (dirtySources.size === 0) return;
    if (!isGameinfoNavigationLeaving(window.location.href, link.href)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    dispatchNavigationRequest({ kind: "navigate", href: link.href });
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
