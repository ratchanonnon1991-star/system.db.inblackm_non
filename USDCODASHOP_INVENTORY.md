# USDCodashop Inventory

หน้า `/projectm/th/topup-inventory/usdcodashop` เปิดจาก Topup Inventory
Moniepoint ยังเป็น “เร็ว ๆ นี้”; iTune และ URL Admin/Topup เดิมไม่เปลี่ยน

## ข้อมูลและการใช้งาน

- เพิ่ม/แก้ไขไอดี สถานะ ปัจจุบัน และใช้ไป หน่วย USD
- คงเหลือคำนวณจาก `ปัจจุบัน - ใช้ไป` ใช้จำนวนเต็มหน่วย cent เพื่อไม่คลาดเคลื่อนจาก floating point
- รับเลขติด comma / ทศนิยมไม่เกิน 2 ตำแหน่ง ห้ามติดลบและห้ามใช้ไปเกินปัจจุบัน
- ผู้ลงรายการมาจากบัญชีที่เข้าสู่ระบบ ไม่รับชื่อผู้ลงรายการจากฟอร์ม
- ปุ่ม “เตรียมข้อมูลจากชีท” แสดงเมื่อยังไม่มีรายการ: เตรียมเฉพาะ `[BOT] (USD) Codashop`, ปัจจุบัน 15665.80, ใช้ไป 1047.79, คงเหลือ 14618.01
- นี่คือยอดที่ผู้ใช้แจ้ง ไม่ใช่ยอดสด ตรวจสอบก่อนกดบันทึก ไม่มีการสร้างแถวจริงอัตโนมัติ
- ไม่เพิ่ม Skrill / Shop2Topup / Smilecode / Tevau จากชีท
- บันทึกเองเท่านั้น ไม่เชื่อม Codashop, PG2 หรือหักเงินอัตโนมัติ

## สิทธิ์และฐานข้อมูล

- `projectm.admin`: ดู เพิ่ม แก้ไข
- `projectm.claim`: ดูอย่างเดียว ตามการแยก Admin/Topup เดิม
- API ตรวจสิทธิ์ทุกครั้ง ไม่อาศัยแค่การซ่อนปุ่ม
- ใช้ฐานข้อมูลหลักของแอป (`getPool()`) ไม่ใช้ฐาน iTune หรือฐาน PG2
- ตารางใหม่ `gamedb_usdcodashop_inventory` และ `gamedb_usdcodashop_inventory_log` สร้างแบบ idempotent เมื่อเรียกใช้ครั้งแรก ต้องมีสิทธิ์ CREATE TABLE ตามฐานข้อมูลแอปเดิม
- ไม่ต้องเพิ่ม ENV และไม่เปลี่ยนตาราง iTune
- บันทึกก่อน/หลังกับผู้แก้ไขใน transaction เดียว; audit ล้มเหลวจะ rollback ทั้งรายการ
- การเพิ่มใช้ request ID กันบันทึกซ้ำเมื่อเครือข่ายขาด การแก้ไขใช้ version กันข้อมูลเก่าทับข้อมูลใหม่
- ขณะนี้แสดงสูงสุด 1000 รายการ ไม่มีปุ่มลบ

## ตรวจสอบ

```bash
npm test
npm run build
node scripts/usdcodashop-smoke.mjs
node --import ./tests/register.mjs scripts/topup-inventory-smoke.mjs
```

SQL integration เพิ่มเติม: ตั้ง `PGLITE_MODULE` ให้ชี้ ES module ของ PGlite ที่ติดตั้งไว้ แล้วรัน `node --import ./tests/register.mjs tests/usdcodashop-sql.mjs` (ฐานจำลอง ไม่ใช้ข้อมูลจริง)
