"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GameinfoConfirmDialog from "./gameinfo-confirm-dialog";
import {
  GAMEINFO_NAVIGATION_REQUEST,
  allowGameinfoNavigation,
  consumeGameinfoBackHref,
} from "@/lib/gameinfo-unsaved-changes";

export default function GameinfoUnsavedNavigationDialog() {
  const router = useRouter();
  const [request, setRequest] = useState(null);
  useEffect(() => {
    const onRequest = (event) => setRequest((current) => current || event.detail || null);
    window.addEventListener(GAMEINFO_NAVIGATION_REQUEST, onRequest);
    return () => window.removeEventListener(GAMEINFO_NAVIGATION_REQUEST, onRequest);
  }, []);
  return <GameinfoConfirmDialog open={Boolean(request)} title={request?.title || "มีข้อมูลที่ยังไม่บันทึก"} message={request?.message || "หากออกจากหน้านี้ การแก้ไขล่าสุดจะหายไป"} confirmLabel={request?.confirmLabel || (request?.kind === "discard" ? "ละทิ้งการแก้ไข" : "ออกจากหน้านี้")} destructive onClose={() => setRequest(null)} onConfirm={() => {
    const target = request;
    setRequest(null);
    if (!target) return;
    if (target.kind === "discard") {
      target.onConfirm?.();
      return;
    }
    if (target.kind === "reload") {
      allowGameinfoNavigation();
      window.location.reload();
      return;
    }
    const href = target.kind === "back" ? consumeGameinfoBackHref(target.fallbackHref) : target.href;
    const url = new URL(href, window.location.origin);
    allowGameinfoNavigation();
    if (url.origin === window.location.origin) router.push(`${url.pathname}${url.search}${url.hash}`);
    else window.location.assign(url.href);
  }} />;
}
