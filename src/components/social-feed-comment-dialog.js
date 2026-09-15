"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
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
  const submit = async () => {
    setSaving(true); setError("");
    try {
      await apiJson("/api/social-feed/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: post.id, accountId, text }), fallbackError: "สร้างงานคอมเมนต์ไม่สำเร็จ" });
      onOpenChange(false);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return <Dialog open={Boolean(post)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>คอมเมนต์ผ่าน Extension</DialogTitle><DialogDescription>Extension จะใช้บัญชี Facebook ที่เชื่อมกับเครื่องที่เลือกส่งข้อความนี้หนึ่งครั้ง</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<FieldGroup><Field data-disabled={!accounts.length}><FieldLabel>เครื่อง/บัญชี</FieldLabel><Select items={accounts.map((account) => ({ value: account.id, label: `${account.label} · Facebook ${account.platformAccountId}` }))} value={accountId} onValueChange={setAccountId} disabled={!accounts.length}><SelectTrigger className="w-full"><SelectValue placeholder={accounts.length ? "เลือกเครื่อง" : "ไม่มี"} /></SelectTrigger><SelectContent><SelectGroup>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.label} · Facebook {account.platformAccountId}</SelectItem>)}</SelectGroup></SelectContent></Select>{!accounts.length && <FieldDescription>ยังไม่มี Extension ที่ออนไลน์และเชื่อมบัญชี Facebook</FieldDescription>}</Field><Field><FieldLabel>ข้อความคอมเมนต์</FieldLabel><Textarea className="min-h-28" value={text} onChange={(event) => setText(event.target.value)} maxLength={8000} /></Field></FieldGroup><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button><Button onClick={submit} disabled={saving || !accountId || !text.trim()}><MessageCircle data-icon="inline-start" />{saving ? "กำลังเข้าคิว..." : "ส่งคอมเมนต์"}</Button></DialogFooter></DialogContent></Dialog>;
}
