"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Image as ImageIcon } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import {
  buildGameinfoStatusUpdate,
  buildGameinfoUpdate,
  listChangedGameinfoImages,
  updateGameinfoImage,
} from "@/lib/gameinfo-game-manager";
import GameinfoNameInput from "./gameinfo-name-input";
import GameinfoImagePickerModal from "./gameinfo-image-picker-modal";
import GameinfoTutorialButton from "./gameinfo-tutorial-modal";
import { GameinfoGameLinksButton } from "./gameinfo-game-links";
import GameinfoTagsInput from "./gameinfo-tags-input";
import { useGameinfoUnsavedChanges } from "@/lib/gameinfo-unsaved-changes";

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
  return row.serviceEnabled === false ? "offline" : "online";
}

async function saveImageChanges(url, savedImages, images, fallbackError) {
  for (const { name, imageUrl } of listChangedGameinfoImages(savedImages, images)) {
    await apiJson(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, imageUrl }),
      fallbackError,
    });
  }
}

export default function GameinfoGameManager({ row, existingNames, tagSuggestions, publisherSuggestions, dataMode = "uid" }) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => fieldsFromRow(row));
  const [draft, setDraft] = useState(() => fieldsFromRow(row));
  const [savedImage, setSavedImage] = useState(row.image || "");
  const [image, setImage] = useState(row.image || "");
  const [savedStatus, setSavedStatus] = useState(() => statusFromRow(row));
  const [status, setStatus] = useState(() => statusFromRow(row));
  const [links, setLinks] = useState(row.links || []);
  const [savedTags, setSavedTags] = useState(row.tags || []);
  const [tags, setTags] = useState(row.tags || []);
  const [savedTagImages, setSavedTagImages] = useState(row.tagImages || {});
  const [tagImages, setTagImages] = useState(row.tagImages || {});
  const [savedPublishers, setSavedPublishers] = useState(row.publishers || []);
  const [publishers, setPublishers] = useState(row.publishers || []);
  const [savedPublisherImages, setSavedPublisherImages] = useState(row.publisherImages || {});
  const [publisherImages, setPublisherImages] = useState(row.publisherImages || {});
  const [duplicate, setDuplicate] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || image !== savedImage || status !== savedStatus || JSON.stringify(tags) !== JSON.stringify(savedTags) || JSON.stringify(publishers) !== JSON.stringify(savedPublishers) || JSON.stringify(tagImages) !== JSON.stringify(savedTagImages) || JSON.stringify(publisherImages) !== JSON.stringify(savedPublisherImages);
  useGameinfoUnsavedChanges(dirty);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setNotice("");
  }

  function cancel() {
    setDraft(saved);
    setImage(savedImage);
    setStatus(savedStatus);
    setTags(savedTags);
    setTagImages(savedTagImages);
    setPublishers(savedPublishers);
    setPublisherImages(savedPublisherImages);
    setError("");
    setNotice("");
  }

  function saveTagImage(name, imageUrl) {
    setTagImages((current) => updateGameinfoImage(current, name, imageUrl));
    setNotice("");
  }

  function savePublisherImage(name, imageUrl) {
    setPublisherImages((current) => updateGameinfoImage(current, name, imageUrl));
    setNotice("");
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
      if (JSON.stringify(tags) !== JSON.stringify(savedTags)) {
        const data = await apiJson(`/api/gameinfo/gamelist/${row.id}/tags`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags }),
          fallbackError: "บันทึก tags เกมไม่สำเร็จ",
        });
        setTags(data.tags);
        setSavedTags(data.tags);
      }
      if (JSON.stringify(publishers) !== JSON.stringify(savedPublishers)) {
        const data = await apiJson(`/api/gameinfo/gamelist/${row.id}/publishers`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publishers }),
          fallbackError: "บันทึกค่ายเกมไม่สำเร็จ",
        });
        setPublishers(data.publishers);
        setSavedPublishers(data.publishers);
      }
      await saveImageChanges("/api/gameinfo/tags", savedTagImages, tagImages, "บันทึกรูปหมวดหมู่ไม่สำเร็จ");
      await saveImageChanges("/api/gameinfo/publishers", savedPublisherImages, publisherImages, "บันทึกรูปค่ายเกมไม่สำเร็จ");
      setSaved(draft);
      setSavedStatus(status);
      setSavedImage(image);
      setSavedTagImages(tagImages);
      setSavedPublisherImages(publisherImages);
      setNotice("บันทึกเรียบร้อย");
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
          {notice ? (
            <span className="flex items-center gap-1.5 text-xs text-linear-success" role="status">
              <CheckCircle2 size={15} aria-hidden="true" /> {notice}
            </span>
          ) : null}
          <button type="button" onClick={cancel} disabled={!dirty || saving} className="h-10 rounded-lg border border-linear-hairline-strong px-4 text-sm text-linear-ink-muted disabled:opacity-40">ยกเลิก</button>
          <button type="submit" form="gameinfo-manage-form" disabled={!dirty || duplicate || saving} className="h-10 rounded-lg bg-linear-primary px-4 text-sm font-medium text-white hover:bg-linear-primary-hover disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
              <option value="offline">ปิดใช้งาน</option>
            </select>
          </Field>
          <Field label="Region"><input value={draft.region} onChange={(event) => update("region", event.target.value)} className={inputClass} /></Field>
          <Field label="Platform"><input value={draft.platform} onChange={(event) => update("platform", event.target.value)} className={inputClass} /></Field>
          <Field label="Server"><input value={draft.server} onChange={(event) => update("server", event.target.value)} className={inputClass} /></Field>
          <Field label="Bot / Manual"><input value={draft.botManual} onChange={(event) => update("botManual", event.target.value)} className={inputClass} /></Field>
          <Field label="หมวดหมู่">
            <GameinfoTagsInput
              values={tags}
              onChange={setTags}
              suggestions={tagSuggestions}
              placeholder="เพิ่มหมวดหมู่แล้วกด Enter"
              max={10}
              neutral
              tagImages={tagImages}
              onTagImageChange={saveTagImage}
            />
          </Field>
          <Field label="ค่ายเกม">
            <GameinfoTagsInput
              values={publishers}
              onChange={setPublishers}
              suggestions={publisherSuggestions}
              placeholder="เพิ่มค่ายเกมแล้วกด Enter"
              max={10}
              neutral
              tagImages={publisherImages}
              onTagImageChange={savePublisherImage}
              imageLabel="ค่ายเกม"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-5">
            <span className="mr-1 text-xs font-medium text-linear-ink-tertiary">เนื้อหาและลิงก์</span>
            <GameinfoGameLinksButton gameId={row.id} gameName={draft.game} links={links} editable dataMode={dataMode} onSaved={setLinks} />
            <GameinfoTutorialButton gameId={row.id} gameName={draft.game} editable hasData={row.hasTutorial} dataMode={dataMode} />
            <GameinfoTutorialButton gameId={row.id} gameName={draft.game} editable hasData={row.hasWarning} variant="warning" dataMode={dataMode} />
            <span className="text-xs text-linear-ink-tertiary">ส่วนนี้บันทึกทันทีในหน้าต่างของตัวเอง</span>
          </div>
        </div>
      </form>

      {duplicate ? <p role="alert" className="mt-3 text-xs text-linear-danger">มีเกมชื่อนี้อยู่แล้ว กรุณาใช้ชื่ออื่น</p> : null}
      {error ? <p role="alert" className="mt-3 text-xs text-linear-danger">{error}</p> : null}

      {pickerOpen ? <GameinfoImagePickerModal value={image} onChange={setImage} onClose={() => setPickerOpen(false)} /> : null}
    </section>
  );
}

function Field({ label, wide, children }) {
  return (
    <label className={wide ? "sm:col-span-2 xl:col-span-3" : ""}>
      <span className="mb-1.5 block text-xs font-medium text-linear-ink-subtle">{label}</span>
      {children}
    </label>
  );
}
