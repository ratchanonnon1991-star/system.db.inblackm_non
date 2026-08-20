"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { buildGameinfoStatusUpdate, buildGameinfoUpdate } from "@/lib/gameinfo-game-manager";
import GameinfoNameInput from "./gameinfo-name-input";
import GameinfoImagePickerModal from "./gameinfo-image-picker-modal";
import GameinfoTutorialButton from "./gameinfo-tutorial-modal";
import { GameinfoGameLinksButton } from "./gameinfo-game-links";

function fieldsFromRow(row) {
  return {
    game: row.game || "",
    region: row.region || "",
    platform: row.platform || "",
    server: row.server || "",
    botManual: row.botManual || "",
  };
}

function statusFromRow(row) {
  return row.serviceNew ? "new" : row.serviceEnabled === false ? "offline" : "online";
}

export default function GameinfoGameManager({ row, existingNames, dataMode = "uid" }) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => fieldsFromRow(row));
  const [draft, setDraft] = useState(() => fieldsFromRow(row));
  const [savedImage, setSavedImage] = useState(row.image || "");
  const [image, setImage] = useState(row.image || "");
  const [savedStatus, setSavedStatus] = useState(() => statusFromRow(row));
  const [status, setStatus] = useState(() => statusFromRow(row));
  const [links, setLinks] = useState(row.links || []);
  const [duplicate, setDuplicate] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || image !== savedImage || status !== savedStatus;

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setNotice("");
  }

  function cancel() {
    setDraft(saved);
    setImage(savedImage);
    setStatus(savedStatus);
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    if (!dirty || duplicate || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const modeQuery = dataMode === "idpass" ? "?mode=idpass" : "";
    try {
      if (JSON.stringify(draft) !== JSON.stringify(saved)) {
        await apiJson(`/api/gameinfo/gamelist/${row.id}${modeQuery}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildGameinfoUpdate(draft, dataMode)),
          fallbackError: "บันทึกข้อมูลเกมไม่สำเร็จ",
        });
      }
      if (status !== savedStatus) {
        await apiJson("/api/gameinfo/gamelist/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameIds: [row.id], ...buildGameinfoStatusUpdate(status) }),
          fallbackError: "บันทึกสถานะเกมไม่สำเร็จ",
        });
      }
      if (image !== savedImage) {
        await apiJson(`/api/gameinfo/gamelist/${row.id}/image`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: image }),
          fallbackError: "บันทึกรูปเกมไม่สำเร็จ",
        });
      }
      setSaved(draft);
      setSavedStatus(status);
      setSavedImage(image);
      setNotice("บันทึกแล้ว");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกข้อมูลเกมไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "h-10 w-full rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none focus:border-linear-primary focus:ring-2 focus:ring-linear-primary/20";

  return (
    <section className="mb-8 rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5" style={{ boxShadow: "var(--ll-shadow-card)" }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-linear-ink-tertiary">MANAGE GAME</p>
          <h1 className="text-xl font-semibold tracking-[-0.3px] text-linear-ink">จัดการข้อมูลเกม</h1>
        </div>
        <div className="flex items-center gap-2">
          {notice ? <span className="text-xs text-emerald-700">{notice}</span> : null}
          <button type="button" onClick={cancel} disabled={!dirty || saving} className="h-10 rounded-lg border border-linear-hairline-strong px-4 text-sm text-linear-ink-muted disabled:opacity-40">ยกเลิก</button>
          <button type="submit" form="gameinfo-manage-form" disabled={!dirty || duplicate || saving} className="h-10 rounded-lg bg-linear-ink px-4 text-sm font-medium text-linear-canvas disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      </div>

      <form id="gameinfo-manage-form" onSubmit={save} className="grid gap-5 lg:grid-cols-[160px_minmax(0,1fr)]">
        <div>
          <button type="button" onClick={() => setPickerOpen(true)} className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-linear-hairline bg-linear-surface-2" aria-label="เปลี่ยนรูปเกม">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-full w-full object-cover" />
            ) : <ImageIcon size={28} className="text-linear-ink-tertiary" />}
          </button>
          <button type="button" onClick={() => setPickerOpen(true)} className="mt-2 h-10 w-full rounded-lg border border-linear-hairline-strong text-xs text-linear-ink-muted hover:bg-linear-surface-2">เปลี่ยนรูป</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="ชื่อเกม" wide>
            {dataMode === "idpass" ? (
              <input value={draft.game} disabled className={`${inputClass} bg-linear-surface-2 opacity-70`} />
            ) : (
              <GameinfoNameInput value={draft.game} onChange={(value) => update("game", value)} existingNames={existingNames} onDuplicateChange={setDuplicate} className={inputClass} />
            )}
          </Field>
          <Field label="สถานะบริการ">
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}>
              <option value="online">พร้อมใช้งาน</option>
              <option value="new">เกมใหม่</option>
              <option value="offline">ปิดใช้งาน</option>
            </select>
          </Field>
          <Field label="Region"><input value={draft.region} onChange={(event) => update("region", event.target.value)} className={inputClass} /></Field>
          <Field label="Platform"><input value={draft.platform} onChange={(event) => update("platform", event.target.value)} className={inputClass} /></Field>
          <Field label="Server"><input value={draft.server} onChange={(event) => update("server", event.target.value)} className={inputClass} /></Field>
          <Field label="Bot / Manual"><input value={draft.botManual} onChange={(event) => update("botManual", event.target.value)} className={inputClass} /></Field>
        </div>
      </form>

      {duplicate ? <p role="alert" className="mt-3 text-xs text-linear-primary">มีเกมชื่อนี้อยู่แล้ว กรุณาใช้ชื่ออื่น</p> : null}
      {error ? <p role="alert" className="mt-3 text-xs text-linear-primary">{error}</p> : null}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-linear-hairline pt-4">
        <span className="mr-1 text-xs font-medium text-linear-ink-tertiary">เนื้อหาและลิงก์</span>
        <GameinfoGameLinksButton gameId={row.id} gameName={draft.game} links={links} editable dataMode={dataMode} onSaved={setLinks} />
        <GameinfoTutorialButton gameId={row.id} gameName={draft.game} editable hasData={row.hasTutorial} dataMode={dataMode} />
        <GameinfoTutorialButton gameId={row.id} gameName={draft.game} editable hasData={row.hasWarning} variant="warning" dataMode={dataMode} />
        <span className="text-xs text-linear-ink-tertiary">ส่วนนี้บันทึกทันทีในหน้าต่างของตัวเอง</span>
      </div>

      {pickerOpen ? <GameinfoImagePickerModal value={image} onChange={setImage} onClose={() => setPickerOpen(false)} /> : null}
    </section>
  );
}

function Field({ label, wide, children }) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-1.5 block text-xs font-medium text-linear-ink-subtle">{label}</span>
      {children}
    </label>
  );
}
