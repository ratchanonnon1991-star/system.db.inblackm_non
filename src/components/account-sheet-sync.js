"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { SYNC_STATUS_LABELS } from "@/lib/account-sheet-drive";
import { StockDialog } from "@/components/stock-ui";

const when = (iso) => (iso ? new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—");
const STATUS_CLASS = { running: "bg-amber-100 text-amber-900", done: "bg-emerald-100 text-emerald-900", failed: "bg-red-100 text-red-800" };

/** The ซิงค์จาก Drive button of Stock › ข้อมูลบัญชี (Stock admins): pulls the month folders and imports them. */
export default function AccountSheetSync() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-10 items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-extrabold text-zinc-800 hover:bg-zinc-50">
        <RefreshCw size={15} aria-hidden="true" /> ซิงค์จาก Drive
      </button>
      {open ? <SyncDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SyncDialog({ onClose }) {
  const router = useRouter();
  const [info, setInfo] = useState(null);
  const [run, setRun] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState("");
  const [copied, setCopied] = useState(false);
  const logBox = useRef(null);

  const loadInfo = () => apiJson("/api/stock/sheet-sync", { fallbackError: "อ่านสถานะซิงค์ไม่สำเร็จ" })
    .then((data) => {
      setInfo(data);
      const running = data.runs.find((item) => item.status === "running");
      if (running) setRun(running);
    })
    .catch((err) => setError(err.message));
  useEffect(() => { loadInfo(); }, []);

  // Follow the run until it ends; an import that wrote something refreshes the page under the dialog.
  useEffect(() => {
    if (!run?.id || run.status !== "running") return undefined;
    const timer = setInterval(() => {
      apiJson(`/api/stock/sheet-sync?run=${run.id}`, { fallbackError: "อ่านสถานะซิงค์ไม่สำเร็จ" })
        .then((data) => {
          setRun(data.run);
          if (data.run.status !== "running") {
            loadInfo();
            if (data.run.mode === "apply") router.refresh();
          }
        })
        .catch((err) => setError(err.message));
    }, 2000);
    return () => clearInterval(timer);
  }, [run?.id, run?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight; }, [run?.log]);

  const start = async (mode) => {
    setError("");
    setStarting(mode);
    try {
      const data = await apiJson("/api/stock/sheet-sync", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }), fallbackError: "เริ่มซิงค์ไม่สำเร็จ",
      });
      setRun({ ...data.run, log: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting("");
    }
  };

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(info.serviceAccount);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const busy = run?.status === "running" || Boolean(starting);
  const ready = Boolean(info?.serviceAccount);
  return (
    <StockDialog title="ซิงค์ชีตบัญชีจาก Drive" subtitle="โหลดทุกเดือนในโฟลเดอร์ แล้วนำเข้า ข้อมูลบัญชี, กระเป๋าเงิน, ค่าใช้จ่าย, คลังตามชีต, คลัง และใบสั่งซื้อ" wide onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="h-10 rounded-full border border-zinc-300 px-4 text-sm font-extrabold text-zinc-700 hover:bg-white">ปิด</button>
          <button type="button" disabled={!ready || busy} onClick={() => start("preview")} className="flex h-10 items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 text-sm font-extrabold text-zinc-800 disabled:opacity-40">
            {starting === "preview" ? <Loader2 size={15} className="animate-spin" /> : null} ลองดูก่อน
          </button>
          <button type="button" disabled={!ready || busy} onClick={() => start("apply")} className="flex h-10 items-center gap-1.5 rounded-full bg-[#D90005] px-4 text-sm font-extrabold text-white hover:bg-[#B00004] disabled:opacity-40">
            {starting === "apply" ? <Loader2 size={15} className="animate-spin" /> : null} ซิงค์และนำเข้า
          </button>
        </>
      )}>
      {!info && !error ? <p className="flex items-center gap-2 text-sm text-zinc-600"><Loader2 size={15} className="animate-spin" /> กำลังโหลด…</p> : null}
      {info ? (
        <div className="flex flex-col gap-2 rounded-xl bg-zinc-50 px-4 py-3 text-[13px] leading-6 text-zinc-700">
          <p>
            โฟลเดอร์:{" "}
            <a href={`https://drive.google.com/drive/folders/${info.folderId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-extrabold text-[#B00004] underline">
              ข้อมูลบัญชี 2026 <ExternalLink size={12} aria-hidden="true" />
            </a>{" "}
            · อ่านทุกโฟลเดอร์ชื่อ &quot;ข้อมูลบัญชี M-YYYY&quot; ข้างใน
          </p>
          {ready ? (
            <p className="flex flex-wrap items-center gap-2">
              แชร์โฟลเดอร์ให้ (ผู้มีสิทธิ์อ่านพอ): <code className="rounded bg-white px-1.5 py-0.5 text-xs">{info.serviceAccount}</code>
              <button type="button" onClick={copyEmail} className="inline-flex items-center gap-1 text-xs font-extrabold text-zinc-700 underline"><Copy size={12} /> {copied ? "คัดลอกแล้ว" : "คัดลอก"}</button>
            </p>
          ) : (
            <p className="font-bold text-red-800">เซิร์ฟเวอร์ยังไม่ได้ตั้ง ITUNE_SHEETS_CREDENTIALS (ไฟล์ key ของ service account) จึงอ่าน Drive ไม่ได้</p>
          )}
          <p>นำเข้าซ้ำได้: แต่ละส่วนแทนเฉพาะข้อมูลที่มาจากชีต ส่วนที่คนกรอกในเว็บยังอยู่ · ครั้งแรกจะลบยอดคลังเก่าจากชีต 2.1 STOCK_ ก่อน ไม่งั้นนับซ้ำ</p>
        </div>
      ) : null}
      {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p> : null}
      {run ? (
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${STATUS_CLASS[run.status] || ""}`}>{SYNC_STATUS_LABELS[run.status] || run.status}</span>
            <span className="font-extrabold">{run.mode === "apply" ? "ซิงค์และนำเข้า" : "ลองดู"}</span>
            <span className="text-zinc-500">เริ่ม {when(run.startedAt)}{run.finishedAt ? ` · จบ ${when(run.finishedAt)}` : ""}</span>
            {run.status === "running" ? <Loader2 size={14} className="animate-spin text-zinc-500" /> : null}
          </p>
          <pre ref={logBox} className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-900 px-4 py-3 text-xs leading-5 text-zinc-100">{run.log || "รอผลจากเซิร์ฟเวอร์…"}</pre>
        </div>
      ) : null}
      {info?.runs?.length ? (
        <div className="text-[13px] text-zinc-600">
          <p className="font-extrabold text-zinc-700">ครั้งล่าสุด</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {info.runs.map((item) => (
              <li key={item.id}>
                {when(item.startedAt)} · {item.mode === "apply" ? "ซิงค์และนำเข้า" : "ลองดู"} · {SYNC_STATUS_LABELS[item.status] || item.status} · {item.actorName || "—"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </StockDialog>
  );
}
