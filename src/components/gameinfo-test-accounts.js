"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Lock, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { useGameinfoUnsavedChanges } from "@/lib/gameinfo-unsaved-changes";
import GameinfoConfirmDialog from "./gameinfo-confirm-dialog";

const USE_LABELS = { uid: "UID", idpass: "ID-PASS", both: "UID + ID-PASS" };
const REVEAL_MS = 30_000;
const EMPTY_DRAFT = { name: "", login: "", password: "", server: "", useFor: "both", note: "" };

function formatTested(value) {
  if (!value) return "ยังไม่เคยทดสอบ";
  return new Date(value).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

// A revealed password hides itself again after REVEAL_MS, so a screen left
// open does not keep showing it.
function useReveal(gameId) {
  const [revealed, setRevealed] = useState({});
  const [error, setError] = useState("");
  useEffect(() => {
    const ids = Object.keys(revealed);
    if (!ids.length) return undefined;
    const timer = window.setTimeout(() => setRevealed({}), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealed]);
  async function toggle(accountId) {
    if (revealed[accountId]) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[accountId];
        return next;
      });
      return;
    }
    setError("");
    try {
      const data = await apiJson(`/api/gameinfo/gamelist/${gameId}/test-accounts/${accountId}/reveal`, {
        method: "POST",
        fallbackError: "แสดงรหัสผ่านไม่สำเร็จ",
      });
      setRevealed((current) => ({ ...current, [accountId]: data }));
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : "แสดงรหัสผ่านไม่สำเร็จ");
    }
  }
  return { revealed, toggle, error };
}

function ResultBadge({ result }) {
  if (result === "pass") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-extrabold text-emerald-800 dark:text-emerald-400"><CheckCircle2 size={13} aria-hidden="true" /> ผ่าน</span>;
  }
  if (result === "fail") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-[#D90005]/10 px-2.5 py-1 text-xs font-extrabold text-[#B80004] dark:text-[#FF8A8C]"><XCircle size={13} aria-hidden="true" /> ไม่ผ่าน</span>;
  }
  return <span className="text-xs text-linear-ink-tertiary">–</span>;
}

function PasswordCell({ account, revealed, canReveal, onToggle }) {
  if (!account.hasPassword) return <span className="text-xs text-linear-ink-tertiary">ไม่มี</span>;
  const shown = revealed?.password;
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-[13px] text-linear-ink">{shown ?? "••••••••"}</span>
      {canReveal ? (
        <button
          type="button"
          onClick={() => onToggle(account.id)}
          aria-label={shown ? `ซ่อนรหัสผ่าน ${account.name}` : `แสดงรหัสผ่าน ${account.name}`}
          title={shown ? "ซ่อน" : "แสดง (บันทึกในประวัติ)"}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-linear-ink-muted hover:bg-linear-surface-2 hover:text-linear-ink"
        >
          {shown ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      ) : null}
    </span>
  );
}

/** Read-only card for the game page: who may see logins sees them, passwords stay behind a logged reveal. */
export function GameinfoTestAccountsCard({ gameId, accounts, canReveal }) {
  const { revealed, toggle, error } = useReveal(gameId);
  return (
    <section aria-labelledby="test-accounts-title" className="rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="test-accounts-title" className="flex items-center gap-2 text-base font-black text-linear-ink">
          <KeyRound size={17} aria-hidden="true" /> บัญชีทดสอบ (TESTID)
        </h2>
        {!canReveal ? (
          <span className="flex items-center gap-1 text-xs font-bold text-linear-ink-muted"><Lock size={13} aria-hidden="true" /> ซ่อนอยู่</span>
        ) : null}
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-linear-ink-tertiary">ยังไม่มีบัญชีทดสอบ</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {accounts.map((account) => (
            <li key={account.id} className="flex flex-col gap-1.5 rounded-xl bg-linear-surface-2 px-3.5 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-black text-linear-ink">{account.name}</span>
                <span className="flex items-center gap-2">
                  <span className="rounded-md bg-linear-surface-3 px-2 py-0.5 text-[11px] font-bold text-linear-ink-muted">{USE_LABELS[account.useFor]}</span>
                  <ResultBadge result={account.lastResult} />
                </span>
              </div>
              <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1">
                <dt className="text-linear-ink-tertiary">ID</dt>
                <dd className="truncate font-mono text-[13px] text-linear-ink">{account.login || "-"}</dd>
                <dt className="text-linear-ink-tertiary">PASS</dt>
                <dd><PasswordCell account={account} revealed={revealed[account.id]} canReveal={canReveal} onToggle={toggle} /></dd>
                {account.server ? (
                  <>
                    <dt className="text-linear-ink-tertiary">Server</dt>
                    <dd className="text-linear-ink">{account.server}</dd>
                  </>
                ) : null}
              </dl>
              {account.note ? <p className="text-xs text-linear-ink-muted">{account.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {error ? <p role="alert" className="mt-2 text-xs text-linear-danger">{error}</p> : null}
    </section>
  );
}

/** Editor table: add, edit, delete, record a test result. */
export default function GameinfoTestAccounts({ gameId, initialAccounts }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const { revealed, toggle, error: revealError } = useReveal(gameId);
  const dirty = editingId !== null && JSON.stringify(draft) !== JSON.stringify(editingId === "new" ? EMPTY_DRAFT : draftFrom(accounts.find((item) => item.id === editingId)));
  useGameinfoUnsavedChanges(dirty);

  function draftFrom(account) {
    return account ? { name: account.name, login: account.login, password: "", server: account.server, useFor: account.useFor, note: account.note } : EMPTY_DRAFT;
  }

  function startEdit(account) {
    setEditingId(account ? account.id : "new");
    setDraft(draftFrom(account));
    setError("");
  }

  async function run(task, fallbackError) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : fallbackError);
    } finally {
      setBusy(false);
    }
  }

  function save(event) {
    event.preventDefault();
    const isNew = editingId === "new";
    // An empty password box while editing keeps the stored password.
    const body = { ...draft };
    if (!isNew && !body.password) delete body.password;
    return run(async () => {
      const data = await apiJson(`/api/gameinfo/gamelist/${gameId}/test-accounts${isNew ? "" : `/${editingId}`}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        fallbackError: "บันทึกบัญชีทดสอบไม่สำเร็จ",
      });
      setAccounts((current) => (isNew ? [...current, data.account] : current.map((item) => (item.id === data.account.id ? data.account : item))));
      setEditingId(null);
    }, "บันทึกบัญชีทดสอบไม่สำเร็จ");
  }

  function recordResult(accountId, result) {
    return run(async () => {
      const data = await apiJson(`/api/gameinfo/gamelist/${gameId}/test-accounts/${accountId}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result }),
        fallbackError: "บันทึกผลทดสอบไม่สำเร็จ",
      });
      setAccounts((current) => current.map((item) => (item.id === data.account.id ? data.account : item)));
    }, "บันทึกผลทดสอบไม่สำเร็จ");
  }

  function remove(account) {
    return run(async () => {
      await apiJson(`/api/gameinfo/gamelist/${gameId}/test-accounts/${account.id}`, { method: "DELETE", fallbackError: "ลบบัญชีทดสอบไม่สำเร็จ" });
      setAccounts((current) => current.filter((item) => item.id !== account.id));
    }, "ลบบัญชีทดสอบไม่สำเร็จ");
  }

  const inputClass = "h-10 w-full rounded-[10px] border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none focus:border-[#D90005] focus:ring-2 focus:ring-[#D90005]/20";

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-linear-hairline">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-linear-surface-2 text-[11px] font-black uppercase tracking-[0.06em] text-linear-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3">ชื่อเรียก</th>
              <th scope="col" className="px-3 py-3">ไอดี / อีเมล</th>
              <th scope="col" className="px-3 py-3">รหัสผ่าน</th>
              <th scope="col" className="px-3 py-3">Server</th>
              <th scope="col" className="px-3 py-3">ใช้กับ</th>
              <th scope="col" className="px-3 py-3">ทดสอบล่าสุด</th>
              <th scope="col" className="px-3 py-3">ผล</th>
              <th scope="col" className="px-4 py-3 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && editingId !== "new" ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-linear-ink-tertiary">ยังไม่มีบัญชีทดสอบ</td>
              </tr>
            ) : null}
            {accounts.map((account) => (
              <tr key={account.id} className="border-t border-linear-hairline align-middle">
                <td className="px-4 py-2.5">
                  <span className="block font-black text-linear-ink">{account.name}</span>
                  {account.note ? <span className="block text-xs text-linear-ink-tertiary">{account.note}</span> : null}
                </td>
                <td className="max-w-[200px] truncate px-3 py-2.5 font-mono text-[13px] text-linear-ink" title={account.login}>{account.login || "-"}</td>
                <td className="px-3 py-2.5"><PasswordCell account={account} revealed={revealed[account.id]} canReveal onToggle={toggle} /></td>
                <td className="px-3 py-2.5 text-linear-ink">{account.server || "-"}</td>
                <td className="px-3 py-2.5"><span className="rounded-md bg-linear-surface-3 px-2 py-0.5 text-xs font-bold text-linear-ink-muted">{USE_LABELS[account.useFor]}</span></td>
                <td className="px-3 py-2.5 text-xs text-linear-ink-muted">
                  {formatTested(account.lastTestedAt)}
                  {account.lastTestedBy ? <span className="block text-linear-ink-tertiary">โดย {account.lastTestedBy}</span> : null}
                </td>
                <td className="px-3 py-2.5"><ResultBadge result={account.lastResult} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button type="button" disabled={busy} onClick={() => recordResult(account.id, "pass")} className="h-9 rounded-[9px] border border-linear-hairline px-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-40 dark:text-emerald-400">ผ่าน</button>
                    <button type="button" disabled={busy} onClick={() => recordResult(account.id, "fail")} className="h-9 rounded-[9px] border border-linear-hairline px-2.5 text-xs font-bold text-[#B80004] hover:bg-[#D90005]/10 disabled:opacity-40 dark:text-[#FF8A8C]">ไม่ผ่าน</button>
                    <button type="button" disabled={busy} onClick={() => startEdit(account)} aria-label={`แก้ไข ${account.name}`} className="flex h-9 w-9 items-center justify-center rounded-[9px] text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-40"><Pencil size={15} /></button>
                    <button type="button" disabled={busy} onClick={() => setConfirmDelete(account)} aria-label={`ลบ ${account.name}`} className="flex h-9 w-9 items-center justify-center rounded-[9px] text-[#D90005] hover:bg-[#D90005]/10 disabled:opacity-40"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingId !== null ? (
        <form onSubmit={save} className="grid gap-3 rounded-xl border border-linear-hairline bg-linear-surface-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <p className="text-sm font-black text-linear-ink sm:col-span-2 lg:col-span-3">{editingId === "new" ? "เพิ่มบัญชีทดสอบ" : "แก้ไขบัญชีทดสอบ"}</p>
          <Field label="ชื่อเรียก"><input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="เช่น Test SEA #1" className={inputClass} /></Field>
          <Field label="ไอดี / อีเมล"><input value={draft.login} onChange={(e) => setDraft({ ...draft, login: e.target.value })} autoComplete="off" className={inputClass} /></Field>
          <Field label="รหัสผ่าน">
            <input type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} autoComplete="new-password" placeholder={editingId === "new" ? "" : "เว้นว่างไว้ = ใช้รหัสเดิม"} className={inputClass} />
          </Field>
          <Field label="Server"><input value={draft.server} onChange={(e) => setDraft({ ...draft, server: e.target.value })} className={inputClass} /></Field>
          <Field label="ใช้กับ">
            <select value={draft.useFor} onChange={(e) => setDraft({ ...draft, useFor: e.target.value })} className={inputClass}>
              {Object.entries(USE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="หมายเหตุ"><input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className={inputClass} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
            <button type="button" onClick={() => setEditingId(null)} className="h-10 rounded-[10px] border border-linear-hairline bg-linear-surface-1 px-4 text-sm font-bold text-linear-ink hover:bg-linear-surface-3">ยกเลิก</button>
            <button type="submit" disabled={busy} className="h-10 rounded-[10px] bg-[#D90005] px-5 text-sm font-extrabold text-white hover:bg-[#B80004] disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => startEdit(null)} className="flex h-10 items-center gap-1.5 rounded-[10px] border border-dashed border-linear-hairline-strong px-4 text-[13px] font-bold text-linear-ink-muted hover:bg-linear-surface-2">
            <Plus size={15} aria-hidden="true" /> เพิ่มบัญชีทดสอบ
          </button>
          <span className="text-xs text-linear-ink-tertiary">รหัสผ่านเก็บแบบเข้ารหัส การกดดูรหัสผ่านถูกบันทึกในประวัติ · ห้ามใช้บัญชีลูกค้าจริง</span>
        </div>
      )}
      {error || revealError ? <p role="alert" className="text-xs text-linear-danger">{error || revealError}</p> : null}

      <GameinfoConfirmDialog
        open={Boolean(confirmDelete)}
        title="ลบบัญชีทดสอบ"
        message={confirmDelete ? `ลบ “${confirmDelete.name}” ออกจากเกมนี้?` : ""}
        confirmLabel="ลบ"
        destructive
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          const account = confirmDelete;
          setConfirmDelete(null);
          if (account) remove(account);
        }}
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold text-linear-ink-muted">{label}</span>
      {children}
    </label>
  );
}
