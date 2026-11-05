# Topup Inventory performance — 3 November 2026

ปรับ source ต่อจากผลตรวจหน้า Topup Inventory โดยเริ่มจาก USDCodashop ที่เคยพบ HTTP 524 และลดงานซ้ำใน WavePay ไม่ได้ deploy, push, เปลี่ยนสิทธิ์ หรือรัน migration/index/ธุรกรรมบน production

## สิ่งที่เปลี่ยน

- **USDCodashop SQL:** บังคับให้รายการ invoice ซ้ำคำนวณครั้งเดียวด้วย materialized CTE; รวมเฉพาะข้อมูลที่ใช้กรอง/สรุปก่อน แล้วสร้าง JSON ของ fills เฉพาะ customer orders ในหน้าที่เลือก ลดการสร้าง JSON ทั้ง ledger ก่อน LIMIT
- ยังรวมออเดอร์ครบทุก fill ก่อนกรองวันที่/คำค้น/กำไร รวมยอดทุกหน้า และใช้ SQL statement เดียวสำหรับยอดสรุป ยอดบอทล่าสุด ยอดสะสม และรายการในหน้า ไม่ตัดรายการย่อยของออเดอร์ที่ข้ามวันหรือหน้า
- **HTTP reads:** USD และ WavePay ใช้ read session ที่รวมคำขอซ้ำของมุมมองเดียวกัน ยกเลิก fetch/body parsing ของมุมมองเก่าเมื่อเปลี่ยนหรือออกหน้า และหมดเวลาที่ 60 วินาที ไม่มีการ retry/cancel คำสั่งซิงก์ รับเงิน หรือบันทึกเงิน
- **USD polling:** เริ่มรอบถัดไปหลังคำขอเดิมจบ; เว้น 30 วินาทีเมื่อสำเร็จ และ backoff เป็น 60/120 วินาทีเมื่อ polling ล้มเหลว พักการเริ่ม poll เมื่อซ่อนแท็บ เปิดฟอร์มเงินเข้า หรือ export
- **USD SQL deadline:** รอ client จาก pool ไม่เกิน 8 วินาที รวมการขอ connection ครั้งแรกของ schema setup; SELECT รายงานใช้ server-side statement timeout 25 วินาที และ CSV 45 วินาที ใน transaction แบบ read only การตั้ง timeout อยู่เฉพาะ transaction และ rollback/release ก่อนคืน client เมื่อผิดพลาด ไม่ใช่ Promise timeout ที่ปล่อย SQL ทำงานต่อโดยไม่มีขอบเขต
- การยกเลิกจาก browser ไม่ได้แปลว่า SQL ที่เริ่มทำงานแล้วถูกหยุดทันที: ตรวจ signal ก่อนเริ่ม/หลังจบ SQL และ SQL ที่ยังทำงานอยู่ถูกจำกัดด้วย statement timeout ฝั่ง PostgreSQL ส่วน browser CSV มี deadline 90 วินาที
- **WavePay metadata:** ใช้ Map หา listing/pack group แทนการ filter/find ทั้งชุดใหม่ทุกแถว เก็บหลักเลือก source, fallback เดิม และการแบ่งยอดหลายแพ็กไว้
- **การวัด:** USD GET เพิ่ม `Server-Timing` ของ auth/schema/rates/pool/sql/total; WavePay GET เพิ่ม auth/orders/balances/metadata/rates/total รวม error response และยังส่ง `Cache-Control: no-store`
- **Session:** React cache รวมการอ่าน session/user ซ้ำเฉพาะ server render/request เดียว ไม่เก็บ grants ข้าม request/ผู้ใช้ และไม่เปลี่ยนการตรวจสิทธิ์ของ API
- หน้าประวัติแสดงเวลาข้อมูลที่อ่านสำเร็จล่าสุด และระบุว่าเป็นข้อมูลเดิมเมื่อคำขอล่าสุดล้มเหลว

## ผลเทียบ query ในเครื่อง

ใช้ PGlite แยกจากฐานข้อมูลของแอป จำนวน 470 bot rows รวมออเดอร์ใหญ่ที่มี 110 fills, source ซ้ำชื่อกัน, invoice ซ้ำ, ยอดขายขาด/ศูนย์/ขัดแย้ง และรายการเงินเข้า เทียบกับ SQL เดิมที่เก็บเป็น test oracle

| Warm query | ค่ากลางจาก 3 รอบ |
| --- | ---: |
| เดิม | 789.64 ms |
| หลังปรับ | 53.02 ms |

ผลใน fixture นี้เร็วขึ้นประมาณ 14.9 เท่า ลดเวลาประมาณ 93% ใช้ rate เดียวกัน 33.66 THB/USD ไม่มีการเรียก provider จริง ตัวเลขนี้ไม่ใช่ production latency หรือ p95 และไม่ได้ยืนยันสาเหตุเดียวของ HTTP 524

เทียบผลลัพธ์ทั้ง object ตรงกัน **28 กรณี**: page/search/date/kind/profit bounds/export รวมทั้งกรณีไม่มี cost rate ยอดสรุป กลุ่ม order, fills, latest provider balance และค่าที่ข้อมูลไม่ครบคงเดิม การเพิ่ม read-only transaction/timeout ถูกทดสอบด้วย local DB และ pool stubs

## หลักฐานและคำสั่งตรวจ

ไฟล์ผลอยู่ที่ `C:/Users/wrd88/Documents/Codex/2026-10-31/https-tools-inblackm-com-https-tools/outputs/topup-performance-2026-11-03/`

- `ledger-query-benchmark.json`: paired warm samples, fixture size และ rate
- `browser-read-checks.json`: อ่านช้า 32 วินาที มี active HTTP read สูงสุดหนึ่งคำขอ; เปลี่ยนเบอร์ WavePay ยกเลิกคำขอเก่าสองครั้ง; จำลองอ่าน 65 วินาทีแล้ว browser ยกเลิกที่ประมาณ 59,995 ms และกดโหลดใหม่สำเร็จ
- `tests.log`: 173 suites / 6,025 assertions / zero failures; `build.log`: production build ผ่าน; `lint.log`: targeted ESLint ผ่าน
- SQL integration แยกอีก 5 scripts ผ่าน: inventory DDL/rollback/idempotency, ledger/replay/negative balance, grouped orders, exact receipt/source allocation และ retained sale conversion
- `wavepay-loaded.png`, `wavepay-read-error.png`, `wavepay-read-deadline.png`, `usdcodashop-loaded.png`: โหลดสำเร็จ, error, deadline และข้อมูลเดิมพร้อมเวลาที่อ่านล่าสุด ตรวจรายละเอียด Order และ CSV แล้ว ไม่มี console error

```powershell
node tests/run.mjs
npm run build
$env:PGLITE_MODULE = (Join-Path (Get-Location) 'node_modules/@electric-sql/pglite/dist/index.js')
node --import ./tests/register.mjs tests/usdcodashop-group-sql.mjs
node --import ./tests/register.mjs scripts/inventory-performance-preview.mjs
```

Preview: `http://127.0.0.1:4192/usdcodashop` และ `/wavepay` ใช้คอมโพเนนต์จริงกับ HTTP fixtures ในเครื่องเท่านั้น ปุ่มจำลองช้า/ล้มเหลวเป็นเครื่องมือ QA ไม่ได้อยู่ในหน้าจริง และ fixture ไม่รับ business writes

## ขอบเขตที่ยังต้องวัดหลัง deploy

ยังไม่มี production EXPLAIN/BUFFERS, deployed revision, effective indexes หรือ p50/p95 รอบใหม่ จึงยังไม่เพิ่ม index หรือ cache ยอดเงินข้าม request

WavePay ยังอ่านทั้งช่วงวันที่แล้วคำนวณก่อนแบ่งหน้า การ reuse snapshot/ย้าย pagination ลง SQL ต้องเทียบยอดขายที่กระจายหลายแพ็ก ยอดทุกเบอร์ และเรทต้นทุนบนข้อมูลจริงก่อน รอบนี้ลด CPU lookup และคำขอเก่า พร้อมเพิ่ม stage timing สำหรับวัดเส้นทางนั้น ไม่ได้อ้างว่าแก้ I/O ซ้ำของ WavePay ทั้งหมดแล้ว

ก่อนประเมิน production ให้ใช้ Server-Timing เปรียบเทียบ cold/warm และหน้ากรอง/หน้าถัดไป แยก pool wait, SQL และเรท คงการตรวจ grants สดจาก API และใช้ข้อมูลชุดเดียวกันเทียบยอด ไม่ใช้ HTTP 200, build หรือ benchmark ในเครื่องเป็นหลักฐานความถูกต้องของยอดบน production
