"use client";

import { useEffect, useState } from "react";
import { BookOpen, MessageCircle, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function SocialFeedCommentDialog({ post, accounts, onOpenChange }) {
  const [text, setText] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [presetCategories, setPresetCategories] = useState([]);
  const [presetCategoryId, setPresetCategoryId] = useState(null);
  const [presetsOpen, setPresetsOpen] = useState(false);

  useEffect(() => {
    let active = true;
    apiJson("/api/social-feed/comment-presets", { fallbackError: "โหลดคลังข้อความไม่สำเร็จ" })
      .then((result) => { if (active) setPresetCategories(result.categories); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const submit = async () => {
    setSaving(true); setError("");
    try {
      await apiJson("/api/social-feed/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: post.id, accountId, text }), fallbackError: "สร้างงานคอมเมนต์ไม่สำเร็จ" });
      onOpenChange(false);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const selectedCategory = presetCategories.find((category) => category.id === presetCategoryId);

  return <Dialog open={Boolean(post)} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>คอมเมนต์ผ่าน Extension</DialogTitle><DialogDescription>Extension จะใช้บัญชี Facebook ที่เชื่อมกับเครื่องที่เลือกส่งข้อความนี้หนึ่งครั้ง</DialogDescription></DialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <FieldGroup>
        <Field data-disabled={!accounts.length}>
          <FieldLabel>เครื่อง/บัญชี</FieldLabel>
          <Select items={accounts.map((account) => ({ value: account.id, label: `${account.label} · Facebook ${account.platformAccountId}` }))} value={accountId} onValueChange={setAccountId} disabled={!accounts.length}>
            <SelectTrigger className="w-full"><SelectValue placeholder={accounts.length ? "เลือกเครื่อง" : "ไม่มี"} /></SelectTrigger>
            <SelectContent><SelectGroup>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.label} · Facebook {account.platformAccountId}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          {!accounts.length && <FieldDescription>ยังไม่มี Extension ที่ออนไลน์และเชื่อมบัญชี Facebook</FieldDescription>}
        </Field>
        <Field>
          <div className="flex items-center justify-between gap-2"><FieldLabel>ข้อความคอมเมนต์</FieldLabel><Button type="button" variant="outline" size="sm" aria-expanded={presetsOpen} aria-controls="social-comment-presets" onClick={() => setPresetsOpen((open) => !open)}><BookOpen data-icon="inline-start" />{presetsOpen ? "ปิดคลังข้อความ" : "เปิดคลังข้อความ"}</Button></div>
          <Textarea className="min-h-28" value={text} onChange={(event) => setText(event.target.value)} maxLength={8000} />
        </Field>
      </FieldGroup>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button><Button onClick={submit} disabled={saving || !accountId || !text.trim()}><MessageCircle data-icon="inline-start" />{saving ? "กำลังเข้าคิว..." : "ส่งคอมเมนต์"}</Button></DialogFooter>

      {presetsOpen && <aside id="social-comment-presets" aria-label="คลังข้อความ" className="max-h-[40vh] overflow-y-auto rounded-lg border bg-popover p-4 shadow-lg xl:absolute xl:left-[calc(100%+0.75rem)] xl:top-0 xl:max-h-[min(70vh,32rem)] xl:w-80">
        <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold">คลังข้อความ</h3><Button type="button" variant="ghost" size="icon-sm" aria-label="ปิดคลังข้อความ" onClick={() => setPresetsOpen(false)}><X /></Button></div>
        {presetCategories.length ? <>
          <Select items={presetCategories.map((category) => ({ value: category.id, label: category.name }))} value={presetCategoryId} onValueChange={setPresetCategoryId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="ยังไม่เลือกหมวด" /></SelectTrigger>
            <SelectContent><SelectGroup>{presetCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          {selectedCategory ? <div className="mt-3 flex flex-col gap-2">{selectedCategory.presets.length ? selectedCategory.presets.map((preset) => <Button key={preset.id} type="button" variant="outline" className="h-auto justify-start whitespace-pre-wrap break-words text-left" onClick={() => { setText(preset.body); setPresetsOpen(false); }}>{preset.body}</Button>) : <p className="text-sm text-muted-foreground">หมวดนี้ยังไม่มีข้อความ</p>}</div> : <p className="mt-3 text-sm text-muted-foreground">เลือกหมวดเพื่อดูข้อความ</p>}
        </> : <p className="text-sm text-muted-foreground">คลังข้อความยังไม่มีรายการ</p>}
        <p className="mt-3 text-xs text-muted-foreground">เลือกข้อความแล้วแก้ไขในช่องคอมเมนต์ก่อนส่งได้</p>
      </aside>}
    </DialogContent>
  </Dialog>;
}
