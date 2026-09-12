import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/server/session-user";
import { canManageGameinfo, hasGameinfoAccess } from "@/server/auth";
import { RUSSIA_CHECK_EXTENSION_VERSION } from "@/server/gameinfo-russia-check-extension";
import { RussiaCheckExtensionDetection } from "@/components/gameinfo-russia-check-browser-connect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "GameInfo — ดาวน์โหลด Russia Check Connector" };

export default async function Page({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!hasGameinfoAccess(user) || !canManageGameinfo(user)) redirect(`/gameinfo/${lang}/russia-check`);
  return <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <Link href={`/gameinfo/${lang}/russia-check`} className={buttonVariants({ variant: "ghost", className: "w-fit" })}><ArrowLeft data-icon="inline-start" />กลับ Russia Check</Link>
    <header className="flex flex-col gap-2"><h1 className="text-2xl font-semibold tracking-tight">เชื่อมบัญชีผ่าน Browser</h1><p className="text-muted-foreground">Login ที่เว็บ Infold หรือ Gryphline ตามปกติ แล้วให้ส่วนขยายส่ง Session มาตรวจสอบและบันทึก ไม่ต้องเปิด DevTools</p></header>
    <Card>
      <CardHeader><CardTitle>Russia Check Connector <Badge variant="secondary">v{RUSSIA_CHECK_EXTENSION_VERSION}</Badge></CardTitle><CardDescription>Chrome / Microsoft Edge บนคอมพิวเตอร์ · ติดตั้งเฉพาะผู้ดูแลที่เชื่อมบัญชี</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4"><RussiaCheckExtensionDetection /><p className="text-sm text-muted-foreground">ไฟล์ ZIP ผูกกับโดเมนเว็บที่คุณดาวน์โหลด ไม่รวมข้อมูล Login และยังไม่ได้เผยแพร่บน Chrome Web Store</p></CardContent>
      <CardFooter><a href="/api/gameinfo/russia-check/extension/download" className={buttonVariants()} download><Download data-icon="inline-start" />ดาวน์โหลดส่วนขยาย (.zip)</a></CardFooter>
    </Card>
    <Card>
      <CardHeader><CardTitle>ติดตั้งครั้งแรก</CardTitle><CardDescription>ติดตั้งเพียงครั้งเดียวใน browser profile ที่ใช้ GameInfo</CardDescription></CardHeader>
      <CardContent><ol className="flex list-decimal flex-col gap-3 pl-5">
        <li>ดาวน์โหลด ZIP แล้วแตกไฟล์ไว้ในโฟลเดอร์ถาวร อย่าลบโฟลเดอร์หลังติดตั้ง</li>
        <li>พิมพ์ <code>chrome://extensions</code> หรือ <code>edge://extensions</code> ในช่องที่อยู่ของเบราว์เซอร์</li>
        <li>เปิด <strong>Developer mode / โหมดนักพัฒนาซอฟต์แวร์</strong></li>
        <li>กด <strong>Load unpacked / โหลดส่วนขยายที่คลายการแพค</strong> แล้วเลือกโฟลเดอร์ที่มี <code>manifest.json</code></li>
        <li>รีโหลดหน้า GameInfo แล้วกด “ตรวจอีกครั้ง” ด้านบน ต้องขึ้นว่าพบส่วนขยาย</li>
      </ol></CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>เชื่อม Love and Deepspace / Infinity Nikki / Endfield</CardTitle><CardDescription>ใช้บัญชีและตัวละครเดิมเมื่อเชื่อมใหม่ ไม่ได้บังคับพื้นที่เป็น RU</CardDescription></CardHeader>
      <CardContent><ol className="flex list-decimal flex-col gap-3 pl-5">
        <li>กลับ Russia Check → เลือกเกมหรือทุกเกม → กดรีข้อมูล ระบบจะเปิด Login เฉพาะเกมที่ Session ขาดทีละเกม</li>
        <li>ตรวจชื่อเว็บปลายทางใน popup ของส่วนขยาย แล้วกดอนุญาต</li>
        <li>Login บนเว็บผู้ให้บริการและเลือกตัวละครจนเห็นแพ็ก เปิดหน้า GameInfo ค้างไว้</li>
        <li>เมื่อทดสอบผ่าน popup จะปิดเอง แล้วรีข้อมูลต่ออัตโนมัติ หรือใช้ “จัดการ Login” เพื่อเชื่อมล่วงหน้าได้</li>
      </ol></CardContent>
    </Card>
    <Alert><ShieldCheck /><AlertTitle>ข้อมูลที่ส่วนขยายเข้าถึง</AlertTitle><AlertDescription>ขอสิทธิ์เฉพาะเว็บนี้และโดเมนร้าน/API ของ Infold กับ Gryphline รับเฉพาะคำขอรายการแพ็กจาก popup ที่อนุญาต ไม่อ่านรหัสผ่าน Cookie ประวัติ หรือข้อมูลจากแท็บอื่น ไม่เก็บ Session ในส่วนขยาย และไม่ส่งคำขอซื้อสินค้า ข้อมูล Session ถูกส่งให้เว็บนี้ตรวจสอบและเก็บแบบเข้ารหัส</AlertDescription></Alert>
    <Card><CardHeader><CardTitle>หากเชื่อมไม่ได้ / อัปเดต / ถอนการติดตั้ง</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 text-sm">
      <p>ใช้ Chrome/Edge เวอร์ชัน 120 ขึ้นไปในโหมดปกติ หากเครื่ององค์กรไม่อนุญาต Developer mode ให้ใช้การนำเข้า Form Data แบบเดิม</p>
      <p>ไม่พบส่วนขยาย: ตรวจว่าเปิดใช้งาน ดาวน์โหลดจากโดเมนเดียวกัน และรีโหลดหน้าเว็บหลังติดตั้ง ปิดส่วนขยาย Connector สำเนาอื่นให้เหลือเพียงชุดเดียว</p>
      <p>หมดเวลา: ปิด popup แล้วเริ่มใหม่ โดยไม่ปิดหรือรีโหลด GameInfo ระหว่างเชื่อม หากตรวจสอบเริ่มไปแล้ว ให้รอผลก่อนทำซ้ำ</p>
      <p>อัปเดต: แตก ZIP รุ่นใหม่ทับโฟลเดอร์เดิม แล้วกด Reload ที่หน้าส่วนขยาย จากนั้นรีโหลด GameInfo</p>
      <p>ถอนการติดตั้ง: กด Remove ที่หน้าส่วนขยาย ส่วน Session ที่บันทึกในเว็บจะยังอยู่ หากต้องการตัดการเชื่อม ให้กด “ลบ Session” ในจัดการ Login ด้วย</p>
    </CardContent></Card>
  </div>;
}
