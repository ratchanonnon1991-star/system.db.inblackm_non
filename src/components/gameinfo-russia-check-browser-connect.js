"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Download, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { requestRussiaCheckExtension } from "@/lib/gameinfo-russia-check-extension";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const ACTIVE = new Set(["confirming", "waiting", "submitting"]);
const LABELS = { confirming: "ยืนยันการอนุญาตใน popup", waiting: "รอ Login และเลือกตัวละครบนเว็บเกม", submitting: "กำลังตรวจสอบและบันทึก Login" };

export function RussiaCheckExtensionDetection() {
  const [state, setState] = useState("checking");
  const [version, setVersion] = useState("");
  async function check() {
    setState("checking");
    try { const result = await requestRussiaCheckExtension("ping", {}, 2000); setVersion(result.version); setState("ready"); }
    catch { setState("missing"); }
  }
  useEffect(() => {
    let mounted = true;
    requestRussiaCheckExtension("ping", {}, 2000).then((result) => {
      if (mounted) { setVersion(result.version); setState("ready"); }
    }, () => { if (mounted) setState("missing"); });
    return () => { mounted = false; };
  }, []);
  return <div className="flex flex-wrap items-center gap-3">
    <Badge variant={state === "ready" ? "success" : "secondary"}>{state === "checking" ? "กำลังตรวจส่วนขยาย…" : state === "ready" ? `พบส่วนขยาย v${version}` : "ยังไม่พบส่วนขยาย"}</Badge>
    <Button type="button" variant="outline" size="sm" onClick={check} disabled={state === "checking"}><RefreshCw data-icon="inline-start" />ตรวจอีกครั้ง</Button>
  </div>;
}

export default function GameinfoRussiaCheckBrowserConnect({ sourceId, provider = "infold", lang, disabled, autoStart = false, onBusyChange, onConnected, onCancelled }) {
  const [state, setState] = useState({ status: "idle" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const started = useRef(false);
  const connecting = useRef(false);
  const active = busy;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function connect() {
    if (connecting.current) return;
    connecting.current = true;
    setError("");
    setState({ status: "confirming" });
    setBusy(true);
    onBusyChange(true);
    try {
      const check = await requestRussiaCheckExtension("ping", {}, 2000);
      if (!check?.version) throw Error("ส่วนขยายไม่พร้อม กรุณาติดตั้งใหม่");
      if (provider !== "infold" && !check.providers?.includes(provider)) throw Error("กรุณาดาวน์โหลดส่วนขยายเวอร์ชันใหม่ แล้ว Reload ส่วนขยายและหน้าเว็บเพื่อรองรับเกมนี้");
      let result = await requestRussiaCheckExtension("begin", { sourceId, provider });
      if (alive.current) setState(result);
      for (let attempt = 0; attempt < 650 && ACTIVE.has(result.status) && alive.current; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (!alive.current) break;
        result = await requestRussiaCheckExtension("status");
        if (alive.current) setState(result);
      }
      if (!alive.current) return;
      if (result.status === "completed") await onConnected(result);
      else if (result.status === "cancelled") onCancelled?.();
      else if (result.status !== "cancelled") throw Error(result.message || "การเชื่อมบัญชีหยุดลง กรุณาลองใหม่");
    } catch (cause) { if (alive.current) { setError(cause.message); setState({ status: "failed" }); } }
    finally { connecting.current = false; if (alive.current) setBusy(false); onBusyChange(false); }
  }
  const startFromRefresh = useEffectEvent(connect);
  useEffect(() => { if (autoStart && !started.current) { started.current = true; void startFromRefresh(); } }, [autoStart]);
  async function cancel() {
    try { setState(await requestRussiaCheckExtension("cancel")); }
    catch (cause) { setError(cause.message); }
  }
  return <div className="flex flex-col gap-3">
    <RussiaCheckExtensionDetection />
    <p className="text-sm text-muted-foreground">เปิด popup ของส่วนขยายเพื่ออนุญาต จากนั้น Login บนเว็บ {provider === "gryphline" ? "Gryphline" : "Infold"} จริง ไม่ต้องคัดลอกข้อมูลและไม่ต้องกรอกรหัสผ่านในเว็บเรา</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={connect} disabled={disabled || active}>{active ? <Spinner data-icon="inline-start" /> : <KeyRound data-icon="inline-start" />}{active ? "กำลังเชื่อมบัญชี…" : "เชื่อมผ่าน Browser"}</Button>
      {active ? <Button type="button" variant="outline" onClick={cancel} disabled={state.status === "submitting"}>ยกเลิกการเชื่อม</Button> : <Link href={`/gameinfo/${lang}/russia-check/extension`} className={buttonVariants({ variant: "outline" })}><Download data-icon="inline-start" />โหลดส่วนขยาย</Link>}
    </div>
    {active || state.status === "cancelled" ? <p role="status" className="text-sm text-muted-foreground">{state.message || LABELS[state.status]} · เปิดหน้า GameInfo นี้ค้างไว้</p> : null}
    {state.status === "completed" ? <Alert><ShieldCheck /><AlertTitle>เชื่อมบัญชีแล้ว</AlertTitle><AlertDescription>ตรวจพบ {state.packCount} แพ็ก กดรีข้อมูลเพื่อบันทึกแพ็กและ Log</AlertDescription></Alert> : null}
    {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>เชื่อมบัญชีไม่สำเร็จ</AlertTitle><AlertDescription role="alert">{error}</AlertDescription></Alert> : null}
  </div>;
}
