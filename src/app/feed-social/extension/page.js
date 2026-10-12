import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Puzzle } from "lucide-react";
import { getSessionUser } from "@/server/session-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Feed Social — Extension" };

const steps = [
  {
    title: "ดาวน์โหลดและแตกไฟล์",
    detail: <>ดาวน์โหลด ZIP ด้านบน แล้วแตกไฟล์ไว้ในโฟลเดอร์ถาวร เช่น <code>social-feed-collector</code> อย่าเลือกไฟล์ ZIP ตรง ๆ ตอนติดตั้ง</>,
  },
  {
    title: "ติดตั้งใน Chrome profile ที่จะใช้เก็บข้อมูล",
    detail: <>เปิด <code>chrome://extensions</code> ใน profile นั้น เปิด <strong>โหมดนักพัฒนาซอฟต์แวร์</strong> แล้วกด <strong>โหลดส่วนขยายที่คลายแพ็กแล้ว</strong> เลือกโฟลเดอร์ที่แตกไฟล์ไว้ ทำซ้ำในแต่ละ profile ที่ต้องการใช้งาน</>,
  },
  {
    title: "ตั้งค่าการเชื่อมต่อ",
    detail: <>เปิด Extension แล้วกด <strong>ตั้งค่า</strong> ใส่ชื่อเครื่อง, SystemDB URL และ Ingest secret ที่ผู้ดูแลระบบตั้งไว้ใน <code>SOCIAL_FEED_INGEST_SECRET</code> จากนั้นกด <strong>บันทึกการตั้งค่า</strong> Secret ต้องมีอย่างน้อย 24 ตัวอักษรและต้องตรงกับค่าบนเซิร์ฟเวอร์</>,
  },
  {
    title: "เลือกการใช้บัญชี Facebook",
    detail: <>หากต้องอ่านกลุ่มที่ต้องเข้าร่วม ให้ล็อกอิน Facebook ใน Chrome profile เดียวกัน แล้วกด <strong>ใช้ Facebook ที่ล็อกอินอยู่</strong> ใน Extension หากอ่านเฉพาะกลุ่ม Public สามารถใช้งานแบบไม่ผูกบัญชีได้</>,
  },
  {
    title: "เชื่อมต่อและเริ่มอ่าน",
    detail: <>หาก Extension แสดงปุ่ม <strong>เชื่อมต่อ</strong> ให้กดปุ่มนั้น เมื่อปุ่มเปลี่ยนเป็น <strong>ตัดการเชื่อมต่อ</strong> เครื่องจะขึ้นในแท็บ <strong>เครื่องอ่าน</strong> และอยู่ในสถานะสแตนบาย จากนั้นกด <strong>เริ่ม</strong> บนหน้า Feed Social เพื่อให้เครื่องรับคิวอ่านกลุ่ม</>,
  },
];

export default async function FeedSocialExtensionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b bg-background"><div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Puzzle className="size-5" /></span><div><p className="font-semibold">Feed Social Collector</p><p className="text-xs text-muted-foreground">ติดตั้งและใช้งาน Extension</p></div></div><Button variant="outline" size="sm" nativeButton={false} render={<Link href="/feed-social" />}><ArrowLeft data-icon="inline-start" />กลับ Feed Social</Button></div></header>
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div><h1 className="text-3xl font-semibold tracking-tight">ติดตั้ง Feed Social Collector</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Extension สำหรับ Chrome รับคิวกลุ่มจาก Feed Social และส่งโพสต์กลับเข้าระบบ ตั้งค่าหนึ่งครั้งต่อ Chrome profile ที่จะใช้เป็นเครื่องอ่าน</p></div>
      <Card><CardHeader><CardTitle>ไฟล์ติดตั้ง</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center gap-4"><Button nativeButton={false} render={<a href="/social-feed-collector.zip" download />}><Download data-icon="inline-start" />ดาวน์โหลด Extension (.zip)</Button><p className="text-sm text-muted-foreground">แตก ZIP ก่อนโหลดเข้า Chrome</p></CardContent></Card>
      <div className="space-y-3">{steps.map((step, index) => <Card key={step.title}><CardContent className="flex gap-4 py-5"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{index + 1}</span><div><h2 className="font-semibold">{step.title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_strong]:font-semibold [&_strong]:text-foreground">{step.detail}</p></div></CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle>ตรวจว่าเชื่อมต่อสำเร็จ</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>เปิดแท็บ <strong className="text-foreground">เครื่องอ่าน</strong> ใน Feed Social: ชื่อเครื่องควรปรากฏและแสดงว่าออนไลน์ หลังจากกดเริ่ม คิวกลุ่มที่ได้รับจะแสดงใต้เครื่องนั้น</p><p>ถ้าไม่พบเครื่อง ให้ตรวจ SystemDB URL, Ingest secret, สถานะเชื่อมต่อใน Extension และเปิด Chrome profile ที่ติดตั้งไว้</p><Button variant="outline" size="sm" nativeButton={false} render={<Link href="/feed-social" />}><ExternalLink data-icon="inline-start" />ไปหน้า Feed Social</Button></CardContent></Card>
    </main>
  </div>;
}
