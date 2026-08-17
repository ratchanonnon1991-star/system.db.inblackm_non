# Gameinfo UID packs backlog

เอกสารนี้เรียง task ใหม่ตาม dependency โดยยังคงหมายเลข task เดิมของผู้ใช้เพื่ออ้างอิงได้ตรงกัน

สถานะปัจจุบัน: Task 1, Task 2, Task 4 และ Task 6 ทำ milestone แรกแล้ว พร้อม unit/integration tests

## ลำดับที่ควรทำ

### Phase 0 — ล็อก contract และ baseline

1. ยืนยัน field ที่ใช้จริงตาม `CONTEXT.md`
2. เพิ่ม `schemaVersion` และ sanitizer สำหรับ pack/config
3. เขียน characterization tests ของ load/save/import/formula ปัจจุบันก่อน migration
4. ตัดสินใจ personal view ว่าเก็บ DB หรือ localStorage

เหตุผล: task 3, 7, 8, 9, 10 และ 11 ต่างต้องพึ่ง data contract เดียวกัน ถ้าทำ UI ก่อนจะต้องแก้ซ้ำ

### Phase 1 — งาน pack พื้นฐาน

#### Task 1: duplicate packs

- เพิ่ม action duplicate ที่ระดับ pack
- copy เฉพาะข้อมูลที่ผู้ใช้กรอกและ row formula overrides
- สร้าง `pack.id` ใหม่เสมอ
- วาง pack ใหม่ถัดจากต้นฉบับ และเติมชื่อ `(สำเนา)` หรือเลือกชื่อใหม่ก่อนบันทึก
- ห้าม copy audit metadata/revision

Acceptance criteria:

- duplicate pack ที่ข้อมูลเหมือนกันได้โดยไม่ชน primary key
- save/reload แล้วยังมีทั้งต้นฉบับและสำเนาในลำดับเดิม
- duplicate หลายครั้งได้
- undo/cancel ก่อน save ไม่เขียน DB

#### Task 6: เลิกใช้ “ยอดที่กด”

- ซ่อนและหยุดรับ `amountCharged`
- เหลือ `amountChargedFee` เป็น field ที่ใช้แสดง/คำนวณ
- CSV ใหม่ไม่รับ `amount_charged`
- migration ต้องอ่านข้อมูลเก่าได้ชั่วคราว แต่ห้ามเขียน field เก่ากลับ

Acceptance criteria:

- UI editor/view/formula picker ไม่มี “ยอดที่กด”
- export ไม่มี `amount_charged`
- import ที่มีคอลัมน์เก่าจะ ignore พร้อม warning ไม่ใช่ทำให้ import ล้ม

### Phase 2 — audit ก่อนเพิ่มความซับซ้อน

#### Task 4: ประวัติการแก้ไข

- log create, duplicate, update, delete, reorder, import replace/append
- log shared config, formula, format/icon และ cost profile changes
- เก็บ actor ID/name, action, game ID, pack ID, before/after, request source, timestamp
- เขียน log ใน transaction เดียวกับ mutation
- มีหน้า/Drawer ดูย้อนหลังและ filter ตาม action/user/time
- หลีกเลี่ยงเก็บ secret หรือข้อมูล ID+PASS ใน log เมื่อระบบส่วนนั้นมาถึง

Acceptance criteria:

- mutation สำเร็จมี log หนึ่งชุดที่ trace ได้
- mutation rollback ไม่มี orphan log
- เวลาแสดงตาม Asia/Bangkok แต่เก็บ UTC

### Phase 3 — ตารางและ personal view

#### Task 3: custom columns/filter ใน editor และ view

- shared config กำหนดว่าคอลัมน์ใด “มีอยู่” และค่าเริ่มต้นที่แสดง
- personal view กำหนด visible columns, order และ filter presets แยก edit/view
- เปลี่ยน preset แล้วมีผลกับทุก category/table ในหน้า game ID เดียวกัน
- หน้า view อ่าน pack อย่างเดียว แต่เพิ่ม personal filter preset ได้
- personal view ของคนหนึ่งห้ามกระทบอีกคน

Acceptance criteria:

- reload แล้วยังคง preset ตาม storage decision ใน Phase 0
- hidden columns ไม่ถูกลบจาก pack data
- schema เปลี่ยนแล้ว preset เก่าถูก migrate หรือ reset อย่างปลอดภัย

#### Task 5: ย้ายคอลัมน์ซ้าย/ขวา

- drag header เพื่อ reorder
- ใช้ลำดับเดียวกันทุก category ในหน้า
- ห้ามย้าย/แก้ divider หรือ structural columns
- order เป็น personal view ไม่ใช่เปลี่ยนลำดับ field ใน pack JSON

#### Task 9: icon/format ของคอลัมน์

- รองรับ prefix/suffix ที่จำเป็น: `$`, `฿`, `%`
- แยก stored numeric value ออกจาก display string
- format เป็น shared column config; personal view เลือกซ่อนได้แต่แก้ format กลางไม่ได้

### Phase 4 — formula model

#### Task 7: สูตรระดับคอลัมน์ + override รายแถว

- สูตรระดับคอลัมน์ apply ลงทุก pack
- pack บางแถว override สูตรได้
- ลบ override แล้วกลับไปใช้สูตรระดับคอลัมน์ทันที
- resolver รองรับ pack fields, game fields, cost profiles และ external rates ผ่านชื่อที่กำหนด
- validate dependency cycle และ division by zero

#### Task 8: โหมดดูสูตร

- ปุ่มสลับ `ผลลัพธ์ | สูตร`
- formula mode แสดง effective formula ของทุกเซลล์ พร้อมบอกว่า inherited หรือ overridden
- มีจุดรวมดูสูตรทั้งหมดของเกม และค้นหาตามคอลัมน์/pack
- error แสดงที่เซลล์โดยไม่ทำให้ทั้งตารางล้ม

Acceptance criteria ของ Phase 4:

- สูตรเดียวคำนวณต่อเนื่องทุกแถว
- override หนึ่งแถวไม่เปลี่ยนแถวอื่น
- duplicate pack copy override ได้ตาม Task 1
- เปลี่ยน external rate แล้วผลลัพธ์คำนวณใหม่โดยไม่แก้ pack JSON

### Phase 5 — ต้นทุนและ rate

#### Task 11: custom cost ต่อเกม

- เพิ่ม cost profiles ต่อเกม
- profile มีชื่อ, currency/input, base value, formula และเวลาที่แก้
- pack เลือก profile ที่ใช้ หรือสูตรอ้าง profile ตามชื่อที่ stable
- validate ไม่ให้ลบ profile ที่ยังถูกสูตรใช้อยู่โดยไม่ยืนยัน/แก้ dependency

ควรทำ Task 11 ก่อน Task 10 เพราะต้องรู้ว่า rate ถูกนำไปใช้กับต้นทุนอย่างไร ไม่เช่นนั้น API rate จะถูกผูกกับสูตรแบบเฉพาะกิจ

#### Task 10: USDT/THB และ CNY/THB

- background refresh สูงสุดรายชั่วโมง (24 ครั้ง/วันต่อ pair ไม่ใช่ต่อ client)
- server cache + persisted last-known-good rate
- แสดง rate ปัจจุบัน, source และ fetched time
- กราฟอ่าน history ที่เก็บแบบ hourly
- formula engine ใช้ `[USDT/THB]`, `[CNY/THB]` และ rate อื่นที่ allowlist
- provider ล้มให้ใช้ last-known-good พร้อม stale indicator; ห้ามแทนด้วย 0

Acceptance criteria:

- client หลายเครื่องไม่ทำให้เรียก provider ซ้ำ
- rate หมดอายุ trigger refresh เพียงหนึ่ง request
- สูตรยังคำนวณด้วยค่าล่าสุดที่สำเร็จและบอกว่า stale
- history มี unique key `(pair, fetched_hour)`

## Task 2: คู่มือ CSV template

งานนี้ทำได้ทันทีหลัง Phase 0 และควรส่งพร้อม Task 1/6

คู่มือต้องระบุ:

- `game_id` = `game_list.id` ตัวเลขจากปุ่ม export/หน้าเกม

## Task 12: CSV รวมสำหรับ game list และ packs หลายเกม

- รวมคำสั่ง CSV ไว้ใต้ปุ่มเดียวบน `/gameinfo/[lang]` ตาม workflow เดิมใน commit `ad368a79a109090ff22daec1cef5654232cce7ed`
- เพิ่มเกมหลายเกมจาก CSV โดยตรวจชื่อซ้ำและบันทึกทั้งชุดแบบ transaction
- นำเข้า packs หลายเกมด้วย `game_id` รองรับทั้งแทนที่และเพิ่มต่อ
- ดาวน์โหลดรายการเกมล่าสุด, packs ทุกเกม, template และคู่มือจากเมนูเดียว
- รับเฉพาะ field ที่หน้า GameInfo ใช้จริง; field เก่าที่ประกาศว่าเลิกใช้ให้เตือนและไม่นำเข้า
- bulk pack import ต้องสร้าง audit event พร้อม actor/source และ rollback ทั้งชุดเมื่อเกมใดเกมหนึ่งผิดพลาด

Acceptance criteria:

- preview ไม่เขียนฐานข้อมูลและแสดง error แยกตามแถว/เกม
- import ผิดหนึ่งเกมไม่เขียนเกมอื่นค้างไว้
- export → import รักษาโครงสร้าง currency/category/pack ของทุกเกม
- การแก้ไขในตาราง game list ที่ยังไม่บันทึกต้องเตือนก่อน reload หลัง import

## Task 13: ประวัติการแก้ไข packs แบบรวม

- เพิ่มทางเข้าจาก `/gameinfo/[lang]` สำหรับ admin/staff
- สรุปชั้นแรกตามเกม แล้วแยกตาม pack (รวมรายการ config/import ที่ไม่มี pack ID)
- ในแต่ละ pack แสดงจำนวนครั้ง, ผู้ที่เคยแก้, action และเวลาล่าสุด
- กด pack เพื่อดู timeline และ before/after ของรายการภายใน
- จำกัดจำนวนรายการและเรียงล่าสุดก่อน โดยเวลาแสดงเป็น Asia/Bangkok

Acceptance criteria:

- ผู้ไม่มีสิทธิ์แก้ layout อ่านประวัติรวมไม่ได้
- รายการจากหลายเกมไม่ปนกลุ่มกัน
- pack ที่ถูกลบยังค้นเจอด้วยชื่อจาก before data
- summary และ drill-down ใช้ audit rows ชุดเดียวกัน ไม่ยิง query ต่อ pack

## Task 14: แก้ไขสูตรหลักของคอลัมน์

- เพิ่มปุ่มแก้ไขบนหัวคอลัมน์สูตรในหน้า packs
- เปลี่ยนชื่อ, สูตร, type และสัญลักษณ์ของสูตรหลักได้
- บันทึกแล้วทุก pack ที่สืบทอดสูตรหลักแสดงผลใหม่ทันที
- สูตรเฉพาะ pack เป็นข้อยกเว้นที่ต้องคงไว้โดยค่าเริ่มต้น
- มีตัวเลือก “ใช้สูตรหลักนี้กับทุก pack” เพื่อล้าง override ทั้งหมดอย่างชัดเจน

Acceptance criteria:

- คอลัมน์สูตรเดิมแก้ได้โดยไม่เปลี่ยน `key` หรือ layout ส่วนตัว
- update สูตรหลักถูกบันทึกใน config audit event
- ล้าง override มีผลเฉพาะคอลัมน์ที่กำลังแก้ และสามารถยกเลิกก่อน save ได้
- bulk packs: ต้องมี game ID ที่มีอยู่จริง; `game_name` ไม่ใช้ผูก
- single-game packs page: URL game ID เป็น source of truth และ ignore `game_id` ในไฟล์
- append สร้าง `pack_id` ใหม่ทุกแถว จึง duplicate ได้
- replace กระทบเฉพาะเกมที่ preview และผู้ใช้ยืนยัน
- แสดง required/optional, ชนิดข้อมูล, ตัวอย่าง และคอลัมน์ที่ถูก ignore
- หลัง Task 6 ใช้ `amount_charged_fee` และไม่รับ `amount_charged`
- preview ต้องบอกจำนวน create/update/duplicate/skip ก่อน commit

## งาน migration ที่ควรแยก PR

1. เพิ่มตาราง config/audit/rate โดยยังอ่าน sentinel เดิมได้
2. backfill computed columns จาก `__computed__` ไป config
3. deploy dual-read ชั่วคราว
4. เปลี่ยน write ให้เขียน config ใหม่และหยุดสร้าง sentinel
5. ตรวจจำนวน pack/config ต่อเกม แล้วค่อยลบ sentinel ภายหลัง

ห้ามรวม schema migration, formula rewrite, rate provider และ UI table rewrite ไว้ใน PR เดียว

## Definition of done ทุก task

- unit/integration tests ตาม `PACKS_TEST_PLAN.md`
- `npm run lint`, `npm test`, `npm run build` ผ่าน
- API validate input ฝั่ง server ไม่พึ่ง client
- mutation มี audit log และ transaction ตาม phase ที่รองรับ
- cancel ไม่เขียน DB; save สำเร็จแล้ว dirty state ต้องหาย
- backward compatibility/migration ระบุชัด และไม่มีการลบข้อมูลเงียบ ๆ
