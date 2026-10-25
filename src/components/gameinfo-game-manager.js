"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Image as ImageIcon, Save } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import {
  buildGameinfoStatusUpdate,
  buildGameinfoUpdate,
  listChangedGameinfoImages,
  saveGameinfoSections,
  updateGameinfoImage,
} from "@/lib/gameinfo-game-manager";
import GameinfoNameInput from "./gameinfo-name-input";
import GameinfoImagePickerModal from "./gameinfo-image-picker-modal";
import GameinfoTutorialButton, { GameinfoDetailsButton } from "./gameinfo-tutorial-modal";
import { GameinfoGameLinksButton } from "./gameinfo-game-links";
import GameinfoTagsInput from "./gameinfo-tags-input";
import { useGameinfoUnsavedChanges } from "@/lib/gameinfo-unsaved-changes";
import { gameinfoGameColor, gameinfoGameInitials } from "@/lib/gameinfo-game-initials";
import { GameinfoManageSection } from "./gameinfo-manage-section";

function fieldsFromRow(row) {
  return {
    game: row.game || "",
    region: row.region || "",
    platform: row.platform || "",
    server: row.server || "",
    botManual: row.botManual || "",
    vpn: row.vpn === "YES" ? "YES" : "NO",
  };
}

function statusFromRow(row) {
  return row.serviceEnabled === false ? "offline" : "online";
}

export default function GameinfoGameManager({ row, existingNames, tagSuggestions, publisherSuggestions, dataMode = "uid", sectionNumbers = null }) {
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
    const steps = [];
    function add(label, url, body, onSaved) {
      steps.push({
        label,
        run: () => apiJson(url, {
          method: url.endsWith("/status") ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          fallbackError: `บันทึก${label}ไม่สำเร็จ`,
        }),
        onSaved,
      });
    }
    const gameUpdate = buildGameinfoUpdate(draft, dataMode);
    if (JSON.stringify(gameUpdate) !== JSON.stringify(buildGameinfoUpdate(saved, dataMode))) {
      add("ข้อมูลเกม", `/api/gameinfo/gamelist/${row.id}${modeQuery}`, gameUpdate,
        () => setSaved((current) => ({ ...current, ...gameUpdate })));
    }
    if (dataMode === "idpass" && draft.vpn !== saved.vpn) {
      add("VPN", `/api/gameinfo/gamelist/${row.id}`, { vpn: draft.vpn },
        () => setSaved((current) => ({ ...current, vpn: draft.vpn })));
    }
    if (status !== savedStatus) {
      add("สถานะเกม", "/api/gameinfo/gamelist/status", { gameIds: [row.id], ...buildGameinfoStatusUpdate(status) },
        () => setSavedStatus(status));
    }
    if (image !== savedImage) {
      add("รูปเกม", `/api/gameinfo/gamelist/${row.id}/image`, { imageUrl: image }, () => setSavedImage(image));
    }
    if (JSON.stringify(tags) !== JSON.stringify(savedTags)) {
      add("หมวดหมู่", `/api/gameinfo/gamelist/${row.id}/tags`, { tags }, (data) => {
        setTags((current) => JSON.stringify(current) === JSON.stringify(tags) ? data.tags : current);
        setSavedTags(data.tags);
      });
    }
    if (JSON.stringify(publishers) !== JSON.stringify(savedPublishers)) {
      add("ค่ายเกม", `/api/gameinfo/gamelist/${row.id}/publishers`, { publishers }, (data) => {
        setPublishers((current) => JSON.stringify(current) === JSON.stringify(publishers) ? data.publishers : current);
        setSavedPublishers(data.publishers);
      });
    }
    for (const { name, imageUrl } of listChangedGameinfoImages(savedTagImages, tagImages)) {
      add(`รูปหมวดหมู่ ${name}`, "/api/gameinfo/tags", { name, imageUrl },
        () => setSavedTagImages((current) => updateGameinfoImage(current, name, imageUrl)));
    }
    for (const { name, imageUrl } of listChangedGameinfoImages(savedPublisherImages, publisherImages)) {
      add(`รูปค่ายเกม ${name}`, "/api/gameinfo/publishers", { name, imageUrl },
        () => setSavedPublisherImages((current) => updateGameinfoImage(current, name, imageUrl)));
    }
    try {
      const result = await saveGameinfoSections(steps);
      if (result.failed) {
        setError(`บันทึก${result.failed}ไม่สำเร็จ: ${result.error instanceof Error ? result.error.message : "เกิดข้อผิดพลาด"} — กดบันทึกอีกครั้งเพื่อบันทึกส่วนที่ยังค้าง`);
        if (result.completed.length) setNotice(`บันทึกแล้ว: ${result.completed.join(", ")}`);
      } else {
        setNotice("บันทึกเรียบร้อย");
      }
      if (result.completed.length) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "h-11 w-full rounded-xl border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none focus:border-[#D90005] focus:ring-2 focus:ring-[#D90005]/20";

  return (
    <>
      <GameinfoManageSection
        id="s-info"
        number={sectionNumbers?.info}
        title="ข้อมูลเกม"
        description="ข้อมูลหลักที่แสดงในคลังเกมและหน้ารายละเอียด"
        actions={(
          <>
            {notice ? (
              <span className="flex items-center gap-1.5 text-xs text-linear-success" role="status">
                <CheckCircle2 size={15} aria-hidden="true" /> {notice}
              </span>
            ) : dirty ? (
              <span className="flex items-center gap-1.5 text-[13px] text-amber-800 dark:text-amber-400">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" /> ยังไม่บันทึก
              </span>
            ) : null}
            <button type="button" onClick={cancel} disabled={!dirty || saving} className="h-11 rounded-xl border border-linear-hairline bg-linear-surface-1 px-[18px] text-sm font-bold text-linear-ink transition hover:bg-linear-surface-2 disabled:opacity-40">ยกเลิก</button>
            <button type="submit" form="gameinfo-manage-form" disabled={!dirty || duplicate || saving} className="flex h-11 items-center gap-2 rounded-xl bg-[#D90005] px-5 text-sm font-extrabold text-white transition hover:bg-[#B80004] disabled:opacity-40">
              <Save size={16} aria-hidden="true" /> {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </>
        )}
      >
        <form id="gameinfo-manage-form" onSubmit={save} className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex w-[140px] flex-col items-center gap-2.5">
              <button type="button" onClick={() => setPickerOpen(true)} className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-[22px]" aria-label="เปลี่ยนรูปเกม">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-[38px] font-black text-white" style={{ background: gameinfoGameColor(row.id) }}>
                    {gameinfoGameInitials(draft.game)}
                  </span>
                )}
              </button>
              <button type="button" onClick={() => setPickerOpen(true)} className="flex h-9 items-center gap-1.5 rounded-[10px] border border-linear-hairline bg-linear-surface-1 px-3 text-[13px] font-bold text-linear-ink transition hover:bg-linear-surface-2">
                <ImageIcon size={14} aria-hidden="true" /> เปลี่ยนรูปเกม
              </button>
            </div>

            <div className="grid min-w-0 flex-[1_1_480px] gap-4 sm:grid-cols-2">
              <Field label="ชื่อเกม" wide>
                {dataMode === "idpass" ? (
                  <input value={draft.game} disabled className={`${inputClass} bg-linear-surface-2 opacity-70`} />
                ) : (
                  <GameinfoNameInput value={draft.game} onChange={(value) => update("game", value)} existingNames={existingNames} onDuplicateChange={setDuplicate} className={inputClass} />
                )}
              </Field>
              <Field label="Region"><input value={draft.region} onChange={(event) => update("region", event.target.value)} className={inputClass} /></Field>
              <Field label="Server"><input value={draft.server} onChange={(event) => update("server", event.target.value)} className={inputClass} /></Field>
              <Field label="Platform"><input value={draft.platform} onChange={(event) => update("platform", event.target.value)} className={inputClass} /></Field>
              <Field label="ระบบการเติม (Bot / Manual)"><input value={draft.botManual} onChange={(event) => update("botManual", event.target.value)} className={inputClass} /></Field>
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
              <Field label="ประเภทเกม (หมวดหมู่)">
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
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
              <span id="gameinfo-service-label" className="text-[13px] font-bold text-linear-ink-muted">สถานะบริการ</span>
              <div role="group" aria-labelledby="gameinfo-service-label" className="flex gap-1 rounded-xl bg-linear-surface-3 p-1">
                {SERVICE_OPTIONS.map((option) => {
                  const active = status === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStatus(option.value)}
                      className={`flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-[9px] px-3 text-[13px] font-extrabold transition ${active ? "bg-linear-surface-1 text-linear-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-linear-ink-muted hover:text-linear-ink"}`}
                    >
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${option.dot}`} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.vpn === "YES"}
              onClick={() => update("vpn", draft.vpn === "YES" ? "NO" : "YES")}
              className="flex h-[46px] items-center gap-2.5 rounded-xl border border-linear-hairline bg-linear-surface-1 px-3.5 text-sm font-bold text-linear-ink transition hover:bg-linear-surface-2"
            >
              <span aria-hidden="true" className={`flex h-6 w-10 rounded-full p-0.5 transition ${draft.vpn === "YES" ? "justify-end bg-[#D90005]" : "justify-start bg-linear-hairline-strong"}`}>
                <span className="h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
              </span>
              {draft.vpn === "YES" ? "ต้องใช้ VPN" : "ไม่ใช้ VPN"}
            </button>
          </div>
        </form>

        {duplicate ? <p role="alert" className="mt-3 text-xs text-linear-danger">มีเกมชื่อนี้อยู่แล้ว กรุณาใช้ชื่ออื่น</p> : null}
        {error ? <p role="alert" className="mt-3 text-xs text-linear-danger">{error}</p> : null}
      </GameinfoManageSection>

      <GameinfoManageSection
        id="s-method"
        number={sectionNumbers?.method}
        title="วิธีเติมและคำแนะนำ"
        description="ลิงก์เว็บเติม วิธีเติม โน้ต VPN และข้อควรระวัง แต่ละส่วนบันทึกทันทีในหน้าต่างของตัวเอง"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <ContentCard title="ลิงก์เว็บเติม" detail={links.length ? `${links.length} ลิงก์` : "ยังไม่มีลิงก์"}>
            <GameinfoGameLinksButton gameId={row.id} gameName={draft.game} links={links} editable dataMode={dataMode} onSaved={setLinks} className={CONTENT_BUTTON} />
          </ContentCard>
          <ContentCard title="วิธีเติม / VPN" detail={[row.hasTutorial ? "มีวิธีเติม" : "ยังไม่มีวิธีเติม", row.hasVpnNote ? "มีโน้ต VPN" : null].filter(Boolean).join(" · ")}>
            <GameinfoDetailsButton gameId={row.id} gameName={draft.game} editable hasTutorial={row.hasTutorial} hasVpnNote={row.hasVpnNote} dataMode={dataMode} className={CONTENT_BUTTON}>แก้ไขวิธีเติม / VPN</GameinfoDetailsButton>
          </ContentCard>
          <ContentCard title="ข้อควรระวัง (NOTICE)" detail={row.hasWarning ? "เด้งขึ้นเมื่อเปิดหน้าเกม" : "ยังไม่มีข้อควรระวัง"} warn={row.hasWarning}>
            <GameinfoTutorialButton gameId={row.id} gameName={draft.game} editable hasData={row.hasWarning} variant="warning" dataMode={dataMode} className="flex h-10 items-center rounded-[10px] bg-[#D90005] px-4 text-[13px] font-extrabold text-white transition hover:bg-[#B80004]">แก้ไขข้อควรระวัง</GameinfoTutorialButton>
          </ContentCard>
        </div>
      </GameinfoManageSection>

      {pickerOpen ? <GameinfoImagePickerModal value={image} onChange={setImage} onClose={() => setPickerOpen(false)} /> : null}
    </>
  );
}

const CONTENT_BUTTON = "flex h-10 items-center rounded-[10px] border border-linear-hairline bg-linear-surface-1 px-4 text-[13px] font-bold text-linear-ink transition hover:bg-linear-surface-2 disabled:opacity-50";

const SERVICE_OPTIONS = [
  { value: "online", label: "พร้อมใช้งาน", dot: "bg-emerald-500" },
  { value: "offline", label: "ปิดใช้งาน", dot: "bg-linear-ink-tertiary" },
];

function ContentCard({ title, detail, warn = false, children }) {
  return (
    <div className={`flex flex-col gap-3 rounded-[14px] border p-4 ${warn ? "border-[#D90005]/40 bg-[#FFF5F5] dark:bg-[#D90005]/10" : "border-linear-hairline bg-linear-surface-2"}`}>
      <div>
        <p className="text-[15px] font-black text-linear-ink">{title}</p>
        <p className="mt-0.5 text-[13px] text-linear-ink-tertiary">{detail}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Field({ label, wide, children }) {
  return (
    <label className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[13px] font-bold text-linear-ink-muted">{label}</span>
      {children}
    </label>
  );
}
