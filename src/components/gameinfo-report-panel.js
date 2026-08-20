"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export default function GameinfoReportPanel({ gameId, initialReports, canManage }) {
  const [reports, setReports] = useState(initialReports);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function request(body, method) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/gameinfo/gamelist/${gameId}/reports`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึก report ไม่สำเร็จ");
      return data.report;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    const report = await request({ message }, "POST");
    if (!report) return;
    setReports((current) => [report, ...current]);
    setMessage("");
  }

  async function changeStatus(reportId, status) {
    const updated = await request({ reportId, status }, "PUT");
    if (!updated) return;
    setReports((current) => current.map((report) => report.id === updated.id ? updated : report));
  }

  const openCount = reports.filter((report) => report.status === "open").length;

  return (
    <section className="mt-8 rounded-2xl border border-linear-hairline bg-linear-surface-1 p-4 sm:p-5" aria-labelledby="game-reports-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="game-reports-title" className="flex items-center gap-2 text-base font-semibold text-linear-ink">
            <AlertTriangle size={17} className={openCount ? "text-linear-primary" : "text-linear-ink-tertiary"} />
            รายงานปัญหา
          </h2>
          <p className="mt-1 text-xs text-linear-ink-tertiary">ต้องตรวจสอบ {openCount} รายการ</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">รายละเอียดปัญหา</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
            maxLength={1000}
            rows={2}
            placeholder="แจ้งข้อมูลที่ผิดหรือปัญหาที่พบ..."
            className="min-h-20 w-full resize-y rounded-lg border border-linear-hairline-strong bg-linear-canvas px-3 py-2 text-sm text-linear-ink outline-none placeholder:text-linear-ink-tertiary focus:border-linear-primary focus:ring-2 focus:ring-linear-primary/20"
          />
        </label>
        <button type="submit" disabled={busy || !message.trim()} className="h-10 rounded-lg bg-linear-ink px-4 text-sm font-medium text-linear-canvas disabled:opacity-40">
          ส่งรายงาน
        </button>
      </form>
      {error ? <p role="alert" className="mt-2 text-xs text-linear-primary">{error}</p> : null}

      {reports.length ? (
        <div className="mt-4 divide-y divide-linear-hairline border-t border-linear-hairline">
          {reports.map((report) => (
            <article key={report.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={report.status === "open" ? "font-medium text-linear-primary" : "text-emerald-700"}>
                      {report.status === "open" ? "ต้องตรวจสอบ" : "ตรวจสอบแล้ว"}
                    </span>
                    <span className="rounded-full bg-linear-surface-3 px-2 py-0.5 text-linear-ink-muted">
                      {report.source === "topup" ? "Topup" : "Admin"}
                    </span>
                    <span className="text-linear-ink-tertiary">{new Date(report.createdAt).toLocaleString("th-TH")}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-linear-ink-subtle">{report.message}</p>
                  {report.createdBy ? <p className="mt-1 text-xs text-linear-ink-tertiary">โดย {report.createdBy}</p> : null}
                </div>
                {canManage ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => changeStatus(report.id, report.status === "open" ? "resolved" : "open")}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-linear-hairline-strong px-3 text-xs font-medium text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-40"
                  >
                    <CheckCircle2 size={14} /> {report.status === "open" ? "ตรวจสอบแล้ว" : "เปิดอีกครั้ง"}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : <p className="mt-4 border-t border-linear-hairline pt-4 text-sm text-linear-ink-tertiary">ยังไม่มีรายงาน</p>}
    </section>
  );
}
