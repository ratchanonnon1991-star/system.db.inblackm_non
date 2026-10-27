"use client";

import { useEffect, useRef } from "react";

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

// Same page as `href` (path and data mode; the view lives in a cookie).
function isSameGameinfoPage(url, href) {
  try {
    const a = new URL(url, window.location.origin);
    const b = new URL(href, window.location.origin);
    return a.origin === b.origin && a.pathname === b.pathname && (a.searchParams.get("mode") || "uid") === (b.searchParams.get("mode") || "uid");
  } catch {
    return false;
  }
}

// The back buttons go to a fixed place — a game page's goes to the game
// list — rather than retracing every view switch, mode toggle and edit
// visited on the way. When the page just before this one in the tab's
// history is that place, it is a real step back, so the browser's own back
// button does not then return to the game, and the list keeps its filters
// and scroll; otherwise the place is opened.
export function performGameinfoBack(href) {
  allowGameinfoNavigation();
  const nav = window.navigation;
  const previous = nav?.currentEntry ? nav.entries()[nav.currentEntry.index - 1] : null;
  if (previous && isSameGameinfoPage(previous.url, href)) {
    window.history.back();
    return;
  }
  window.location.assign(href);
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
