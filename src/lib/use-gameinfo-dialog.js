"use client";

import { useEffect, useId, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

let bodyScrollLockCount = 0;
let bodyOverflowBeforeLock = "";
const openDialogs = [];

function lockBodyScroll() {
  if (bodyScrollLockCount === 0) bodyOverflowBeforeLock = document.body.style.overflow;
  bodyScrollLockCount += 1;
  document.body.style.overflow = "hidden";
}

function unlockBodyScroll() {
  bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
  if (bodyScrollLockCount > 0) return;
  document.body.style.overflow = bodyOverflowBeforeLock;
  bodyOverflowBeforeLock = "";
}

export function useGameinfoDialog({ open = true, onRequestClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onRequestClose);
  const titleId = useId();

  useEffect(() => {
    closeRef.current = onRequestClose;
  }, [onRequestClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const dialogToken = Symbol();
    openDialogs.push(dialogToken);
    lockBodyScroll();

    const focusTimer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      const target = dialog?.querySelector(FOCUSABLE) || dialog;
      target?.focus({ preventScroll: true });
    }, 0);

    function onKeyDown(event) {
      if (openDialogs[openDialogs.length - 1] !== dialogToken) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      const focusable = [...(dialog?.querySelectorAll(FOCUSABLE) || [])];
      if (!focusable.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      const wasTopDialog = openDialogs[openDialogs.length - 1] === dialogToken;
      const dialogIndex = openDialogs.lastIndexOf(dialogToken);
      if (dialogIndex >= 0) openDialogs.splice(dialogIndex, 1);
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      unlockBodyScroll();
      if (wasTopDialog && previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open]);

  function onBackdropMouseDown(event) {
    if (event.target === event.currentTarget) closeRef.current?.();
  }

  return { dialogRef, titleId, onBackdropMouseDown };
}
