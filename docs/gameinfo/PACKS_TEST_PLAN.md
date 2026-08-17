# Gameinfo UID packs test plan

แผนนี้เป็น test-first checklist สำหรับ backlog ใน `PACKS_TASKS.md` ไม่ใช่การ import ข้อมูลจริงจาก XLSX

## 0. Characterization tests ก่อน refactor

เพิ่ม/ขยาย `tests/gameinfo-gamelist-packs-tests.mjs`:

- round-trip currency → category → pack รักษาลำดับและ immutable IDs
- save ปัจจุบัน rollback เมื่อ insert ใดล้ม
- computed sentinel เดิมอ่านได้
- pack count ไม่รวม sentinel
- pack fields ที่ไม่รู้จักถูก sanitizer ตัดออก ไม่ถูกเก็บเผื่อ
- API ปฏิเสธ invalid game ID และ malformed body

เพิ่ม test fixture ขนาดเล็กที่สรุป XLSX (ห้าม commit ไฟล์จริงทั้งก้อน):

- เกมทั่วไป 2 categories
- เกมที่มีช่องทางหลัก/รองหลายค่า
- เกมที่ใช้ cost สอง profile
- เกมที่มี formula ระดับคอลัมน์และ override หนึ่งแถว
- สูตรเสียหนึ่งสูตรเพื่อทดสอบ error isolation

## 1. Duplicate pack (Task 1)

Unit:

- clone ได้ค่า field ที่ allowlist ครบ
- ID ใหม่ไม่เท่าต้นฉบับ
- source object ไม่ถูก mutate
- row formula overrides ถูก copy โดย key เปลี่ยนเป็น ID ใหม่
- revision/audit timestamps ไม่ถูก copy

Integration/API:

- duplicate pack ที่มีชื่อ/ข้อมูลเหมือนกันได้
- duplicate pack ที่ไม่พบคืน 404
- game ID กับ pack ID คนละเกมคืน 404
- duplicate สอง request ได้สอง ID ที่ไม่ซ้ำ
- insert pack และ audit log commit/rollback พร้อมกัน

UI:

- ปุ่ม duplicate วางสำเนาถัดจากต้นฉบับ
- cancel คืน state ก่อน duplicate
- save/reload แล้วลำดับถูกต้อง
- required-field highlight ยังทำงานกับสำเนา

## 2. CSV guide/import (Task 2 และ Task 6)

Parser:

- bulk import ผูกด้วย numeric `game_id`
- ไม่มี/ติดลบ/ไม่ใช่ตัวเลขถูก skip พร้อมเลขแถว
- `game_name` ต่างจาก DB ไม่เปลี่ยน target game
- single-game import ignore `game_id` ทุกแถว
- append สร้าง pack ID ใหม่ทุกแถว แม้เนื้อหาซ้ำ
- replace ไม่แตะเกมที่ไม่มีในไฟล์
- delimiter ใน channel รองรับ comma/semicolon/pipe/newline ตาม contract
- `amount_charged` ถูก ignore พร้อม warning หลัง migration
- unknown columns ถูก ignore และไม่เข้า JSONB

Round-trip:

- export → import รักษาค่าที่ใช้แสดงจริง

### Bulk list-page CSV (Task 12)

- game list CSV ตรวจ required `game`, ชื่อซ้ำในไฟล์ และชื่อซ้ำในฐานข้อมูล
- game list batch insert commit ทั้งชุดหรือ rollback ทั้งชุด
- packs CSV group ด้วย numeric `game_id`; unknown ID เป็น blocking error
- replace และ add ให้ผลต่างกันตาม contract และไม่ลบ computed config
- bulk pack audit มี actor/source และ rollback พร้อม pack writes
- unknown headers ถูกปฏิเสธ ส่วน legacy header ที่อนุญาตเฉพาะ warning ไม่ถูก persist
- Unicode ไทย/จีน, comma, quote และ newline ไม่เสีย
- decimal string ไม่เสีย precision
- เกมไม่มี pack ยัง export reference row ได้ถ้ายังต้องรองรับ workflow นี้

## 3. Audit log (Task 4)

- create/update/delete/duplicate/reorder/import/config/formula/cost มี action ถูกต้อง
- log มี actor ID/name, game ID, pack ID, UTC timestamp และ before/after
- no-op save ไม่สร้าง log
- failed mutation และ rollback ไม่ทิ้ง log
- bulk import สร้าง summary event และ detail ที่ค้นย้อนหลังได้โดยไม่เกิน payload limit
- sanitizer ปิดบัง field sensitive ในอนาคต
- staff/user ที่ไม่มีสิทธิ์อ่าน log ได้ 403

### Combined audit history (Task 13)

- query รวม bind limit ที่ clamp แล้วและเรียง `created_at DESC, id DESC`
- mapping มี game name, pack ID, actor, action, before/after และ timestamp
- grouping แยก game → pack และ config event โดยไม่ทำรายการสูญหาย
- pack ที่ถูกลบใช้ชื่อจาก before data; duplicate ใช้ source/after ตามลำดับ

### Main formula editing (Task 14)

- edit สูตรหลักคง column key และ personal column layout เดิม
- ทุก pack ที่ไม่มี override ใช้สูตรหลักใหม่
- override ราย pack คงอยู่ตามค่าเริ่มต้น
- เลือก apply-to-all แล้วล้าง override เฉพาะคอลัมน์นั้น

### Named column presets + explicit order save (Tasks 15 + 16)

- preset query/saves bind `game_id`, `user_id` และ `surface`; ห้ามมี row ของผู้ใช้อื่นหลุดมา
- create/update เก็บ name, visible/hidden set และ order ใน JSONB ที่ sanitize แล้ว
- preset `edit` กับ `view` แยกกัน แม้เป็น game และผู้ใช้เดียวกัน
- เปิดหน้าแล้วโหลด preset ล่าสุด; เลือก preset เปลี่ยนทุก category/table พร้อมกัน
- drag/switch visibility/reset เปลี่ยน draft เท่านั้น และไม่มี write จนกดบันทึก
- save ปกติอัปเดต preset ที่เลือก; save-as-new สร้าง record ใหม่โดยไม่ทับชุดเดิม
- หน้า view บันทึก preset ส่วนตัวได้ แต่ไม่มี API สำหรับแก้ pack data
- layout จาก localStorage รุ่นเดิมถูกใช้เป็น draft migration เท่านั้น และไม่ถูกเขียนกลับอัตโนมัติ
- unknown/deleted/computed column ที่หายไปถูก drop ตอน normalize โดยไม่ทำให้ preset ใช้ไม่ได้

### Destructive delete confirmation (Task 17)

- ลบเกมจากหน้า list ทั้งแถวที่บันทึกแล้วและ draft ต้องเรียก confirmation ก่อน
- ยกเลิก confirmation แล้ว game-list rows, pack tree และ formula columns ต้องไม่เปลี่ยน
- ยืนยันลบเกมที่บันทึกแล้วจึงเรียก `DELETE` API; draft ลบเฉพาะ local state
- ลบ currency, category, pack และคอลัมน์สูตรจากหน้า packs ต้องถามก่อนทุกครั้ง
- ลบ tutorial category, step และรูปจาก modal ที่เปิดจากหน้า list ต้องถามก่อนทุกครั้ง
- ปุ่มลบที่ถูกยกเลิกต้องไม่สร้าง audit/write request

## 4. Personal columns/filter/order (Task 3, 5, 9)

State reducer/unit:

- toggle visibility ไม่ลบข้อมูล
- reorder แล้วทุก category ใช้ order เดียวกัน
- structural column/divider ถูก lock
- preset ที่อ้างคอลัมน์ถูกลบถูก migrate/reset
- symbol/format ไม่เปลี่ยน raw numeric value

Persistence:

- named preset ใน DB แยก user, game, edit/view และ schema version ที่ client normalize ได้
- ผู้ใช้ A ไม่เห็น preference ของ B
- edit preset ไม่ทับ view preset
- shared config เปลี่ยนแล้ว personal preference merge เฉพาะ key ที่ยังมีอยู่

Interaction/E2E:

- drag ซ้าย/ขวาและ keyboard reorder ได้
- reload แล้วยังจำค่า
- หน้า view สร้าง preset ได้แต่แก้ pack ไม่ได้
- ตารางหลาย category เปลี่ยนพร้อมกัน

## 5. Formula (Task 7, 8, 9)

Parser/evaluator:

- `+ - * /`, parentheses และ field reference
- column formula ใช้กับทุก pack
- row override ชนะ column formula
- ลบ override แล้ว fallback ทันที
- detect self-reference/cycle ระหว่าง computed columns
- divide by zero, missing field, invalid formula เป็น cell error ไม่ throw ทั้งหน้า
- `[USDT/THB]` และ `[CNY/THB]` resolve จาก rate context เดียวกับ field ปกติ
- numeric input ที่เป็น decimal string คำนวณได้

Formula mode UI:

- toggle ผลลัพธ์/สูตรไม่แก้ข้อมูล
- inherited กับ overridden มีป้ายต่างกัน
- effective formula ที่แสดงตรงกับสูตรที่ evaluator ใช้
- error cell เปิด editor ไปยังสูตรต้นเหตุได้
- icon `$`, `฿`, `%` แสดงเฉพาะ result mode ตาม config

## 6. Cost profiles (Task 11)

- create/update/delete profile มี validation และ audit
- profile ID stable แม้เปลี่ยน label
- pack เลือก profile แล้วคำนวณต้นทุนถูก
- profile ถูกใช้อยู่: delete ถูก block หรือมี explicit migration flow
- เปลี่ยน base value recalculates dependent cells โดยไม่แก้ pack raw data
- profile ของ game A ใช้ใน game B ไม่ได้
- duplicate pack รักษา cost profile reference ที่ยัง valid

## 7. Exchange rates (Task 10)

Fetcher/cache:

- pair allowlist ปฏิเสธค่าที่ไม่รองรับ
- fetched rate ต้องเป็น finite positive number
- cache อายุหนึ่งชั่วโมง
- concurrent refresh ใช้ single-flight ไม่ยิง provider ซ้ำ
- provider error ใช้ last-known-good และ mark stale
- ไม่มี last-known-good คืน unavailable ไม่คืน 0
- persisted history dedupe ตาม pair/hour
- timeouts/retries ถูกจำกัด

API/UI/formula:

- API ส่ง pair, rate, source, fetchedAt, stale
- หน้าจอแสดง current rate และเวลา
- chart เรียงเวลาและจัดการชั่วโมงที่ข้อมูลหาย
- formula rerun เมื่อ rate snapshot เปลี่ยน
- timezone ไม่ทำให้ข้อมูลซ้ำหรือตกชั่วโมง

## 8. Save/cancel/concurrency regression

- dirty state เปิดเมื่อแก้จริงและปิดหลัง response save สำเร็จ
- server response ถูกใช้เป็น baseline ใหม่หลัง save; ไม่เทียบกับ server props เก่า
- save error คง dirty state และข้อมูลผู้ใช้
- cancel คืน baseline ล่าสุด ไม่ใช่ค่าก่อน save ครั้งก่อน
- revision mismatch คืน 409 พร้อมข้อมูลสำหรับ reload/merge
- browser สองแท็บไม่เขียนทับกันเงียบ ๆ
- กดข้างนอก/Enter/Escape จบ edit ตาม interaction contract โดย Escape คืนค่าก่อน edit

## 9. Migration tests

- อ่านเกมที่มีเฉพาะ `__computed__` sentinel ได้
- backfill config ซ้ำได้ (idempotent)
- dual-read ให้ค่าตรงกับระบบเก่า
- migrated pack count และ computed column count เท่าก่อน migration
- rollback migration ไม่ลบ pack rows
- หลังตัด sentinel แล้ว list channel/VPN/count ยังถูกต้อง

## คำสั่งตรวจขั้นต่ำ

```bash
node --import ./tests/register.mjs tests/gameinfo-gamelist-packs-tests.mjs
node --import ./tests/register.mjs tests/gameinfo-import-tests.mjs
node --import ./tests/register.mjs tests/gameinfo-formula-tests.mjs
npm run lint
npm test
npm run build
```

เมื่อเริ่ม implement แต่ละ task ให้เปลี่ยน acceptance criteria ของ task นั้นเป็น failing test ก่อน แล้วทำเฉพาะ code ที่ทำให้ test ผ่าน
