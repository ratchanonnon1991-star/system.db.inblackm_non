"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BellRing, Clock3, Pencil, Plus, Trash2, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { reconcileAlertRuleView } from "@/lib/social-feed-alert-rules";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input as BaseInput } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const EMPTY = { rules: [], selectedId: "", posts: [], pagination: { page: 1, pageSize: "20", total: 0, totalPages: 1 } };
const MAX_TERMS = 20;
const MODE_ITEMS = [{ value: "all", label: "ต้องมีครบทุกคำ" }, { value: "any", label: "มีคำใดคำหนึ่ง" }];
const MODE_LABELS = Object.fromEntries(MODE_ITEMS.map((item) => [item.value, item.label]));

function Input(props) {
  return <BaseInput maxLength={120} {...props} />;
}

function formatTime(value) {
  if (!value) return "ไม่ทราบเวลาโพสต์";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function HighlightTerms({ text, terms: values }) {
  const terms = [...new Set((values || []).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!terms.length) return text;
  const normalized = new Set(terms.map((term) => term.toLocaleLowerCase("th-TH")));
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return String(text || "").split(new RegExp(`(${escaped.join("|")})`, "gi")).map((part, index) => normalized.has(part.toLocaleLowerCase("th-TH"))
    ? <mark key={index} className="rounded-sm bg-yellow-300 px-0.5 text-black dark:bg-yellow-400">{part}</mark> : part);
}

export default function SocialFeedRulesPage() {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedIdState] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const requestRef = useRef({ sequence: 0, controller: null });
  const setSelectedId = useCallback((value) => {
    requestRef.current.controller?.abort();
    requestRef.current = { sequence: requestRef.current.sequence + 1, controller: null };
    setLoading(true);
    setSelectedIdState(value);
  }, []);

  const load = useCallback(async () => {
    requestRef.current.controller?.abort();
    const controller = new AbortController();
    const sequence = requestRef.current.sequence + 1;
    requestRef.current = { sequence, controller };
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (selectedId) params.set("rule", selectedId);
      const result = await apiJson(`/api/social-feed/alert-rules?${params}`, { signal: controller.signal, fallbackError: "โหลด Rule ไม่สำเร็จ" });
      if (requestRef.current.sequence !== sequence) return;
      const view = reconcileAlertRuleView(result, selectedId, page);
      if (view.selectionChanged) setSelectedIdState(view.selectedId);
      if (view.page !== page) { setPage(view.page); return; }
      setData(result); setError("");
      if (!result.rules.length) setCreateOpen(true);
    } catch (err) {
      if (err.name !== "AbortError" && requestRef.current.sequence === sequence) setError(err.message);
    } finally {
      if (requestRef.current.sequence === sequence) setLoading(false);
    }
  }, [page, selectedId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- filter changes intentionally refresh server data
  useEffect(() => { load(); return () => requestRef.current.controller?.abort(); }, [load]);
  useEffect(() => { const timer = window.setInterval(load, 10000); return () => window.clearInterval(timer); }, [load]);

  const selectedRule = data.rules.find((rule) => rule.id === (selectedId || data.selectedId));
  const removeRule = async (rule) => {
    if (!window.confirm(`ลบ Rule “${rule.name}” หรือไม่?`)) return;
    try {
      await apiJson(`/api/social-feed/alert-rules?id=${rule.id}`, { method: "DELETE", fallbackError: "ลบ Rule ไม่สำเร็จ" });
      setLoading(true); setSelectedId(""); setPage(1);
    } catch (err) { setError(err.message); }
  };

  return <div className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur"><div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><BellRing /></span><div><p className="font-semibold">Rule คัดโพสต์</p><p className="text-xs text-muted-foreground">โพสต์ที่ตรงเงื่อนไขจะรวมอยู่ที่นี่</p></div></div><Button variant="outline" nativeButton={false} render={<Link href="/feed-social" />}><ArrowLeft data-icon="inline-start" />กลับ Feed Social</Button></div></header>
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside><div className="mb-3 flex items-center justify-between"><div><p className="font-medium">Rule ทั้งหมด</p><p className="text-xs text-muted-foreground">เลือก Rule เพื่อดูโพสต์</p></div><Button size="icon-sm" aria-label="เพิ่ม Rule" onClick={() => setCreateOpen(true)}><Plus /></Button></div><div className="flex flex-col gap-2">{data.rules.map((rule) => <button type="button" key={rule.id} onClick={() => { setSelectedId(rule.id); setPage(1); }} className={`rounded-lg border p-3 text-left transition-colors ${selectedRule?.id === rule.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}><span className="flex items-start justify-between gap-2"><span className="font-medium">{rule.name}</span><Badge variant="outline">{rule.includeMode === "all" ? "ครบทุกคำ" : "คำใดคำหนึ่ง"}</Badge></span><span className="mt-1 block text-xs text-muted-foreground">{rule.includeTerms.length} คำที่ต้องการ{rule.excludeTerms.length ? ` · ห้าม ${rule.excludeTerms.length} คำ` : ""}</span></button>)}</div><Button className="mt-3 w-full" onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />สร้าง Rule ใหม่</Button></aside>
      <section className="min-w-0">{error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}{loading ? <div className="flex flex-col gap-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-44 w-full" /></div> : !selectedRule ? <Card><CardHeader><CardTitle>เริ่มจากสร้าง Rule แรก</CardTitle><CardDescription>ตั้งชื่อ Rule แล้วกำหนดคำและรูปแบบการจับคู่ โพสต์ที่ตรงเงื่อนไขจะปรากฏในหน้านี้</CardDescription></CardHeader><CardContent><Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />เพิ่ม Rule</Button></CardContent></Card> : <>
        <Card className="mb-4"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{selectedRule.name}</CardTitle><CardDescription>{MODE_LABELS[selectedRule.includeMode] || MODE_LABELS.all}</CardDescription></div><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`แก้ไข ${selectedRule.name}`} onClick={() => { setCreateOpen(false); setEditingRule(selectedRule); }}><Pencil /></Button><Button variant="ghost" size="icon" aria-label={`ลบ ${selectedRule.name}`} onClick={() => removeRule(selectedRule)}><Trash2 /></Button></div></div></CardHeader><CardContent className="flex flex-col gap-3"><div><p className="mb-2 text-xs text-muted-foreground">คำที่ต้องการหา</p><div className="flex flex-wrap gap-1.5">{selectedRule.includeTerms.map((term) => <Badge key={term} variant="secondary">{term}</Badge>)}</div></div>{selectedRule.excludeTerms.length > 0 && <div><p className="mb-2 text-xs text-muted-foreground">คำที่ไม่ต้องการ · {MODE_LABELS[selectedRule.excludeMode] || MODE_LABELS.any}</p><div className="flex flex-wrap gap-1.5">{selectedRule.excludeTerms.map((term) => <Badge key={term} variant="outline">{term}</Badge>)}</div></div>}</CardContent></Card>
        <div className="mb-3 flex items-center justify-between"><p className="text-sm text-muted-foreground">พบ {data.pagination.total} โพสต์ที่ตรง Rule</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>ก่อนหน้า</Button><span className="text-sm">{data.pagination.page}/{data.pagination.totalPages}</span><Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>ถัดไป</Button></div></div>
        <div className="flex flex-col gap-3">{data.posts.map((post) => <article key={post.id} className="rounded-xl border bg-card p-4 sm:p-5"><div><p className="text-sm font-medium">{post.sourceName}</p>{post.authorName && <p className="mt-1 text-sm">{post.authorName}</p>}<p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3" />{formatTime(post.postedAt)}</p></div><p className="mt-4 whitespace-pre-wrap text-[15px] leading-7"><HighlightTerms text={post.message} terms={selectedRule.includeTerms} /></p><div className="mt-4 border-t pt-3 text-right"><Button variant="link" size="sm" nativeButton={false} render={<a href={post.originalUrl} target="_blank" rel="noreferrer" />}>เปิดต้นโพสต์<ArrowUpRight data-icon="inline-end" /></Button></div></article>)}</div>{!data.posts.length && <Card><CardHeader><CardTitle>ยังไม่มีโพสต์ที่ตรง Rule</CardTitle><CardDescription>โพสต์ใหม่ที่ตรงเงื่อนไขจะปรากฏที่หน้านี้อัตโนมัติ</CardDescription></CardHeader></Card>}
      </>}</section>
    </main>
    {(createOpen || editingRule) && <RuleDialog key={editingRule?.id || "create"} open rule={editingRule} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditingRule(null); } }} onSaved={(savedRule) => { setEditingRule(null); setSelectedId(savedRule.id); setPage(1); }} />}
  </div>;
}

function RuleDialog({ open, onOpenChange, onSaved, rule }) {
  const [name, setName] = useState(rule?.name || "");
  const [includeMode, setIncludeMode] = useState(rule?.includeMode || "all");
  const [includeTerms, setIncludeTerms] = useState(() => rule?.includeTerms?.length ? [...rule.includeTerms] : [""]);
  const [excludeMode, setExcludeMode] = useState(rule?.excludeMode || "any");
  const [excludeTerms, setExcludeTerms] = useState(() => rule?.excludeTerms ? [...rule.excludeTerms] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const updateTerm = (setter, termIndex, value) => setter((current) => current.map((term, index) => index === termIndex ? value : term));
  const removeTerm = (setter, termIndex) => setter((current) => current.filter((_, index) => index !== termIndex));
  const save = async () => {
    setSaving(true); setError("");
    try {
      const result = await apiJson("/api/social-feed/alert-rules", {
        method: rule ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule?.id, name, includeMode, includeTerms, excludeMode, excludeTerms }),
        fallbackError: rule ? "แก้ไข Rule ไม่สำเร็จ" : "บันทึก Rule ไม่สำเร็จ",
      });
      onOpenChange(false);
      onSaved(result.rule);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{rule ? "แก้ไข Rule" : "สร้าง Rule คัดโพสต์"}</DialogTitle>
        <DialogDescription>กำหนดคำที่ต้องการหาในโพสต์ และเพิ่มคำที่ไม่ต้องการเฉพาะเมื่อจำเป็น</DialogDescription>
      </DialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <FieldGroup>
        <Field>
          <FieldLabel>ชื่อ Rule</FieldLabel>
          <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น ลูกค้าหาเติมเพชร" />
        </Field>
        <Field>
          <FieldLabel>รูปแบบการค้นหา</FieldLabel>
          <Select items={MODE_ITEMS} value={includeMode} onValueChange={setIncludeMode}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="all">ต้องมีครบทุกคำ</SelectItem><SelectItem value="any">มีคำใดคำหนึ่ง</SelectItem></SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>คำที่ต้องการหา</FieldLabel>
          <FieldDescription>{includeMode === "all" ? "โพสต์ต้องมีครบทุกคำ โดยคำไม่จำเป็นต้องอยู่ติดกัน" : "โพสต์มีคำใดคำหนึ่งก็ถือว่าตรง Rule"} · {includeTerms.length}/{MAX_TERMS} คำ</FieldDescription>
          <div className="flex flex-col gap-2">{includeTerms.map((term, termIndex) => <div key={termIndex} className="flex gap-2">
            <Input value={term} onChange={(event) => updateTerm(setIncludeTerms, termIndex, event.target.value)} placeholder={`คำที่ ${termIndex + 1}`} />
            {includeTerms.length > 1 && <Button variant="outline" size="icon" aria-label={`ลบคำที่ต้องการ ${termIndex + 1}`} onClick={() => removeTerm(setIncludeTerms, termIndex)}><X /></Button>}
          </div>)}</div>
          <Button variant="outline" size="sm" disabled={includeTerms.length >= MAX_TERMS} onClick={() => setIncludeTerms((current) => [...current, ""])}><Plus data-icon="inline-start" />เพิ่มคำที่ต้องการหา</Button>
        </Field>
        {excludeTerms.length ? <Field>
          <div className="flex items-center justify-between gap-3"><FieldLabel>คำที่ไม่ต้องการ</FieldLabel><Button variant="ghost" size="sm" onClick={() => setExcludeTerms([])}>ล้างทั้งหมด</Button></div>
          <Select items={MODE_ITEMS} value={excludeMode} onValueChange={setExcludeMode}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="all">ต้องพบครบทุกคำ</SelectItem><SelectItem value="any">พบคำใดคำหนึ่ง</SelectItem></SelectGroup></SelectContent>
          </Select>
          <FieldDescription>{excludeMode === "all" ? "โพสต์จะถูกตัดออกเมื่อพบคำไม่ต้องการครบทุกคำ" : "โพสต์จะถูกตัดออกเมื่อพบคำไม่ต้องการคำใดคำหนึ่ง"} · {excludeTerms.length}/{MAX_TERMS} คำ</FieldDescription>
          <div className="flex flex-col gap-2">{excludeTerms.map((term, termIndex) => <div key={termIndex} className="flex gap-2">
            <Input value={term} onChange={(event) => updateTerm(setExcludeTerms, termIndex, event.target.value)} placeholder={`คำที่ไม่ต้องการ ${termIndex + 1}`} />
            <Button variant="outline" size="icon" aria-label={`ลบคำที่ไม่ต้องการ ${termIndex + 1}`} onClick={() => removeTerm(setExcludeTerms, termIndex)}><X /></Button>
          </div>)}</div>
          <Button variant="outline" size="sm" disabled={excludeTerms.length >= MAX_TERMS} onClick={() => setExcludeTerms((current) => [...current, ""])}><Plus data-icon="inline-start" />เพิ่มคำที่ไม่ต้องการ</Button>
        </Field> : <Button variant="outline" onClick={() => setExcludeTerms([""])}><Plus data-icon="inline-start" />เพิ่มคำที่ไม่ต้องการ (ไม่บังคับ)</Button>}
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
        <Button onClick={save} disabled={saving || !name.trim() || !includeTerms.some((term) => term.trim())}>{saving ? "กำลังบันทึก..." : rule ? "บันทึกการแก้ไข" : "สร้าง Rule"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
