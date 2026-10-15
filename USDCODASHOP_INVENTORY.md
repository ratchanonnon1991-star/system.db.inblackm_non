# USDCodashop Inventory

หน้า `/projectm/th/topup-inventory/usdcodashop` เปิดจาก Topup Inventory
Moniepoint ยังเป็น “เร็ว ๆ นี้”; iTune และ URL Admin/Topup เดิมไม่เปลี่ยน

## บัญชีเดียวและประวัติ Orders (เวอร์ชันปัจจุบัน)

- หน้าเดิมเปลี่ยนเป็นบัญชี USDCodashop บัญชีเดียว ไม่เพิ่ม Skrill/Tevau หรือบัญชีอื่น
- Projectm Admin ต้องยืนยันยอดยกมาหลัง `K7306171` ก่อนเริ่ม ค่าเสนอจากชีทคือ **9,373.17 USD** ไม่ใช่ยอดสด และไม่ตั้งค่า/นำเข้าอัตโนมัติระหว่าง deploy
- ตรวจรายการอ้างอิงกับฐานข้อมูลจริงแล้วเป็น `codashop_orders.id=287399`; การใช้งานจริงค้นหาใหม่และต้องตรงเพียงรายการเดียว หากไม่พบหรือเปลี่ยนจะหยุด ไม่เดาจากเลข Order เรียงตัวอักษร
- ปุ่ม **ซิงก์ Orders** อ่าน `payment_method='CodashopUSD'`, `status='completed'`, `id > boundary_id` ไม่รวม K7306171
- ใช้ยอด `inventory_transactions.amount_used` เมื่อมีธุรกรรมเดียวและยอด USD ถูกต้องเท่านั้น ไม่ใช้ `pack_price` เดา หากไม่มี/หลายธุรกรรม/เกินสองทศนิยมจะหยุดทั้งชุดและแจ้ง Order ให้ตรวจสอบ ไม่มีการหักยอดบางส่วนแล้วทิ้งรายการที่ผิด
- ซิงก์ซ้ำไม่บันทึก/หักซ้ำ มี unique source ID และล็อกการเขียนใน transaction เดียว สแกนใหม่หลังจุดเริ่มทุกครั้งเพื่อเก็บรายการที่เพิ่ง completed ภายหลัง รายการที่ต้นทางหายไปยังคงประวัติ ไม่คืนเงินเอง
- ประวัติเรียงตามเวลาธุรกรรม (timestamp ต้นทางตีความเป็น Asia/Bangkok) และเลขแถว สามารถค้นหา Order/เกม/แพ็ก/ผู้ทำรายการ/Transaction พร้อมแบ่งหน้า 100 แถว ยอดคงเหลือคิดจากทุกแถวก่อนค้นหา
- **บันทึก USD เข้า** ใช้เมื่อเงินเข้าจริงแล้ว มีเลขอ้างอิง/หมายเหตุ ผู้ลงรายการ และ request ID กันบันทึกซ้ำ ลงเวลาปัจจุบัน ไม่ใช่คำสั่งโอนเงินจริง
- ยอดคงเหลือ = ยอดยกมา + USD เข้า − USD ออก; ยอดติดลบแสดงจริงพร้อมคำเตือน ไม่ซ่อนหรือบีบเป็นศูนย์
- ยอดบอท `balance_after` เป็นข้อมูลเทียบเท่านั้น: ขณะตรวจ K7306171 บอทแสดง 9,401.45 ซึ่งต่างจากชีท 9,373.17 จึงไม่ใช้แทนยอดยกมา ไม่เติมส่วนต่างอัตโนมัติ
- ไม่คำนวณกำไร/อัตราแลกเปลี่ยนจากการเดา และไม่บันทึก email/password/raw_data/provider_response ทั้งก้อน เก็บเฉพาะฟิลด์ที่จำเป็นและเลข orderId ของผู้ให้บริการ
- มี **worker ซิงก์เบื้องหลัง** ทุก 60 วินาทีหลังรอบก่อนเสร็จ แม้ปิดหน้าเว็บ และยังกดซิงก์เองได้ ไม่เรียก API เติมเกม

### ซิงก์อัตโนมัติบน server

- PM2 process ใหม่ `usdcodashop-sync-worker` (fork, 1 instance) ใช้ `scripts/usdcodashop-sync-worker.mjs` เริ่มพร้อมเว็บผ่าน deploy-server.sh และ workflow deploy ที่อัปเดตแล้ว
- ไม่ต้องเพิ่ม secret ใหม่ ใช้ PG_* ของฐานหลักกับ PROFIT_DATABASE_URL เดิม โหลด ENV จากโฟลเดอร์โปรเจกต์ ไม่ส่ง cookie/secret ผ่าน HTTP
- ต้องยืนยันยอดยกมาบนหน้าเว็บครั้งแรกก่อน worker จะเริ่มนำเข้า ไม่สร้างบัญชีหรือเดายอดเอง
- ผู้บันทึกอัตโนมัติเป็น `USDCodashop Auto Sync` (system actor id=0 ไม่ใช่พนักงาน) ใช้ transaction/unique source ID เดียวกับปุ่มซิงก์ จึงไม่หักซ้ำเมื่อกดพร้อม worker หรือ restart
- อ่านฐานต้นทางผ่าน connection แยกที่บังคับ default_transaction_read_only=on และ timeout; เขียนเฉพาะ ledger/status ในฐานหลัก ไม่แก้ balance ของผู้ให้บริการ
- ไม่มีรอบทับซ้อนใน process เดียว ถ้าฐานขัดข้อง/รายการไม่ชัดเจนจะหยุดชุดนั้นและลองใหม่ใน 60 วินาที ไม่ข้าม Order ผิดไปเงียบ ๆ
- เก็บ heartbeat/ผลสำเร็จ/ข้อผิดพลาดที่ปลอดภัยใน `gamedb_coda_sync_status` หน้าเว็บแสดงสถานะและโหลด GET ใหม่ทุก 30 วินาทีขณะมองเห็นหน้า (ไม่โหลดระหว่างกรอกเงินเข้า) ปิดเว็บไม่กระทบ worker
- ถ้า heartbeat หายเกิน 3 นาทีจะแจ้งให้ตรวจ worker; SIGTERM/SIGINT รอ transaction ที่กำลังทำก่อนปิด มีเวลาปิดสูงสุดและ PM2 restart เมื่อ process crash
- ปิดชั่วคราวด้วย `pm2 stop usdcodashop-sync-worker` หรือกำหนด `CODASHOP_AUTO_SYNC_ENABLED=false` ใน ENV แล้ว restart worker (ไม่ต้องแก้ .env เพื่อเปิดตามปกติ)
- เงินเข้า/ยอดเติมยังต้องบันทึกเอง เพราะไม่มีแหล่งธุรกรรมเติมเงินที่ยืนยันได้จากคำขอนี้

ตรวจหลัง deploy บนเครื่องที่ให้บริการจริง:

```bash
pm2 ls
pm2 logs usdcodashop-sync-worker --lines 30 --nostream
```

ถ้า deploy วิธีอื่นไม่ได้เรียก ecosystem พร้อม worker ให้เริ่มจากโฟลเดอร์โปรเจกต์:

```bash
pm2 startOrRestart ecosystem.config.cjs --only usdcodashop-sync-worker --update-env
pm2 save
```

หมายเหตุ: workflow ที่มีอยู่ยังระบุ host 143.14.11.252:48995 แต่ server ที่ผู้ใช้แจ้งล่าสุดคือ 157.85.104.218:55025 จึงอย่าสรุปว่า Actions deploy มาที่เครื่องใหม่แล้ว ต้องตรวจ/ปรับปลายทางแยก หรือใช้ deploy-server.sh บนเครื่องจริง ไม่เปลี่ยน host/credential อัตโนมัติในงานนี้

### ฐานข้อมูลและ ENV ของประวัติ

- ใช้ `PROFIT_DATABASE_URL` ที่ระบบ Profit ใช้อยู่แล้วเพื่อ **อ่านอย่างเดียว (SELECT)** จากฐานที่มี `codashop_orders`, `telegram_orders_dev`, `inventory_transactions` ห้ามใช้บัญชีฐานข้อมูลที่มีสิทธิ์เขียนถ้าไม่จำเป็น
- ถ้า server ยังไม่มีตัวแปรนี้ ให้เพิ่มใน ENV ของ server และ restart/redeploy ตามระบบเดิม ไม่ใส่ credential ลง Git
- บันทึกเฉพาะฐานหลักของแอปในตารางใหม่ `gamedb_coda_wallet` (singleton) และ `gamedb_coda_ledger` (ประวัติถาวรพร้อมผู้บันทึก/เวลา) สร้างเมื่อเรียกใช้ ต้องมีสิทธิ์ CREATE TABLE
- ไม่แก้ตารางหรือยอดของ bot/PG2 และไม่เปลี่ยน iTune
- ตารางยอดกรอกมือเดิมและ audit เดิมยังอยู่ ไม่ลบ/แปลงยอดเก่าเอง หน้าใหม่ไม่ใช้ CRUD เดิมคำนวณยอด ไม่มีปุ่มแก้ย้อนหลัง/ลบ/รีเซ็ตยอดยกมา
- ซิงก์อ่านสูงสุด 25,000 รายการต่อครั้ง; เกินจะหยุดโดยไม่เปลี่ยนยอด ไม่ตัดประวัติเงียบ ๆ

### ทดสอบประวัติ

```bash
node --import ./tests/register.mjs tests/usdcodashop-ledger-tests.mjs
node --import ./tests/register.mjs tests/usdcodashop-auto-sync-tests.mjs
node scripts/usdcodashop-ledger-smoke.mjs
```

SQL integration (PGlite ฐานจำลอง ไม่เขียนฐานจริง): ตั้ง `PGLITE_MODULE` ให้ชี้ ES module ที่ติดตั้งไว้ แล้วรัน `node --import ./tests/register.mjs tests/usdcodashop-ledger-sql.mjs`

## ข้อมูลและการใช้งานเวอร์ชันกรอกมือเดิม (เก็บไว้เพื่ออ้างอิง)

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
