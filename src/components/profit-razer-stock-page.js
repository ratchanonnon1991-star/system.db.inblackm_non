"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Upload,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { fmtDate, fmtMoney } from "@/lib/profit-format";
import { RazerStatusBadge, RazerZoneBadge, RAZER_STATUS_LABELS, RAZER_STATUSES } from "@/components/profit-razer-badges";
import ProfitRazerDeveloperApi from "@/components/profit-razer-developer-api";
import ProfitModal, { ProfitField, profitInputClass } from "@/components/profit-modal";
import { useProfitCanEdit } from "@/components/profit-capabilities-context";
import {
  parseRazerImportText,
  parsedRowToForm,
  resolveRazerPasteRow,
  RAZER_DELIMITER_LABELS,
  RAZER_IMPORT_FORMAT_HINT,
  RAZER_ZONES,
} from "@/lib/profit-razer-parse";
import { isRazerBusyStatus } from "@/lib/profit-razer-status";

const SYNC_POLL_MS = 2500;
const SYNC_POLL_MAX_MS = 8 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Start async sync then poll until Playwright finishes (avoids proxy HTTP 504). */
async function waitForRazerSyncJob(startUrl, { method = "POST", headers, body, fallbackError } = {}) {
  const started = await apiJson(startUrl, {
    method,
    headers,
    body,
    fallbackError,
  });
  const jobId = started.jobId || started.job?.id;
  if (!jobId) {
    // Backward compat if an older server still returns the sync result inline.
    return started;
  }

  const deadline = Date.now() + SYNC_POLL_MAX_MS;
  while (Date.now() < deadline) {
    await sleep(SYNC_POLL_MS);
    const { job } = await apiJson(`/api/profit/razer/sync/jobs/${jobId}`, {
      fallbackError: "อ่านสถานะดึงยอดไม่สำเร็จ",
    });
    if (job.status === "ok") return { ...started, job };
    if (job.status === "error") {
      const err = new Error(job.error || fallbackError || "ดึงยอดไม่สำเร็จ");
      err.status = 400;
      throw err;
    }
  }
  throw new Error("ดึงยอดใช้เวลานานเกินไป — ลองอีกครั้ง");
}

const EMPTY_FORM = {
  email: "",
  password: "",
  tfaSecret: "",
  zone: "CAD",
  rate: "",
  status: "ACTIVE",
  goldBalance: "",
  silverBalance: "",
};

const EMPTY_EDIT_FORM = {
  zone: "CAD",
  rate: "",
  status: "ACTIVE",
  goldBalance: "",
  silverBalance: "",
  botEnabled: true,
  hidden: false,
};

const EMPTY_BULK_FORM = {
  zone: "",
  status: "",
  rate: "",
  botEnabled: "",
  hidden: "",
};

function fmtGold(n) {
  return `${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} G`;
}

function fmtSilver(n) {
  return (Number(n) || 0).toLocaleString("en-US");
}

export default function ProfitRazerStockPage() {
  const canEdit = useProfitCanEdit();
  const fileRef = useRef(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("gold");
  const [sortDir, setSortDir] = useState("desc");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editAccount, setEditAccount] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState(EMPTY_BULK_FORM);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [pasteLine, setPasteLine] = useState("");
  const [syncConfig, setSyncConfig] = useState(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const syncAllInFlight = useRef(false);
  const [tfaEdit, setTfaEdit] = useState(null);
  const [tfaValue, setTfaValue] = useState("");
  const [totpKeyValue, setTotpKeyValue] = useState("");
  const [tfaSaving, setTfaSaving] = useState(false);
  const [tfaError, setTfaError] = useState("");
  const [otpCache, setOtpCache] = useState({});
  const [otpBusyId, setOtpBusyId] = useState(null);
  const [otpRefreshedAt, setOtpRefreshedAt] = useState({});
  const otpFetchingRef = useRef({});
  const [otpRevealed, setOtpRevealed] = useState({});
  const [otpKeyEditId, setOtpKeyEditId] = useState(null);
  const [otpKeyDraft, setOtpKeyDraft] = useState("");
  const [otpKeySaving, setOtpKeySaving] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const otpExpireRef = useRef({});

  useEffect(() => {
    apiJson("/api/profit/razer/overview", { fallbackError: "โหลด sync config ไม่สำเร็จ" })
      .then((data) => setSyncConfig(data.sync || null))
      .catch(() => setSyncConfig(null));
  }, []);

  const loadAccounts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("search", query);
    if (zoneFilter) params.set("zone", zoneFilter);
    const qs = params.toString();
    return apiJson(`/api/profit/razer/accounts${qs ? `?${qs}` : ""}`, { fallbackError: "โหลดบัญชีไม่สำเร็จ" })
      .then((data) => {
        const list = data.accounts || [];
        setAccounts(list);
        return list;
      })
      .catch((err) => {
        setError(err.message);
        return [];
      })
      .finally(() => setLoading(false));
  }, [query, zoneFilter]);

  const fetchOtpForAccount = useCallback(async (account, { persist = false, forceExternal = false } = {}) => {
    if (!account?.id) return;
    if (otpFetchingRef.current[account.id]) return;
    otpFetchingRef.current[account.id] = true;
    setOtpBusyId(account.id);
    try {
      const qs = forceExternal ? "?force=external" : "";
      const data = await apiJson(`/api/profit/razer/accounts/${account.id}/otp${qs}`, {
        method: persist || forceExternal ? "POST" : "GET",
        headers: forceExternal ? { "Content-Type": "application/json" } : undefined,
        body: forceExternal ? JSON.stringify({ forceExternal: true }) : undefined,
        fallbackError: "ดึง OTP ไม่สำเร็จ",
      });
      const bundle = data.otp || {};
      const secondsLeft = bundle.otpSecondsLeft ?? bundle.totpSecondsLeft ?? 0;
      setOtpCache((prev) => ({
        ...prev,
        [account.id]: {
          otp: bundle.otp || "",
          otpSecondsLeft: secondsLeft,
          otpSource: bundle.otpSource || "",
          otpError: bundle.otpError || "",
          totpKeyUsed: bundle.totpKeyUsed || account.totpKey || "",
        },
      }));
      setOtpRefreshedAt((prev) => ({ ...prev, [account.id]: Date.now() }));
      if (bundle.otp && secondsLeft <= 1) {
        otpExpireRef.current[account.id] = true;
      }
      if (persist && bundle.otp) {
        await loadAccounts();
      }
    } catch (err) {
      setOtpCache((prev) => ({
        ...prev,
        [account.id]: { otp: "", otpSecondsLeft: 0, otpError: err.message },
      }));
    } finally {
      otpFetchingRef.current[account.id] = false;
      setOtpBusyId(null);
    }
  }, [loadAccounts]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Light refresh so filling status from bot claim shows without manual reload.
  useEffect(() => {
    const timer = setInterval(() => {
      loadAccounts();
    }, 15000);
    return () => clearInterval(timer);
  }, [loadAccounts]);

  function revealOtp(account) {
    setOtpRevealed((prev) => ({ ...prev, [account.id]: true }));
    fetchOtpForAccount(account, { forceExternal: true });
  }

  function hideOtp(accountId) {
    setOtpRevealed((prev) => ({ ...prev, [accountId]: false }));
  }

  useEffect(() => {
    const revealedIds = Object.keys(otpRevealed).filter((id) => otpRevealed[id]);
    if (!revealedIds.length) return undefined;

    const tick = setInterval(() => {
      setOtpCache((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const id of revealedIds) {
          const row = next[id];
          if (!row?.otp) continue;
          const left = Math.max(0, (row.otpSecondsLeft ?? 0) - 1);
          if (left !== row.otpSecondsLeft) {
            next[id] = { ...row, otpSecondsLeft: left };
            changed = true;
            if (left === 0) otpExpireRef.current[id] = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [otpRevealed]);

  useEffect(() => {
    for (const account of accounts) {
      if (!otpRevealed[account.id]) continue;
      if (!otpExpireRef.current[account.id]) continue;
      if (otpBusyId === account.id) continue;
      otpExpireRef.current[account.id] = false;
      fetchOtpForAccount(account, { forceExternal: true });
    }
  }, [otpCache, accounts, otpRevealed, otpBusyId, fetchOtpForAccount]);

  async function handleImportText(text) {
    if (!canEdit || !String(text || "").trim()) return;
    setImporting(true);
    setImportMsg("");
    try {
      const preview = parseRazerImportText(text);
      if (!preview.rows.length) {
        setImportMsg("ไม่พบข้อมูล — ใช้ CSV: email,password,zone หรือ Email | Password | 2FA | Region | Rate");
        return;
      }
      const data = await apiJson("/api/profit/razer/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
        fallbackError: "นำเข้า CSV ไม่สำเร็จ",
      });
      const { created, updated, errors, delimiter, skipped, sync } = data.result;
      const delimLabel = RAZER_DELIMITER_LABELS[delimiter] || delimiter;
      let msg = `ตรวจพบ ${preview.rows.length} บัญชี (${delimLabel}) · เพิ่ม ${created} · อัปเดต ${updated}${
        skipped ? ` · ข้าม ${skipped} บรรทัด` : ""
      }${errors?.length ? ` · ผิดพลาด ${errors.length}` : ""}`;
      if (sync && !sync.skipped) {
        msg += ` · ดึงยอดสำเร็จ ${sync.ok}${sync.failed ? ` · ดึงยอดไม่สำเร็จ ${sync.failed}` : ""}`;
      } else if (sync?.skipped) {
        msg += " · ยังไม่ได้ตั้ง RAZER_SYNC_URL (ไม่ดึงยอดอัตโนมัติ)";
      }
      setImportMsg(msg);
      await loadAccounts();
    } catch (err) {
      setImportMsg(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleImport(file) {
    if (!file || !canEdit) return;
    const name = String(file.name || "").toLowerCase();
    if (name && !name.endsWith(".csv") && !name.endsWith(".txt")) {
      setImportMsg("รองรับเฉพาะไฟล์ .csv (หรือ .txt) — คอลัมน์อย่างน้อย email,password,zone");
      return;
    }
    handleImportText(await file.text());
  }

  function applyPasteToForm(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return false;

    const { rows } = parseRazerImportText(trimmed);
    if (rows.length > 1) {
      setAddOpen(false);
      handleImportText(trimmed);
      return true;
    }

    const row = resolveRazerPasteRow(trimmed);
    if (row) {
      setAddForm({ ...EMPTY_FORM, ...parsedRowToForm(row) });
      setPasteLine("");
      setAddError("");
      return true;
    }
    return false;
  }

  function mergePasteIntoForm(form) {
    if (!pasteLine.trim()) return form;
    const row = resolveRazerPasteRow(pasteLine);
    if (!row) return form;
    return { ...EMPTY_FORM, ...form, ...parsedRowToForm(row) };
  }

  async function handleAddAccount() {
    if (!canEdit) return;
    const merged = mergePasteIntoForm(addForm);
    if (merged !== addForm) {
      setAddForm(merged);
      setPasteLine("");
    }
    const email = merged.email.trim();
    if (!email) {
      if (pasteLine.trim()) {
        setAddError("อ่านข้อมูลที่วางไม่ได้ — ใช้ Email | Password | 2FA | CAD | 30 หรือวางทีละบรรทัด");
      } else {
        setAddError("กรุณาระบุอีเมล");
      }
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      const data = await apiJson("/api/profit/razer/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: merged.password,
          tfaSecret: merged.tfaSecret,
          zone: merged.zone,
          rate: Number(merged.rate) || 0,
          status: merged.status,
          goldBalance: Number(merged.goldBalance) || 0,
          silverBalance: Number(merged.silverBalance) || 0,
        }),
        fallbackError: "เพิ่มบัญชีไม่สำเร็จ",
      });
      setAddOpen(false);
      setAddForm(EMPTY_FORM);
      await loadAccounts();
      if (data.synced) setImportMsg(`เพิ่ม ${email} และดึงยอดจาก Razer แล้ว`);
      else if (syncConfig?.enabled === false) setImportMsg(`เพิ่ม ${email} แล้ว — ตั้ง RAZER_SYNC_URL เพื่อดึงยอดอัตโนมัติ`);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id) {
    if (!canEdit || !confirm("ลบบัญชีนี้?")) return;
    setBusyId(id);
    try {
      await apiJson(`/api/profit/razer/accounts/${id}`, { method: "DELETE", fallbackError: "ลบไม่สำเร็จ" });
      await loadAccounts();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleHidden(account) {
    if (!canEdit) return;
    setBusyId(account.id);
    try {
      await apiJson(`/api/profit/razer/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !account.hidden }),
        fallbackError: "อัปเดตไม่สำเร็จ",
      });
      await loadAccounts();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleBotEnabled(account) {
    if (!canEdit) return;
    setBusyId(account.id);
    try {
      await apiJson(`/api/profit/razer/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botEnabled: !account.botEnabled }),
        fallbackError: "อัปเดต Bot API ไม่สำเร็จ",
      });
      await loadAccounts();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleShowCredentials(id) {
    if (!canEdit) return;
    setBusyId(id);
    try {
      const data = await apiJson(`/api/profit/razer/accounts/${id}/credentials`, {
        fallbackError: "โหลดข้อมูลลับไม่สำเร็จ",
      });
      setCredentials(data.credentials);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function defaultTotpKey(email) {
    return String(email || "").split("@")[0]?.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "";
  }

  function startOtpKeyEdit(account) {
    if (!canEdit) return;
    setOtpKeyEditId(account.id);
    setOtpKeyDraft(account.totpKey || otpCache[account.id]?.totpKeyUsed || defaultTotpKey(account.email));
  }

  async function handleSaveOtpKeyAndFetch(account) {
    if (!canEdit || !account?.id) return;
    const totpKey = otpKeyDraft.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!totpKey) {
      setOtpKeyEditId(null);
      return;
    }
    setOtpKeySaving(true);
    setOtpRevealed((prev) => ({ ...prev, [account.id]: true }));
    try {
      await apiJson(`/api/profit/razer/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totpKey }),
        fallbackError: "บันทึก key ไม่สำเร็จ",
      });
      setOtpKeyEditId(null);
      await loadAccounts();
      await fetchOtpForAccount({ ...account, totpKey }, { forceExternal: true });
    } catch (err) {
      setOtpCache((prev) => ({
        ...prev,
        [account.id]: { otp: "", otpSecondsLeft: 0, otpError: err.message },
      }));
    } finally {
      setOtpKeySaving(false);
    }
  }

  function openTfaEditor(account) {
    setTfaEdit(account);
    setTfaValue("");
    setTotpKeyValue(account.totpKey || defaultTotpKey(account.email));
    setTfaError("");
  }

  async function handleSaveTfaSecret() {
    if (!canEdit || !tfaEdit) return;
    const secret = tfaValue.trim();
    const totpKey = totpKeyValue.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!secret && !totpKey) {
      setTfaError("ใส่ชื่อ Key หรือ 2FA Secret");
      return;
    }
    setTfaSaving(true);
    setTfaError("");
    try {
      await apiJson(`/api/profit/razer/accounts/${tfaEdit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(secret ? { tfaSecret: secret } : {}),
          ...(totpKey ? { totpKey } : {}),
        }),
        fallbackError: "บันทึก OTP ไม่สำเร็จ",
      });
      const email = tfaEdit.email;
      const id = tfaEdit.id;
      setTfaEdit(null);
      setTfaValue("");
      setTotpKeyValue("");
      await loadAccounts();
      await fetchOtpForAccount({ id, email, hasTfa: Boolean(secret), totpKey }, { persist: false });
      setImportMsg(`บันทึก OTP สำหรับ ${email} แล้ว — กด 🔄 ถ้ายังไม่ขึ้น`);
    } catch (err) {
      setTfaError(err.message);
    } finally {
      setTfaSaving(false);
    }
  }

  async function handleSyncBalance(account) {
    if (!canEdit) return;
    setBusyId(account.id);
    setError("");
    setImportMsg("");
    try {
      setImportMsg(`กำลังดึงยอด ${account.email}… (รอ 1–3 นาที)`);
      await waitForRazerSyncJob(`/api/profit/razer/accounts/${account.id}/sync`, {
        method: "POST",
        fallbackError: "ดึงยอดจาก Razer ไม่สำเร็จ",
      });
      setImportMsg(`ดึงยอด ${account.email} สำเร็จ`);
      await loadAccounts();
    } catch (err) {
      setError(err.message || "ดึงยอดจาก Razer ไม่สำเร็จ");
      setImportMsg("");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSyncAll({ silent = false } = {}) {
    if (!canEdit) return;
    if (syncAllInFlight.current) return;
    syncAllInFlight.current = true;
    if (!silent) setSyncingAll(true);
    if (!silent) setError("");
    try {
      if (!silent) setImportMsg("กำลังดึงยอดทั้งหมด… (รอบพื้นหลัง ไม่โดน timeout)");
      const data = await waitForRazerSyncJob("/api/profit/razer/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone: zoneFilter || undefined }),
        fallbackError: "ดึงยอดทั้งหมดไม่สำเร็จ",
      });
      const { ok, failed, errors } = data.job?.result || data.result || {};
      if (!silent) {
        setImportMsg(`ดึงยอดเสร็จ · สำเร็จ ${ok ?? 0}${failed ? ` · ไม่สำเร็จ ${failed}` : ""}`);
      } else if (failed > 0 && errors?.[0]?.message) {
        setError(`ดึงยอดอัตโนมัติไม่สำเร็จ: ${errors[0].message}`);
      }
      await loadAccounts();
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      syncAllInFlight.current = false;
      if (!silent) setSyncingAll(false);
    }
  }

  // Each sync spins up a Chromium per account, so a poll that fires while the
  // previous one is still running just piles work onto the server. Skip the
  // tick when a run is in flight or the tab is in the background.
  useEffect(() => {
    if (!syncConfig?.enabled || !canEdit) return undefined;
    const pollMs = Math.max(300000, Number(syncConfig.pollMs) || 900000);
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (syncAllInFlight.current) return;
      handleSyncAll({ silent: true });
    }, pollMs);
    return () => clearInterval(timer);
  }, [syncConfig, canEdit, zoneFilter]);

  const hiddenCount = accounts.filter((a) => a.hidden).length;

  const displayAccounts = useMemo(() => {
    let list = accounts.filter((a) => showHidden || !a.hidden);
    if (statusFilter) list = list.filter((a) => a.status === statusFilter);
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "gold") {
        cmp = (Number(a.goldBalance) || 0) - (Number(b.goldBalance) || 0);
        if (cmp === 0) cmp = (Number(a.goldThb) || 0) - (Number(b.goldThb) || 0);
      } else if (sortBy === "silver") {
        cmp = (Number(a.silverBalance) || 0) - (Number(b.silverBalance) || 0);
      } else {
        cmp = new Date(a.lastSyncedAt || 0).getTime() - new Date(b.lastSyncedAt || 0).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [accounts, showHidden, statusFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(displayAccounts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageAccounts = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return displayAccounts.slice(start, start + pageSize);
  }, [displayAccounts, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, zoneFilter, query, showHidden, sortBy, sortDir, pageSize]);

  const selectedVisibleCount = pageAccounts.filter((a) => selectedIds.has(a.id)).length;
  const allVisibleSelected = pageAccounts.length > 0 && selectedVisibleCount === pageAccounts.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const a of pageAccounts) next.delete(a.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const a of pageAccounts) next.add(a.id);
        return next;
      });
    }
  }

  function toggleSelectRow(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setGoldSortFromHeader() {
    if (sortBy !== "gold") {
      setSortBy("gold");
      setSortDir("desc");
      return;
    }
    setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
  }

  function openEditAccount(account) {
    setEditAccount(account);
    setEditForm({
      zone: account.zone || "CAD",
      rate: account.rate != null ? String(account.rate) : "",
      status: account.status || "ACTIVE",
      goldBalance: account.goldBalance != null ? String(account.goldBalance) : "",
      silverBalance: account.silverBalance != null ? String(account.silverBalance) : "",
      botEnabled: account.botEnabled !== false,
      hidden: Boolean(account.hidden),
    });
    setEditError("");
  }

  function buildPatchBody(form, { includeBalances = false } = {}) {
    const body = {
      zone: form.zone,
      status: form.status,
      rate: Number(form.rate) || 0,
      botEnabled: form.botEnabled,
      hidden: form.hidden,
    };
    if (includeBalances) {
      body.goldBalance = Number(form.goldBalance) || 0;
      body.silverBalance = Number(form.silverBalance) || 0;
    }
    return body;
  }

  async function handleSaveEditAccount() {
    if (!canEdit || !editAccount) return;
    setEditSaving(true);
    setEditError("");
    try {
      const body = buildPatchBody(editForm, { includeBalances: true });
      if (!isRazerBusyStatus(body.status) && isRazerBusyStatus(editAccount.status)) {
        body.clearInUse = true;
      }
      if (isRazerBusyStatus(body.status) && !isRazerBusyStatus(editAccount.status)) {
        const ok = confirm(
          `ตั้งเป็น “${RAZER_STATUS_LABELS[body.status] || body.status}” ด้วยมืออาจชนกับบอท — แนะนำให้บอท claim เองตอนสั่งเติม\n\nยืนยัน?`
        );
        if (!ok) {
          setEditSaving(false);
          return;
        }
      }
      await apiJson(`/api/profit/razer/accounts/${editAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        fallbackError: "อัปเดตบัญชีไม่สำเร็จ",
      });
      setEditAccount(null);
      setImportMsg(`อัปเดต ${editAccount.email} แล้ว`);
      await loadAccounts();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  function openBulkEdit() {
    if (!selectedIds.size) return;
    setBulkForm(EMPTY_BULK_FORM);
    setBulkError("");
    setBulkOpen(true);
  }

  async function handleBulkSave() {
    if (!canEdit || !selectedIds.size) return;
    const body = {};
    if (bulkForm.zone) body.zone = bulkForm.zone;
    if (bulkForm.status) body.status = bulkForm.status;
    if (bulkForm.rate !== "") body.rate = Number(bulkForm.rate) || 0;
    if (bulkForm.botEnabled === "true") body.botEnabled = true;
    if (bulkForm.botEnabled === "false") body.botEnabled = false;
    if (bulkForm.hidden === "true") body.hidden = true;
    if (bulkForm.hidden === "false") body.hidden = false;

    if (!Object.keys(body).length) {
      setBulkError("เลือกอย่างน้อย 1 ฟิลด์ที่จะเปลี่ยน");
      return;
    }

    const ids = [...selectedIds].filter((id) => displayAccounts.some((a) => a.id === id));
    if (!ids.length) {
      setBulkError("ไม่มีบัญชีที่เลือกในรายการที่แสดง");
      return;
    }

    const busyCount = ids.filter((id) => isRazerBusyStatus(accounts.find((a) => a.id === id)?.status)).length;
    let msg = `อัปเดต ${ids.length} บัญชีพร้อมกัน?`;
    if (isRazerBusyStatus(bulkForm.status)) {
      msg += `\n\n⚠ ตั้ง “${RAZER_STATUS_LABELS[bulkForm.status] || bulkForm.status}” แบบกลุ่มไม่แนะนำ — บอทควร claim เองตอนสั่งเติม`;
    } else if (bulkForm.status && busyCount > 0) {
      msg += `\n\n${busyCount} บัญชีที่กำลังส่งเติมจะถูกปล่อย (clear in_use)`;
    }
    if (!confirm(msg)) return;

    setBulkSaving(true);
    setBulkError("");
    let ok = 0;
    const errors = [];
    try {
      for (const id of ids) {
        const acc = accounts.find((a) => a.id === id);
        const patch = { ...body };
        if (patch.status && !isRazerBusyStatus(patch.status) && isRazerBusyStatus(acc?.status)) {
          patch.clearInUse = true;
        }
        try {
          await apiJson(`/api/profit/razer/accounts/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
            fallbackError: "อัปเดตไม่สำเร็จ",
          });
          ok += 1;
        } catch (err) {
          errors.push(`${acc?.email || id}: ${err.message}`);
        }
      }
      setBulkOpen(false);
      setSelectedIds(new Set());
      setImportMsg(`อัปเดตกลุ่มสำเร็จ ${ok}/${ids.length}${errors.length ? ` · ผิดพลาด ${errors.length}` : ""}`);
      if (errors.length) setError(errors.slice(0, 3).join(" · "));
      await loadAccounts();
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ll-ink">Razer Accounts Database</h1>
          <p className="mt-0.5 text-[13px] text-ll-ink-subtle">จัดการบัญชี Razer Gold / Silver แยกตามโซน</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSyncAll()}
              disabled={syncingAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ll-hairline bg-ll-surface-1 px-3.5 py-2 text-[13px] font-medium text-ll-ink hover:bg-ll-surface-2 disabled:opacity-60"
            >
              {syncingAll ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Sync All
            </button>
            <button
              type="button"
              onClick={() => {
                setAddError("");
                setPasteLine("");
                setAddForm(EMPTY_FORM);
                setAddOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ll-primary px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90"
            >
              <Plus size={15} /> Add Account
            </button>
          </div>
        )}
      </div>

      {canEdit && syncConfig?.enabled && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-[12px] text-sky-950">
          ดึงยอด Gold/Silver: กด <strong>ดู OTP</strong> แล้ว <strong>Sync</strong>
          {" "}(ครั้งแรกรัน <code className="rounded bg-white/70 px-1">npm run razer:setup</code>)
          {" "}· คลิก <strong>key</strong> เพื่อเปลี่ยนแล้วยิง api-system · OTP ซ้ำ = แยก Secret ต่อ key หรือใส่ 2FA ใน <strong>Shield</strong>
        </div>
      )}

      {canEdit && syncConfig && !syncConfig.enabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-900">
          ดึงยอด Razer ปิดอยู่ — ตรวจ <code className="rounded bg-white/70 px-1">RAZER_AUTO_SYNC</code> ใน .env
        </div>
      )}

      <ProfitRazerDeveloperApi canEdit={canEdit} />

      {canEdit && (
        <div
          className="cursor-pointer rounded-xl border-2 border-dashed border-ll-hairline-strong bg-ll-surface-1 p-8 text-center transition hover:border-ll-primary hover:bg-ll-primary-subtle-bg/30"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleImport(file);
          }}
          onPaste={(e) => {
            const text = e.clipboardData?.getData("text");
            if (text?.includes("@")) {
              e.preventDefault();
              handleImportText(text);
            }
          }}
          tabIndex={0}
          role="button"
          aria-label="อัปโหลดหรือวางข้อมูลบัญชี Razer"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.txt"
            className="hidden"
            onChange={(e) => handleImport(e.target.files?.[0])}
          />
          <Upload size={28} className="mx-auto text-ll-ink-tertiary" />
          <p className="mt-3 text-sm font-medium text-ll-ink">ลากไฟล์ .csv / คลิกอัปโหลด / วางข้อความ (Ctrl+V)</p>
          <p className="mt-1 text-[12px] text-ll-ink-subtle">
            แบบสั้น: <code className="rounded bg-ll-surface-2 px-1.5 py-0.5">email,password,zone</code>
            {" "}เช่น <code className="rounded bg-ll-surface-2 px-1.5 py-0.5">a@hotmail.com,pass123,CAD</code>
          </p>
          <p className="mt-1 text-[11px] text-ll-ink-tertiary">
            หรือเต็ม: <code className="rounded bg-ll-surface-2 px-1 py-0.5">{RAZER_IMPORT_FORMAT_HINT}</code>
            {" "}· มี header ก็ได้ · ข้ามอัตโนมัติ
          </p>
          {importing && (
            <p className="mt-3 flex items-center justify-center gap-2 text-[12px] text-ll-ink-subtle">
              <Loader2 size={14} className="animate-spin" /> กำลังนำเข้า...
            </p>
          )}
          {importMsg && <p className="mt-3 text-[12px] text-ll-primary-subtle-text">{importMsg}</p>}
        </div>
      )}

      {credentials && (
        <ProfitModal
          title={`ข้อมูลลับ — ${credentials.email}`}
          onClose={() => setCredentials(null)}
        >
          <ProfitField label="Email">
            <p className={profitInputClass}>{credentials.email}</p>
          </ProfitField>
          <ProfitField label="Password">
            <p className={`${profitInputClass} font-mono`}>{credentials.password || "-"}</p>
          </ProfitField>
          <ProfitField label="2FA Secret">
            <p className={`${profitInputClass} font-mono break-all`}>{credentials.tfaSecret || "-"}</p>
          </ProfitField>
        </ProfitModal>
      )}

      <section className="rounded-xl border border-ll-hairline bg-ll-surface-1 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-ll-hairline px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Search size={15} className="shrink-0 text-ll-ink-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setQuery(search)}
              placeholder="Search Email or Region..."
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ll-ink outline-none placeholder:text-ll-ink-tertiary"
            />
          </div>
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="rounded-lg border border-ll-hairline bg-ll-surface-1 px-2.5 py-1.5 text-[12px] text-ll-ink"
          >
            <option value="">ทุกโซน</option>
            {RAZER_ZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-ll-hairline bg-ll-surface-1 px-2.5 py-1.5 text-[12px] text-ll-ink"
          >
            <option value="">ทุกสถานะ</option>
            {RAZER_STATUSES.map((s) => (
              <option key={s} value={s}>{RAZER_STATUS_LABELS[s] || s}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[11px] text-ll-ink-subtle">
            เรียง
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-ll-hairline bg-ll-surface-1 px-2.5 py-1.5 text-[12px] text-ll-ink"
            >
              <option value="gold">จำนวนเงิน (Gold)</option>
              <option value="silver">Silver</option>
              <option value="updated">วันที่อัปเดต</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-ll-ink-subtle">
            ลำดับ
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value)}
              className="rounded-lg border border-ll-hairline bg-ll-surface-1 px-2.5 py-1.5 text-[12px] text-ll-ink"
            >
              {sortBy === "updated" ? (
                <>
                  <option value="desc">ใหม่สุดก่อน</option>
                  <option value="asc">เก่าสุดก่อน</option>
                </>
              ) : (
                <>
                  <option value="desc">มาก → น้อย</option>
                  <option value="asc">น้อย → มาก</option>
                </>
              )}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-ll-ink-subtle">
            แถว
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-ll-hairline bg-ll-surface-1 px-2.5 py-1.5 text-[12px] text-ll-ink"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setQuery(search)}
            className="rounded-lg bg-ll-primary px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          >
            Search
          </button>
          <button
            type="button"
            onClick={loadAccounts}
            className="inline-flex items-center gap-1 rounded-lg border border-ll-hairline px-2.5 py-1.5 text-[12px] text-ll-ink hover:bg-ll-surface-2"
          >
            <RefreshCw size={13} />
          </button>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] ${
                showHidden
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-ll-hairline text-ll-ink-subtle hover:bg-ll-surface-2"
              }`}
            >
              <Eye size={13} />
              {showHidden ? "ซ่อนรายการที่ซ่อน" : `แสดงที่ซ่อน (${hiddenCount})`}
            </button>
          )}
        </div>

        {canEdit && selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-ll-hairline bg-ll-primary-subtle-bg/40 px-4 py-2">
            <span className="text-[12px] font-medium text-ll-ink">
              เลือก {selectedVisibleCount} / {pageAccounts.length} ในหน้านี้ · ทั้งหมดที่เลือก {selectedIds.size}
            </span>
            <button
              type="button"
              onClick={openBulkEdit}
              className="inline-flex items-center gap-1 rounded-lg bg-ll-primary px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
            >
              <Pencil size={13} />
              แก้ไขกลุ่ม
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg border border-ll-hairline px-2.5 py-1.5 text-[12px] text-ll-ink-subtle hover:bg-ll-surface-2"
            >
              ยกเลิกการเลือก
            </button>
          </div>
        )}

        {error && <p className="px-4 py-3 text-[12px] text-red-600">{error}</p>}

        {loading ? (
          <p className="flex items-center gap-2 px-4 py-10 text-sm text-ll-ink-subtle">
            <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-[13px]">
              <thead>
                <tr className="border-b border-ll-hairline text-left text-[11px] uppercase tracking-wide text-ll-ink-subtle">
                  {canEdit && (
                    <th className="w-10 px-2 py-2.5 font-medium">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someVisibleSelected;
                        }}
                        onChange={toggleSelectAllVisible}
                        title="เลือกทั้งหมดในรายการที่แสดง"
                        className="h-3.5 w-3.5 rounded border-ll-hairline-strong"
                      />
                    </th>
                  )}
                  <th className="px-4 py-2.5 font-medium">Razer Account</th>
                  <th className="px-3 py-2.5 font-medium">Zone</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">OTP</th>
                  <th className="px-3 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={setGoldSortFromHeader}
                      className="inline-flex items-center gap-1 hover:text-ll-ink"
                      title="เรียงตาม Gold"
                    >
                      Gold / THB
                      {sortBy === "gold" ? (
                        sortDir === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-50" />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium">Silver</th>
                  <th className="px-3 py-2.5 font-medium">Last Update</th>
                  {canEdit && <th className="px-3 py-2.5 font-medium">Bot API</th>}
                  {canEdit && <th className="px-3 py-2.5 font-medium">Operate</th>}
                </tr>
              </thead>
              <tbody>
                {displayAccounts.length === 0 && (
                  <tr>
                    <td colSpan={canEdit ? 10 : 7} className="px-4 py-12 text-center text-ll-ink-tertiary">
                      {hiddenCount > 0 && !showHidden && !statusFilter ? (
                        <div className="space-y-2">
                          <p>มี {hiddenCount} บัญชีที่ซ่อนอยู่</p>
                          <button
                            type="button"
                            onClick={() => setShowHidden(true)}
                            className="inline-flex items-center gap-1 rounded-lg bg-ll-primary px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
                          >
                            <Eye size={14} />
                            แสดงบัญชีที่ซ่อน
                          </button>
                        </div>
                      ) : accounts.length === 0 && (query || zoneFilter) ? (
                        <div className="space-y-2">
                          <p>ไม่พบบัญชีตาม filter</p>
                          <button
                            type="button"
                            onClick={() => { setSearch(""); setQuery(""); setZoneFilter(""); setStatusFilter(""); }}
                            className="text-[12px] text-ll-primary underline"
                          >
                            ล้าง filter ทั้งหมด
                          </button>
                        </div>
                      ) : statusFilter && accounts.length > 0 ? (
                        <div className="space-y-2">
                          <p>ไม่มีบัญชีสถานะ {statusFilter} ในรายการนี้</p>
                          <button
                            type="button"
                            onClick={() => setStatusFilter("")}
                            className="text-[12px] text-ll-primary underline"
                          >
                            ล้าง filter สถานะ
                          </button>
                        </div>
                      ) : (
                        "ยังไม่มีบัญชี"
                      )}
                    </td>
                  </tr>
                )}
                {pageAccounts.map((account) => {
                  const otpLive = otpCache[account.id];
                  const isRevealed = Boolean(otpRevealed[account.id]);
                  const displayOtp = isRevealed ? otpLive?.otp : "";
                  const displaySeconds = isRevealed ? otpLive?.otpSecondsLeft : null;
                  const otpError = isRevealed ? otpLive?.otpError : "";
                  const otpDuplicate = Boolean(
                    displayOtp
                    && displayAccounts.some(
                      (other) => other.id !== account.id
                        && otpRevealed[other.id]
                        && otpCache[other.id]?.otp === displayOtp
                    )
                  );
                  const isSelected = selectedIds.has(account.id);
                  return (
                  <tr key={account.id} className={`border-b border-ll-hairline last:border-0 hover:bg-ll-surface-2/60 ${account.hidden ? "bg-ll-surface-2/40 opacity-70" : ""} ${isSelected ? "bg-ll-primary-subtle-bg/30" : ""}`}>
                    {canEdit && (
                      <td className="px-2 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(account.id)}
                          className="h-3.5 w-3.5 rounded border-ll-hairline-strong"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-ll-ink">
                      {account.email}
                      {account.hidden && (
                        <span className="ml-2 rounded bg-ll-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-ll-ink-tertiary">ซ่อน</span>
                      )}
                    </td>
                    <td className="px-3 py-3"><RazerZoneBadge zone={account.zone} /></td>
                    <td className="px-3 py-3">
                      <RazerStatusBadge status={account.status} inUseBy={account.inUseBy} />
                    </td>
                    <td className="px-3 py-3">
                      {isRevealed ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`font-mono text-[13px] font-semibold ${displaySeconds === 0 ? "text-red-500" : "text-ll-primary"}`}>
                            {displayOtp || (otpBusyId === account.id ? "…" : "—")}
                          </span>
                          {displayOtp && displaySeconds != null && (
                            <span className={`text-[10px] ${displaySeconds <= 5 ? "text-red-500" : "text-ll-ink-tertiary"}`}>
                              {displaySeconds}s
                            </span>
                          )}
                          <button
                            type="button"
                            title="ดึง OTP จาก api-system"
                            onClick={() => fetchOtpForAccount(account, { forceExternal: true })}
                            className="rounded p-1 text-ll-ink-subtle hover:bg-ll-surface-2 hover:text-ll-ink"
                          >
                            {otpBusyId === account.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                          </button>
                          <button
                            type="button"
                            title="ซ่อน OTP"
                            onClick={() => hideOtp(account.id)}
                            className="rounded p-1 text-ll-ink-subtle hover:bg-ll-surface-2 hover:text-ll-ink"
                          >
                            <EyeOff size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => revealOtp(account)}
                          disabled={otpBusyId === account.id}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          {otpBusyId === account.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                          ดู OTP
                        </button>
                      )}
                      {isRevealed && otpError && (
                        <p className="mt-0.5 text-[10px] text-red-500">{otpError}</p>
                      )}
                      {isRevealed && otpRefreshedAt[account.id] && Date.now() - otpRefreshedAt[account.id] < 2500 && (
                        <p className="mt-0.5 text-[10px] text-emerald-600">อัปเดตจาก api-system แล้ว</p>
                      )}
                      {isRevealed && otpKeyEditId !== account.id && (
                        <p className="mt-0.5 text-[10px] text-ll-ink-tertiary">
                          key:{" "}
                          {canEdit ? (
                            <button
                              type="button"
                              title="คลิกเพื่อเปลี่ยน key แล้วยิง api-system"
                              onClick={() => startOtpKeyEdit(account)}
                              className="font-mono underline decoration-dotted underline-offset-2 hover:text-ll-primary"
                            >
                              {otpLive?.totpKeyUsed || account.totpKey || "—"}
                            </button>
                          ) : (
                            <span className="font-mono">{otpLive?.totpKeyUsed || account.totpKey || "—"}</span>
                          )}
                          {otpLive?.otpSource ? ` · ${otpLive.otpSource}` : ""}
                        </p>
                      )}
                      {isRevealed && otpKeyEditId === account.id && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-ll-ink-tertiary">key:</span>
                          <input
                            type="text"
                            value={otpKeyDraft}
                            onChange={(e) => setOtpKeyDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveOtpKeyAndFetch(account);
                              if (e.key === "Escape") setOtpKeyEditId(null);
                            }}
                            disabled={otpKeySaving}
                            className={`${profitInputClass} w-32 px-1.5 py-0.5 font-mono text-[10px]`}
                            placeholder="inblackcad5e"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveOtpKeyAndFetch(account)}
                            disabled={otpKeySaving}
                            className="rounded bg-ll-primary px-1.5 py-0.5 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-60"
                          >
                            {otpKeySaving ? "…" : "ดึง OTP"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setOtpKeyEditId(null)}
                            disabled={otpKeySaving}
                            className="rounded px-1 py-0.5 text-[10px] text-ll-ink-tertiary hover:bg-ll-surface-2"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      )}
                      {isRevealed && otpDuplicate && (
                        <p className="mt-0.5 text-[10px] font-medium text-amber-600">
                          OTP ซ้ำกับบัญชีอื่น — ตรวจ Secret ใน api-system ว่าแยก key แล้ว
                        </p>
                      )}
                      {!isRevealed && account.totpKey && (
                        <p className="mt-0.5 text-[10px] text-ll-ink-tertiary">
                          key:{" "}
                          {canEdit ? (
                            <button
                              type="button"
                              title="คลิกเพื่อเปลี่ยน key"
                              onClick={() => startOtpKeyEdit(account)}
                              className="font-mono underline decoration-dotted underline-offset-2 hover:text-ll-primary"
                            >
                              {account.totpKey}
                            </button>
                          ) : (
                            <span className="font-mono">{account.totpKey}</span>
                          )}
                        </p>
                      )}
                      {!isRevealed && otpKeyEditId === account.id && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-ll-ink-tertiary">key:</span>
                          <input
                            type="text"
                            value={otpKeyDraft}
                            onChange={(e) => setOtpKeyDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveOtpKeyAndFetch(account);
                              if (e.key === "Escape") setOtpKeyEditId(null);
                            }}
                            disabled={otpKeySaving}
                            className={`${profitInputClass} w-32 px-1.5 py-0.5 font-mono text-[10px]`}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveOtpKeyAndFetch(account)}
                            disabled={otpKeySaving}
                            className="rounded bg-ll-primary px-1.5 py-0.5 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-60"
                          >
                            {otpKeySaving ? "…" : "ดึง OTP"}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-amber-600">{fmtGold(account.goldBalance)}</p>
                      <p className="text-[11px] text-emerald-600">≈ {fmtMoney(account.goldThb)}</p>
                    </td>
                    <td className="px-3 py-3 text-ll-ink-subtle">{fmtSilver(account.silverBalance)}</td>
                    <td className="px-3 py-3 text-ll-ink-subtle">{fmtDate(account.lastSyncedAt || account.updatedAt)}</td>
                    {canEdit && (
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          title={account.botEnabled ? "ปิด Bot API" : "เปิด Bot API"}
                          onClick={() => handleToggleBotEnabled(account)}
                          disabled={busyId === account.id}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            account.botEnabled
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "bg-ll-surface-2 text-ll-ink-tertiary hover:bg-ll-surface-2"
                          } disabled:opacity-50`}
                        >
                          {account.botEnabled ? "ON" : "OFF"}
                        </button>
                      </td>
                    )}
                    {canEdit && (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="แก้ไขบัญชี"
                            onClick={() => openEditAccount(account)}
                            className="rounded p-1.5 text-ll-ink-subtle hover:bg-ll-surface-2 hover:text-ll-ink"
                            disabled={busyId === account.id}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            title="ตั้งค่า OTP (ชื่อ key / 2FA Secret)"
                            onClick={() => openTfaEditor(account)}
                            className={`rounded p-1.5 hover:bg-ll-surface-2 ${
                              account.hasTfa ? "text-ll-ink-subtle hover:text-ll-ink" : "text-amber-600 hover:bg-amber-50"
                            }`}
                            disabled={busyId === account.id}
                          >
                            <Shield size={14} />
                          </button>
                          <button
                            type="button"
                            title="ดึงยอดจาก Razer"
                            onClick={() => handleSyncBalance(account)}
                            className="rounded p-1.5 text-ll-ink-subtle hover:bg-ll-surface-2 hover:text-ll-ink"
                            disabled={busyId === account.id}
                          >
                            {busyId === account.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                          </button>
                          <button
                            type="button"
                            title="ดูรหัสผ่าน"
                            onClick={() => handleShowCredentials(account.id)}
                            className="rounded p-1.5 text-ll-ink-subtle hover:bg-ll-surface-2 hover:text-ll-ink"
                            disabled={busyId === account.id}
                          >
                            <Key size={14} />
                          </button>
                          <button
                            type="button"
                            title={account.hidden ? "แสดง" : "ซ่อน"}
                            onClick={() => handleToggleHidden(account)}
                            className="rounded p-1.5 text-ll-ink-subtle hover:bg-ll-surface-2 hover:text-ll-ink"
                            disabled={busyId === account.id}
                          >
                            {account.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                          <button
                            type="button"
                            title="ลบ"
                            onClick={() => handleDelete(account.id)}
                            className="rounded p-1.5 text-red-500 hover:bg-red-50"
                            disabled={busyId === account.id}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && displayAccounts.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ll-hairline px-4 py-3">
            <span className="text-[12px] text-ll-ink-subtle">
              {displayAccounts.length} บัญชี · หน้า {safePage}/{totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-ll-hairline px-2.5 py-1.5 text-[12px] text-ll-ink hover:bg-ll-surface-2 disabled:opacity-40"
              >
                ก่อนหน้า
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-ll-hairline px-2.5 py-1.5 text-[12px] text-ll-ink hover:bg-ll-surface-2 disabled:opacity-40"
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </section>

      {addOpen && (
        <ProfitModal
          title="เพิ่มบัญชี Razer"
          onClose={() => !adding && setAddOpen(false)}
          actions={
            <button
              type="button"
              onClick={handleAddAccount}
              disabled={adding}
              className="inline-flex items-center gap-1.5 rounded-md bg-ll-primary px-3.5 py-2 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {adding && <Loader2 size={13} className="animate-spin" />}
              บันทึก
            </button>
          }
        >
          {addError && <p className="text-[12px] text-red-600">{addError}</p>}
          <ProfitField label="วางข้อมูลอัตโนมัติ (บรรทัดเดียวหรือหลายบรรทัด)">
            <textarea
              value={pasteLine}
              onChange={(e) => {
                const v = e.target.value;
                setPasteLine(v);
                if (v.includes("@") && !v.includes("\n") && applyPasteToForm(v)) {
                  /* single-line paste typed or pasted */
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData?.getData("text");
                if (!text) return;
                if (applyPasteToForm(text)) {
                  e.preventDefault();
                  return;
                }
                if (text.includes("\n") && parseRazerImportText(text).rows.length > 1) {
                  e.preventDefault();
                  setAddOpen(false);
                  handleImportText(text);
                }
              }}
              rows={2}
              placeholder="Email | Password | 2FA | CAD | 30"
              className={`${profitInputClass} min-h-[56px] resize-y py-2`}
            />
            <p className="mt-1 text-[11px] font-normal text-ll-ink-tertiary">
              วางแล้วระบบเติมฟอร์มให้อัตโนมัติ · หลายบรรทัดจะนำเข้าทันที · กดบันทึกได้เลยแม้ยังเห็นข้อความในช่องนี้
            </p>
          </ProfitField>
          <ProfitField label="Email *">
            <input
              type="email"
              value={addForm.email}
              onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
              className={profitInputClass}
              placeholder="user@example.com"
            />
          </ProfitField>
          <ProfitField label="Password">
            <input
              type="text"
              value={addForm.password}
              onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
              className={profitInputClass}
              autoComplete="off"
            />
          </ProfitField>
          <ProfitField label="2FA Secret (Google Authenticator)">
            <input
              type="text"
              value={addForm.tfaSecret}
              onChange={(e) => setAddForm((f) => ({ ...f, tfaSecret: e.target.value }))}
              className={profitInputClass}
              autoComplete="off"
              placeholder="Base32 secret — ระบบสร้าง OTP 6 หลักให้อัตโนมัติ"
            />
            <p className="mt-1 text-[11px] font-normal text-ll-ink-tertiary">
              OTP ที่แสดงในตารางและส่งให้บอท = คำนวณจาก secret นี้ (เปลี่ยนทุก 30 วินาที)
            </p>
          </ProfitField>
          <div className="grid grid-cols-2 gap-3">
            <ProfitField label="Zone">
              <select
                value={addForm.zone}
                onChange={(e) => setAddForm((f) => ({ ...f, zone: e.target.value }))}
                className={profitInputClass}
              >
                {RAZER_ZONES.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </ProfitField>
            <ProfitField label="Rate (THB/G)">
              <input
                type="number"
                step="0.01"
                value={addForm.rate}
                onChange={(e) => setAddForm((f) => ({ ...f, rate: e.target.value }))}
                className={profitInputClass}
                placeholder="30"
              />
            </ProfitField>
          </div>
          <ProfitField label="Status">
            <select
              value={addForm.status}
              onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}
              className={profitInputClass}
            >
              {RAZER_STATUSES.map((s) => (
                <option key={s} value={s}>{RAZER_STATUS_LABELS[s] || s}</option>
              ))}
            </select>
          </ProfitField>
          <div className="grid grid-cols-2 gap-3">
            <ProfitField label="Razer Gold (G)">
              <input
                type="number"
                step="0.01"
                value={addForm.goldBalance}
                onChange={(e) => setAddForm((f) => ({ ...f, goldBalance: e.target.value }))}
                className={profitInputClass}
                placeholder="0"
              />
            </ProfitField>
            <ProfitField label="Razer Silver">
              <input
                type="number"
                step="1"
                value={addForm.silverBalance}
                onChange={(e) => setAddForm((f) => ({ ...f, silverBalance: e.target.value }))}
                className={profitInputClass}
                placeholder="0"
              />
            </ProfitField>
          </div>
        </ProfitModal>
      )}

      {tfaEdit && (
        <ProfitModal
          title={`ตั้งค่า OTP — ${tfaEdit.email}`}
          onClose={() => !tfaSaving && setTfaEdit(null)}
          actions={
            <button
              type="button"
              onClick={handleSaveTfaSecret}
              disabled={tfaSaving}
              className="inline-flex items-center gap-1.5 rounded-md bg-ll-primary px-3.5 py-2 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {tfaSaving && <Loader2 size={13} className="animate-spin" />}
              บันทึก
            </button>
          }
        >
          {tfaError && <p className="text-[12px] text-red-600">{tfaError}</p>}
          <p className="text-[12px] text-ll-ink-subtle">
            <strong>OTP ซ้ำทุกบัญชี?</strong> วิธีแก้ (เลือกอย่างใดอย่างหนึ่ง):
          </p>
          <ol className="list-decimal space-y-1 pl-4 text-[12px] text-ll-ink-subtle">
            <li>
              <strong>api-system</strong> — เพิ่ม key แยก (เช่น <code className="rounded bg-ll-surface-2 px-1">inblackcad5e</code>)
              แล้วใส่ Secret ของบัญชีนั้น (ไม่ใช่ Secret เดียวกับบัญชีอื่น)
            </li>
            <li>
              <strong>Shield ที่นี่</strong> — วาง Base32 Secret ของบัญชีนี้ด้านล่าง ระบบจะคำนวณ OTP เอง (ไม่พึ่ง api-system)
            </li>
          </ol>
          <ProfitField label="ชื่อ Key ใน api-system">
            <input
              type="text"
              value={totpKeyValue}
              onChange={(e) => setTotpKeyValue(e.target.value)}
              className={`${profitInputClass} font-mono text-[12px]`}
              placeholder="auto จากอีเมล"
              autoFocus
            />
            <p className="mt-1 text-[11px] font-normal text-ll-ink-tertiary">
              ต้องตรงกับ「ชื่อใน URL (?key=)」ใน api-system
            </p>
          </ProfitField>
          <ProfitField label="2FA Secret (ไม่บังคับ — ถ้าไม่ใช้ api-system)">
            <textarea
              value={tfaValue}
              onChange={(e) => setTfaValue(e.target.value)}
              rows={3}
              className={`${profitInputClass} min-h-[72px] resize-y py-2 font-mono text-[12px]`}
              placeholder="Base32 หรือ otpauth://... — ถ้าว่างจะดึง OTP จาก api-system"
            />
          </ProfitField>
        </ProfitModal>
      )}

      {editAccount && (
        <ProfitModal
          title={`แก้ไขบัญชี — ${editAccount.email}`}
          onClose={() => !editSaving && setEditAccount(null)}
          actions={
            <button
              type="button"
              onClick={handleSaveEditAccount}
              disabled={editSaving}
              className="inline-flex items-center gap-1.5 rounded-md bg-ll-primary px-3.5 py-2 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {editSaving && <Loader2 size={13} className="animate-spin" />}
              บันทึก
            </button>
          }
        >
          {editError && <p className="text-[12px] text-red-600">{editError}</p>}
          {isRazerBusyStatus(editAccount.status) && editAccount.inUseBy && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              {RAZER_STATUS_LABELS[editAccount.status] || editAccount.status} โดย <strong>{editAccount.inUseBy}</strong>
              {editAccount.inUseOrderId ? ` · order ${editAccount.inUseOrderId}` : ""}
              {" "}— เปลี่ยนสถานะอื่นจะปล่อยบัญชี (clear in_use)
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <ProfitField label="Zone">
              <select
                value={editForm.zone}
                onChange={(e) => setEditForm((f) => ({ ...f, zone: e.target.value }))}
                className={profitInputClass}
              >
                {RAZER_ZONES.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </ProfitField>
            <ProfitField label="Rate (THB/G)">
              <input
                type="number"
                step="0.01"
                value={editForm.rate}
                onChange={(e) => setEditForm((f) => ({ ...f, rate: e.target.value }))}
                className={profitInputClass}
              />
            </ProfitField>
          </div>
          <ProfitField label="Status">
            <select
              value={editForm.status}
              onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
              className={profitInputClass}
            >
              {RAZER_STATUSES.map((s) => (
                <option key={s} value={s}>{RAZER_STATUS_LABELS[s] || s}</option>
              ))}
            </select>
          </ProfitField>
          <div className="grid grid-cols-2 gap-3">
            <ProfitField label="Razer Gold (G)">
              <input
                type="number"
                step="0.01"
                value={editForm.goldBalance}
                onChange={(e) => setEditForm((f) => ({ ...f, goldBalance: e.target.value }))}
                className={profitInputClass}
              />
            </ProfitField>
            <ProfitField label="Razer Silver">
              <input
                type="number"
                step="1"
                value={editForm.silverBalance}
                onChange={(e) => setEditForm((f) => ({ ...f, silverBalance: e.target.value }))}
                className={profitInputClass}
              />
            </ProfitField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ProfitField label="Bot API">
              <select
                value={editForm.botEnabled ? "true" : "false"}
                onChange={(e) => setEditForm((f) => ({ ...f, botEnabled: e.target.value === "true" }))}
                className={profitInputClass}
              >
                <option value="true">ON</option>
                <option value="false">OFF</option>
              </select>
            </ProfitField>
            <ProfitField label="ซ่อนรายการ">
              <select
                value={editForm.hidden ? "true" : "false"}
                onChange={(e) => setEditForm((f) => ({ ...f, hidden: e.target.value === "true" }))}
                className={profitInputClass}
              >
                <option value="false">แสดง</option>
                <option value="true">ซ่อน</option>
              </select>
            </ProfitField>
          </div>
        </ProfitModal>
      )}

      {bulkOpen && (
        <ProfitModal
          title={`แก้ไขกลุ่ม (${selectedVisibleCount} บัญชี)`}
          onClose={() => !bulkSaving && setBulkOpen(false)}
          actions={
            <button
              type="button"
              onClick={handleBulkSave}
              disabled={bulkSaving}
              className="inline-flex items-center gap-1.5 rounded-md bg-ll-primary px-3.5 py-2 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {bulkSaving && <Loader2 size={13} className="animate-spin" />}
              อัปเดตทั้งหมด
            </button>
          }
        >
          {bulkError && <p className="text-[12px] text-red-600">{bulkError}</p>}
          <p className="text-[12px] text-ll-ink-subtle">
            เลือกเฉพาะฟิลด์ที่ต้องการเปลี่ยน — ค่า「ไม่เปลี่ยน」จะไม่ถูกแตะ (ไม่รวม email / password)
          </p>
          <ProfitField label="Zone">
            <select
              value={bulkForm.zone}
              onChange={(e) => setBulkForm((f) => ({ ...f, zone: e.target.value }))}
              className={profitInputClass}
            >
              <option value="">— ไม่เปลี่ยน —</option>
              {RAZER_ZONES.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </ProfitField>
          <ProfitField label="Status">
            <select
              value={bulkForm.status}
              onChange={(e) => setBulkForm((f) => ({ ...f, status: e.target.value }))}
              className={profitInputClass}
            >
              <option value="">— ไม่เปลี่ยน —</option>
              {RAZER_STATUSES.map((s) => (
                <option key={s} value={s}>{RAZER_STATUS_LABELS[s] || s}</option>
              ))}
            </select>
          </ProfitField>
          {isRazerBusyStatus(bulkForm.status) && (
            <p className="text-[11px] text-amber-700">
              ⚠ ตั้งสถานะกำลังส่งเติมแบบกลุ่มไม่แนะนำ — บอทควร claim เองตอนสั่งเติม
            </p>
          )}
          <ProfitField label="Rate (THB/G)">
            <input
              type="number"
              step="0.01"
              value={bulkForm.rate}
              onChange={(e) => setBulkForm((f) => ({ ...f, rate: e.target.value }))}
              className={profitInputClass}
              placeholder="— ไม่เปลี่ยน —"
            />
          </ProfitField>
          <div className="grid grid-cols-2 gap-3">
            <ProfitField label="Bot API">
              <select
                value={bulkForm.botEnabled}
                onChange={(e) => setBulkForm((f) => ({ ...f, botEnabled: e.target.value }))}
                className={profitInputClass}
              >
                <option value="">— ไม่เปลี่ยน —</option>
                <option value="true">ON</option>
                <option value="false">OFF</option>
              </select>
            </ProfitField>
            <ProfitField label="ซ่อนรายการ">
              <select
                value={bulkForm.hidden}
                onChange={(e) => setBulkForm((f) => ({ ...f, hidden: e.target.value }))}
                className={profitInputClass}
              >
                <option value="">— ไม่เปลี่ยน —</option>
                <option value="false">แสดง</option>
                <option value="true">ซ่อน</option>
              </select>
            </ProfitField>
          </div>
        </ProfitModal>
      )}
    </div>
  );
}
