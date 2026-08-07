"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "@/lib/api-json";
import GameinfoMemoryInput from "./gameinfo-memory-input";
import GameinfoImagePreview from "./gameinfo-image-preview";

// Game meta form (name/region/platform/server/VPN/web-topup link/image).
// Ported from gameinfo's GameForm.tsx — server actions swapped for
// /api/gameinfo/games* calls, ImageUpload swapped for a plain URL field
// (v1 mockup — paste a link rather than uploading a file, see plan).
export default function GameinfoGameForm({ lang, suggestions, initial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [gameName, setGameName] = useState(initial?.gameName ?? "");
  const [region, setRegion] = useState(initial?.region ?? "");
  const [platform, setPlatform] = useState(initial?.platform ?? "");
  const [server, setServer] = useState(initial?.server ?? "");
  const [vpn, setVpn] = useState(initial?.vpn ?? "NO");
  const [webTopup, setWebTopup] = useState(initial?.webTopup ?? "");
  const [image, setImage] = useState(initial?.image ?? "");

  function submit() {
    setError("");
    if (!gameName.trim()) {
      setError("กรุณากรอกชื่อเกม");
      return;
    }
    const payload = { gameName, region, platform, server, vpn, webTopup, image };
    startTransition(async () => {
      try {
        if (initial) {
          await apiJson(`/api/gameinfo/games/${initial.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } else {
          await apiJson("/api/gameinfo/games", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
        router.push(`/gameinfo/${lang}/admin`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="ชื่อเกม *">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <GameinfoMemoryInput
                value={gameName}
                onChange={setGameName}
                suggestions={suggestions?.gameNames || []}
                placeholder="เช่น Mobile Legends"
              />
            </div>
            {image ? (
              <GameinfoImagePreview src={image} alt={gameName}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
              </GameinfoImagePreview>
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-100 text-lg">
                🎮
              </span>
            )}
          </div>
        </Field>

        <Field label="รูปเกม (ลิงก์ URL)">
          <input
            type="url"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://... (อัปโหลดไฟล์จะเปิดให้ใช้ในเวอร์ชันถัดไป)"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </Field>

        <Field label="Region">
          <GameinfoMemoryInput
            value={region}
            onChange={setRegion}
            suggestions={suggestions?.regions || []}
            placeholder="เช่น Global, Asia"
          />
        </Field>

        <Field label="VPN">
          <div className="flex gap-2">
            {["NO", "YES"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVpn(v)}
                className={`h-9 flex-1 rounded-md border text-sm font-medium ${
                  vpn === v
                    ? v === "YES"
                      ? "border-rose-400 bg-rose-50 text-rose-700"
                      : "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : "border-slate-300 bg-white text-slate-500"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Platform">
          <GameinfoMemoryInput
            value={platform}
            onChange={setPlatform}
            suggestions={suggestions?.platforms || []}
            placeholder="เช่น Android/iOS, PC"
          />
        </Field>

        <Field label="Server">
          <GameinfoMemoryInput
            value={server}
            onChange={setServer}
            suggestions={suggestions?.servers || []}
            placeholder="เช่น Asia, Global"
          />
        </Field>

        <Field label="Web Topup (ลิงก์)">
          <input
            type="url"
            value={webTopup}
            onChange={(e) => setWebTopup(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </Field>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : initial ? "บันทึกการแก้ไข" : "เพิ่มเกม"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/gameinfo/${lang}/admin`)}
          className="rounded-md border border-slate-300 px-5 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
