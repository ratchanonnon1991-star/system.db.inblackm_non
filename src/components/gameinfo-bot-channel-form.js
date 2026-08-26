"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, Plus, Save, Trash2, X } from "lucide-react";
import GameinfoImagePickerModal from "./gameinfo-image-picker-modal";
import {
  allowGameinfoNavigation,
  useGameinfoUnsavedChanges,
} from "@/lib/gameinfo-unsaved-changes";

const blankChannel = {
  category: "BOT",
  channelName: "",
  imageUrl: "",
  currencies: [{ name: "", games: [""] }],
};

export default function GameinfoBotChannelForm({ lang, initial = null }) {
  const router = useRouter();
  const [form, setForm] = useState(initial || blankChannel);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const listHref = `/gameinfo/${lang}/game-bot-auto`;
  const dirty = !saved && JSON.stringify(form) !== JSON.stringify(initial || blankChannel);
  useGameinfoUnsavedChanges(dirty);

  function updateCurrency(currencyIndex, change) {
    setForm((current) => ({
      ...current,
      currencies: current.currencies.map((currency, index) =>
        index === currencyIndex ? { ...currency, ...change } : currency
      ),
    }));
  }

  function updateGame(currencyIndex, gameIndex, value) {
    updateCurrency(currencyIndex, {
      games: form.currencies[currencyIndex].games.map((game, index) =>
        index === gameIndex ? value : game
      ),
    });
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        initial ? `/api/gameinfo/game-bot-auto/${initial.id}` : "/api/gameinfo/game-bot-auto",
        {
          method: initial ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกข้อมูลไม่สำเร็จ");
      setSaved(true);
      allowGameinfoNavigation();
      router.push(listHref);
      router.refresh();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setImagePickerOpen(true)}
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-linear-hairline-strong bg-linear-surface-2 text-linear-ink-tertiary hover:bg-linear-surface-3"
            aria-label="ใส่รูปช่องทาง"
          >
            {form.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imageUrl} alt="" className="h-full w-full object-contain" />
            ) : <ImageIcon size={22} />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-linear-ink">รูปช่องทาง</p>
            <p className="text-xs text-linear-ink-tertiary">ใช้ URL, อัปโหลดไฟล์ หรือวางจากคลิปบอร์ด</p>
          </div>
          {form.imageUrl ? (
            <button type="button" onClick={() => setForm((current) => ({ ...current, imageUrl: "" }))} aria-label="ลบรูปช่องทาง" className="flex h-9 w-9 items-center justify-center rounded-lg text-linear-ink-subtle hover:bg-linear-surface-2 hover:text-linear-danger">
              <X size={16} />
            </button>
          ) : null}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-linear-ink">
            หมวดหมู่
            <select
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              className="h-10 w-full rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none focus:border-linear-primary focus:ring-2 focus:ring-linear-primary/20"
            >
              <option value="BOT">BOT</option>
              <option value="API">API</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium text-linear-ink">
            ช่องทาง
            <input
              required
              value={form.channelName}
              onChange={(event) => setForm((current) => ({ ...current, channelName: event.target.value }))}
              placeholder="เช่น Codashop"
              className="h-10 w-full rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none placeholder:text-linear-ink-tertiary focus:border-linear-primary focus:ring-2 focus:ring-linear-primary/20"
            />
          </label>
        </div>
      </section>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-[-0.1px] text-linear-ink">สกุลเงินและชื่อเกม</h2>
          <button
            type="button"
            onClick={() => setForm((current) => ({
              ...current,
              currencies: [...current.currencies, { name: "", games: [""] }],
            }))}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm font-medium text-linear-ink hover:bg-linear-surface-2"
          >
            <Plus size={15} /> เพิ่มสกุลเงิน
          </button>
        </div>

        <div className="space-y-4">
          {form.currencies.map((currency, currencyIndex) => (
            <section key={currencyIndex} className="rounded-xl border border-linear-hairline bg-linear-surface-1 p-4">
              <div className="flex items-end gap-2">
                <label className="flex-1">
                  <span className="sr-only">สกุลเงิน</span>
                  <input
                    value={currency.name}
                    onChange={(event) => updateCurrency(currencyIndex, { name: event.target.value })}
                    placeholder="สกุลเงิน (ไม่บังคับ)"
                    className="h-10 w-full rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none placeholder:text-linear-ink-tertiary focus:border-linear-primary focus:ring-2 focus:ring-linear-primary/20"
                  />
                </label>
                {form.currencies.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({
                      ...current,
                      currencies: current.currencies.filter((_, index) => index !== currencyIndex),
                    }))}
                    aria-label={`ลบสกุลเงิน ${currency.name || "ไม่ระบุ"}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-linear-ink-subtle hover:bg-linear-surface-2 hover:text-linear-danger"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>

              <div className="mt-4 pl-4">
                <div className="space-y-2">
                  {currency.games.map((game, gameIndex) => (
                    <div key={gameIndex} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-linear-ink-tertiary" />
                      <input
                        required
                        value={game}
                        onChange={(event) => updateGame(currencyIndex, gameIndex, event.target.value)}
                        aria-label={`ชื่อเกม ${gameIndex + 1} ในสกุลเงิน ${currency.name || "ไม่ระบุ"}`}
                        placeholder="ชื่อเกม"
                        className="h-10 flex-1 rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none placeholder:text-linear-ink-tertiary focus:border-linear-primary focus:ring-2 focus:ring-linear-primary/20"
                      />
                      {currency.games.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => updateCurrency(currencyIndex, {
                            games: currency.games.filter((_, index) => index !== gameIndex),
                          })}
                          aria-label={`ลบชื่อเกมลำดับที่ ${gameIndex + 1}`}
                          className="flex h-10 w-10 items-center justify-center rounded-lg text-linear-ink-subtle hover:bg-linear-surface-2 hover:text-linear-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => updateCurrency(currencyIndex, { games: [...currency.games, ""] })}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-linear-ink-muted hover:bg-linear-surface-2 hover:text-linear-ink"
                >
                  <Plus size={15} /> เพิ่มชื่อเกม
                </button>
              </div>
            </section>
          ))}
        </div>
      </div>

      {error ? <p role="alert" className="text-sm text-linear-danger">{error}</p> : null}
      <div className="flex justify-end gap-3 pt-2">
        <Link href={listHref} className="inline-flex min-h-10 items-center rounded-lg border border-linear-hairline-strong px-4 text-sm font-medium text-linear-ink hover:bg-linear-surface-2">
          ยกเลิก
        </Link>
        <button disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-linear-ink px-4 text-sm font-medium text-linear-canvas disabled:opacity-50">
          <Save size={16} /> {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>
      {imagePickerOpen ? (
        <GameinfoImagePickerModal
          value={form.imageUrl}
          onChange={(imageUrl) => setForm((current) => ({ ...current, imageUrl }))}
          onClose={() => setImagePickerOpen(false)}
        />
      ) : null}
    </form>
  );
}
