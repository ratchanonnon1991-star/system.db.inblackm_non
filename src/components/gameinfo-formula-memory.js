"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRESETS_URL = "/api/gameinfo/formula-presets";

export default function GameinfoFormulaMemory({ formula, type, symbol, onApply }) {
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
  const items = useMemo(
    () => [
      { label: loading ? "กำลังโหลด..." : "เลือกชุดสูตร", value: null },
      ...presets.map((preset) => ({ label: preset.name, value: String(preset.id) })),
    ],
    [loading, presets]
  );

  function selectPreset(value) {
    const nextId = value == null ? null : String(value);
    setSelectedId(nextId);
    const next = presets.find((preset) => String(preset.id) === nextId);
    if (next) setName(next.name);
    setError("");
    setNotice("");
  }

  function applySelected() {
    if (!selected) return;
    const applyError = onApply?.(selected);
    if (applyError) {
      setError(applyError);
      setNotice("");
      return;
    }
    setError("");
    setNotice(`นำสูตร “${selected.name}” มาใช้แล้ว`);
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
    <FieldGroup className="gap-3">
      <Field>
        <FieldLabel>Formula Memory</FieldLabel>
        <div className="flex gap-2">
          <Select items={items} value={selectedId} onValueChange={selectPreset} disabled={loading || saving}>
            <SelectTrigger className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem key={item.value ?? "empty"} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" onClick={applySelected} disabled={!selected || saving}>
            ใช้สูตร
          </Button>
        </div>
        {selected ? (
          <FieldDescription>
            แก้ล่าสุดโดย {selected.updatedByName || selected.createdByName || "ไม่ทราบชื่อ"}
          </FieldDescription>
        ) : null}
      </Field>

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
        {notice ? <p role="status" className="text-xs text-linear-success">{notice}</p> : null}
      </Field>
    </FieldGroup>
  );
}
