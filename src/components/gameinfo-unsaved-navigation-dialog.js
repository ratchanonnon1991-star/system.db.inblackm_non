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
    const onRequest = (event) => setRequest(event.detail || null);
    window.addEventListener(GAMEINFO_NAVIGATION_REQUEST, onRequest);
    return () => window.removeEventListener(GAMEINFO_NAVIGATION_REQUEST, onRequest);
  }, []);
  return <GameinfoConfirmDialog open={Boolean(request)} title="มีข้อมูลที่ยังไม่บันทึก" message="หากออกจากหน้านี้ การแก้ไขล่าสุดจะหายไป" confirmLabel="ออกจากหน้านี้" destructive onClose={() => setRequest(null)} onConfirm={() => {
    const target = request;
    setRequest(null);
    const href = target.action === "back" ? consumeGameinfoBackHref(target.fallbackHref) : target.href;
    const url = new URL(href, window.location.origin);
    allowGameinfoNavigation();
    if (url.origin === window.location.origin) router.push(`${url.pathname}${url.search}${url.hash}`);
    else window.location.assign(url.href);
  }} />;
}
