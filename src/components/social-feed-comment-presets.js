"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function PresetCarousel({ category, busy, remove, setEditingPresets, setDrafts }) {
  const [index, setIndex] = useState(0);
  const count = category.presets.length;
  const currentIndex = count ? index % count : 0;
  const preset = category.presets[currentIndex];
  if (!preset) return <p className="text-sm text-muted-foreground">หมวดนี้ยังไม่มีข้อความ</p>;

  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2" aria-label={`ข้อความในหมวด ${category.name}`}>
      <Button type="button" variant="outline" size="icon-sm" aria-label="ข้อความก่อนหน้า" disabled={count < 2} onClick={() => setIndex((value) => (value - 1 + count) % count)}><ChevronLeft /></Button>
      <span className="text-xs tabular-nums text-muted-foreground">{currentIndex + 1} / {count}</span>
      <Button type="button" variant="outline" size="icon-sm" aria-label="ข้อความถัดไป" disabled={count < 2} onClick={() => setIndex((value) => (value + 1) % count)}><ChevronRight /></Button>
    </div>
    <div key={preset.id} className="flex min-h-28 items-start gap-2 rounded-md border p-3" aria-live="polite">
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{preset.body}</p>
      <Button variant="ghost" size="icon-sm" aria-label="แก้ข้อความ" onClick={() => { setEditingPresets((current) => ({ ...current, [category.id]: preset.id })); setDrafts((current) => ({ ...current, [category.id]: preset.body })); }}><Pencil /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="ลบข้อความ" disabled={busy} onClick={() => remove("preset", preset.id, "ข้อความนี้")}><Trash2 /></Button>
    </div>
  </div>;
}

export default function SocialFeedCommentPresets() {
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [drafts, setDrafts] = useState({});
  const [editingPresets, setEditingPresets] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const result = await apiJson("/api/social-feed/comment-presets", { fallbackError: "โหลดคลังข้อความไม่สำเร็จ" });
    setCategories(result.categories);
  }, []);
  useEffect(() => {
    apiJson("/api/social-feed/comment-presets", { fallbackError: "โหลดคลังข้อความไม่สำเร็จ" })
      .then((result) => setCategories(result.categories))
      .catch((err) => setError(err.message));
  }, []);

  const save = async (payload, after = () => {}) => {
    setBusy(true); setError("");
    try {
      await apiJson("/api/social-feed/comment-presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), fallbackError: "บันทึกไม่สำเร็จ" });
      await load(); after();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const remove = async (kind, id, label) => {
    if (!window.confirm(`ลบ${label}?`)) return;
    setBusy(true); setError("");
    try {
      await apiJson(`/api/social-feed/comment-presets?kind=${kind}&id=${id}`, { method: "DELETE", fallbackError: "ลบไม่สำเร็จ" });
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return <div className="space-y-4">
    <div><h2 className="text-lg font-semibold">คลังข้อความ</h2><p className="text-sm text-muted-foreground">จัดข้อความความหมายใกล้กันไว้ในหมวดเดียวกัน แล้วเลือกใช้ตอนคอมเมนต์โพสต์</p></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="flex max-w-xl gap-2"><Input aria-label="ชื่อหมวดใหม่หรือชื่อหมวดที่แก้ไข" placeholder="ชื่อหมวด เช่น สอบถามราคา" value={categoryName} maxLength={120} onChange={(event) => setCategoryName(event.target.value)} /><Button disabled={busy || !categoryName.trim()} onClick={() => save({ kind: "category", id: editingCategoryId || undefined, name: categoryName }, () => { setCategoryName(""); setEditingCategoryId(""); })}><Plus data-icon="inline-start" />{editingCategoryId ? "บันทึกชื่อหมวด" : "เพิ่มหมวด"}</Button>{editingCategoryId && <Button variant="outline" onClick={() => { setCategoryName(""); setEditingCategoryId(""); }}>ยกเลิก</Button>}</div>
    {categories.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีหมวดข้อความ</p>}
    <div className="grid gap-4 lg:grid-cols-2">{categories.map((category) => <Card key={category.id}><CardHeader><CardTitle>{category.name}</CardTitle><div className="flex gap-1"><Button variant="ghost" size="icon-sm" aria-label={`แก้ชื่อหมวด ${category.name}`} onClick={() => { setEditingCategoryId(category.id); setCategoryName(category.name); }}><Pencil /></Button><Button variant="ghost" size="icon-sm" aria-label={`ลบหมวด ${category.name}`} disabled={busy} onClick={() => remove("category", category.id, `หมวด ${category.name} และข้อความทั้งหมดในหมวด`)}><Trash2 /></Button></div></CardHeader><CardContent className="space-y-3">
      <PresetCarousel category={category} busy={busy} remove={remove} setEditingPresets={setEditingPresets} setDrafts={setDrafts} />
      <Textarea aria-label={`ข้อความใหม่ในหมวด ${category.name}`} placeholder="พิมพ์ข้อความคอมเมนต์ที่ต้องการเก็บ" maxLength={8000} value={drafts[category.id] || ""} onChange={(event) => setDrafts((current) => ({ ...current, [category.id]: event.target.value }))} />
      <div className="flex gap-2"><Button size="sm" disabled={busy || !drafts[category.id]?.trim()} onClick={() => save({ kind: "preset", id: editingPresets[category.id] || undefined, categoryId: category.id, body: drafts[category.id] }, () => { setDrafts((current) => ({ ...current, [category.id]: "" })); setEditingPresets((current) => ({ ...current, [category.id]: "" })); })}>{editingPresets[category.id] ? "บันทึกข้อความ" : "เพิ่มข้อความ"}</Button>{editingPresets[category.id] && <Button variant="outline" size="sm" onClick={() => { setDrafts((current) => ({ ...current, [category.id]: "" })); setEditingPresets((current) => ({ ...current, [category.id]: "" })); }}>ยกเลิก</Button>}</div>
    </CardContent></Card>)}</div>
  </div>;
}
