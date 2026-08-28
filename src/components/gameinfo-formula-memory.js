"use client";

import { useEffect, useId, useState } from "react";
import { BookOpen, Save, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESETS_URL = "/api/gameinfo/formula-presets";

const TYPE_LABELS = {
  number: "ตัวเลข",
  text: "ข้อความ",
  date: "วันที่",
  boolean: "ใช่ / ไม่ใช่",
};

export default function GameinfoFormulaMemory({ formula, type, symbol, onApply, className }) {
  const [presets, setPresets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const nameId = useId();

  useEffect(() => {
    let cancelled = false;
    apiJson(PRESETS_URL, { fallbackError: "โหลด Formula Memory ไม่สำเร็จ" })
      .then((data) => {
        if (!cancelled) setPresets(Array.isArray(data?.presets) ? data.presets : []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = presets.find((preset) => String(preset.id) === selectedId) || null;
  function applyPreset(preset) {
    setSelectedId(String(preset.id));
    setName(preset.name);
    const applyError = onApply?.(preset);
    if (applyError) {
      setError(applyError);
      setNotice("");
      return;
    }
    setError("");
    setNotice(`นำสูตร “${preset.name}” มาใช้แล้ว`);
  }

  async function savePreset(presetId = null) {
    if (!name.trim() || !formula.trim()) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await apiJson(
        presetId == null ? PRESETS_URL : `${PRESETS_URL}/${presetId}`,
        {
          method: presetId == null ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, formula, type, symbol, version: presetId == null ? undefined : selected?.version }),
          fallbackError: "บันทึก Formula Memory ไม่สำเร็จ",
        }
      );
      const saved = data.preset;
      setPresets((current) => [saved, ...current.filter((preset) => preset.id !== saved.id)]);
      setSelectedId(String(saved.id));
      setName(saved.name);
      setNotice(presetId == null ? "เพิ่ม Formula Memory แล้ว" : "อัปเดต Formula Memory แล้ว");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelected() {
    if (!selected || !window.confirm(`ลบ Formula Memory “${selected.name}” หรือไม่?`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiJson(`${PRESETS_URL}/${selected.id}?version=${encodeURIComponent(selected.version)}`, {
        method: "DELETE",
        fallbackError: "ลบ Formula Memory ไม่สำเร็จ",
      });
      setPresets((current) => current.filter((preset) => preset.id !== selected.id));
      setSelectedId(null);
      setName("");
      setNotice("ลบ Formula Memory แล้ว สูตรที่เคยนำไปใช้ยังคงเดิม");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className={cn("flex flex-col gap-3", className)} aria-label="คลัง Formula Memory">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-linear-ink">
          <BookOpen data-icon="inline-start" /> Formula Memory
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-linear-ink-tertiary">
          ไม่จำเป็นต้องตั้งค่า เลือกการ์ดเพื่อใช้สูตรที่บันทึกไว้ได้ทันที
        </p>
      </div>

      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
        {loading ? (
          <p className="rounded-lg border border-linear-hairline bg-linear-surface-2 px-3 py-4 text-center text-xs text-linear-ink-tertiary">
            กำลังโหลดคลังสูตร...
          </p>
        ) : presets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linear-hairline-strong px-3 py-4 text-center text-xs text-linear-ink-tertiary">
            ยังไม่มีสูตรที่บันทึกไว้
          </p>
        ) : presets.map((preset) => (
          <Card
            key={preset.id}
            size="sm"
            className={cn(
              "shrink-0 ring-inset",
              String(preset.id) === selectedId && "ring-linear-primary/50"
            )}
          >
            <CardHeader>
              <CardTitle>{preset.name}</CardTitle>
              <CardDescription>
                {TYPE_LABELS[preset.type] || "สูตร"}{preset.symbol ? ` · ${preset.symbol}` : ""}
              </CardDescription>
              <CardAction>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => applyPreset(preset)}
                  disabled={saving}
                >
                  ใช้สูตร
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <code className="block break-words rounded-md bg-linear-surface-2 px-2 py-1.5 text-[11px] leading-relaxed text-linear-ink-subtle">
                {preset.formula}
              </code>
            </CardContent>
          </Card>
        ))}
      </div>

      {error ? <p role="alert" className="text-xs text-linear-danger">{error}</p> : null}
      {notice ? <p role="status" className="text-xs text-linear-success">{notice}</p> : null}

      <details className="rounded-lg border border-linear-hairline bg-linear-surface-2 p-3">
        <summary className="cursor-pointer text-xs font-medium text-linear-ink-muted">
          จัดการคลังสูตร
        </summary>
        <FieldGroup className="mt-3 gap-3">
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={nameId}>ชื่อชุดสูตร</FieldLabel>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="เช่น กำไรมาตรฐาน"
              aria-invalid={Boolean(error)}
              disabled={saving}
            />
            <FieldDescription>
              บันทึกสูตรที่อยู่ในช่องหลักตอนนี้ หรือเลือกการ์ดก่อนเพื่อแก้ไขชุดเดิม
            </FieldDescription>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => savePreset()} disabled={saving || !name.trim() || !formula.trim()}>
                <Save data-icon="inline-start" />
                บันทึกใหม่
              </Button>
              <Button type="button" variant="secondary" onClick={() => savePreset(selected.id)} disabled={saving || !selected || !name.trim() || !formula.trim()}>
                อัปเดตที่เลือก
              </Button>
              <Button type="button" variant="destructive" onClick={deleteSelected} disabled={saving || !selected}>
                <Trash2 data-icon="inline-start" />
                ลบ
              </Button>
            </div>
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>
      </details>
    </aside>
  );
}
