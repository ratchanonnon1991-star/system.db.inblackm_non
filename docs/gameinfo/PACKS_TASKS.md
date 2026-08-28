# Gameinfo UID packs backlog

เอกสารนี้เรียง task ใหม่ตาม dependency โดยยังคงหมายเลข task เดิมของผู้ใช้เพื่ออ้างอิงได้ตรงกัน

สถานะปัจจุบัน: Task 1–17 ทำ milestone ตามขอบเขต UID packs ครบแล้ว พร้อม unit/integration tests โดยส่วน ID+PASS ยังไม่อยู่ในขอบเขตรอบนี้

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

สถานะ milestone: preset เก็บทั้งคอลัมน์ที่แสดง ลำดับ และตัวกรองแถวแบบหลายเงื่อนไข (`มีคำว่า`, `เท่ากับ`, `มีข้อมูล`, `ว่าง`) แยก user/game/surface และใช้พร้อมกันทุก category

Acceptance criteria:

- reload แล้วยังคง preset ตาม storage decision ใน Phase 0
- hidden columns ไม่ถูกลบจาก pack data
- schema เปลี่ยนแล้ว preset เก่าถูก migrate หรือ reset อย่างปลอดภัย

#### Task 5: ย้ายคอลัมน์ซ้าย/ขวา

- drag header เพื่อ reorder
- ใช้ลำดับเดียวกันทุก category ในหน้า
- ห้ามย้าย/แก้ divider หรือ structural columns
- order เป็น personal view ไม่ใช่เปลี่ยนลำดับ field ใน pack JSON

สถานะ milestone: รองรับ pointer และ keyboard reorder; ตารางปัจจุบันไม่มี divider/structural column ที่ถูกทำเป็นข้อมูล จึงไม่มีสิ่งดังกล่าวให้ย้ายหรือแก้

#### Task 9: icon/format ของคอลัมน์

- กรอกสัญลักษณ์หรือข้อความแสดงผลเองได้อย่างอิสระ เช่น `$`, `฿`, `%`, `USD`, `Coins`
- ค่าที่กรอกบันทึกลง DB พร้อม shared computed-column config และเพิ่มข้อความใหม่ได้เรื่อย ๆ โดยไม่ใช้ allowlist
- จำกัดข้อความแสดงผลสูงสุด 24 ตัวอักษรและ render เป็น plain text
- แยก stored numeric value ออกจาก display string
- format เป็น shared column config; personal view เลือกซ่อนได้แต่แก้ format กลางไม่ได้

สถานะ milestone: ข้อความแสดงผลแบบ custom อยู่ใน shared computed-column config และเติมเฉพาะตอน render ผลลัพธ์ ไม่ถูกเขียนรวมในค่าดิบ

### Phase 4 — formula model

#### Task 7: สูตรระดับคอลัมน์ + override รายแถว

- สูตรระดับคอลัมน์ apply ลงทุก pack
- pack บางแถว override สูตรได้
- ลบ override แล้วกลับไปใช้สูตรระดับคอลัมน์ทันที
- resolver รองรับ pack fields, game fields, cost profiles และ external rates ผ่านชื่อที่กำหนด
- validate dependency cycle และ division by zero

สถานะ milestone: สูตรอ้าง computed column อื่นตามชื่อได้, dependency ถูกประเมินตามลำดับ, API/UI ปฏิเสธชื่อซ้ำและ cycle และ engine คืนค่าว่างเมื่อหารด้วยศูนย์

#### Task 8: โหมดดูสูตร

- ปุ่มสลับ `ผลลัพธ์ | สูตร`
- formula mode แสดง effective formula ของทุกเซลล์ พร้อมบอกว่า inherited หรือ overridden
- ใช้ตารางใน formula mode เป็นจุดรวมดูสูตรทั้งหมดของเกมตามคอลัมน์และ pack
- error แสดงที่เซลล์โดยไม่ทำให้ทั้งตารางล้ม
- หน้าแก้ไขกดเซลล์ใน formula mode เพื่อเปิดสูตรหลักหรือสูตรเฉพาะ pack ตามต้นทางจริง

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

สถานะ milestone:

- shared config เก็บ profile ID, ชื่อ, สกุลเงิน, ค่าพื้นฐาน, สูตรอัตรา และข้อมูลผู้แก้ล่าสุด
- pack เลือก profile ผ่านคอลัมน์ `ต้นทุนที่ใช้`; duplicate รักษา profile ID
- formula ใช้ `[ต้นทุน]` และ `[อัตราต้นทุน]` ได้ โดย `[ต้นทุน] = [ยอดที่กด + fee] × [อัตราต้นทุน]`
- API ปฏิเสธสูตร profile ที่ผิดและปฏิเสธ pack ที่อ้าง profile ที่ไม่มีอยู่

ควรทำ Task 11 ก่อน Task 10 เพราะต้องรู้ว่า rate ถูกนำไปใช้กับต้นทุนอย่างไร ไม่เช่นนั้น API rate จะถูกผูกกับสูตรแบบเฉพาะกิจ

#### Task 10: USDT/THB และ USDCNY

- background refresh สูงสุดรายชั่วโมง (24 ครั้ง/วันต่อ pair ไม่ใช่ต่อ client)
- server cache + persisted last-known-good rate
- แสดง rate ปัจจุบัน, source และ fetched time
- กราฟอ่าน history ที่เก็บแบบ hourly
- formula engine ใช้ `[USDT/THB]`, `[USDCNY]` และ rate อื่นที่ allowlist
- provider ล้มให้ใช้ last-known-good พร้อม stale indicator; ห้ามแทนด้วย 0

สถานะ milestone:

- `USDT/THB` ใช้ CoinGecko Simple Price และรองรับ Demo key ผ่าน `COINGECKO_DEMO_API_KEY` แบบไม่บังคับ
- `USDCNY` ใช้ Frankfurter โดยระบุ provider เป็น European Central Bank
- server cache แยกตาม pair: `USDT/THB` หนึ่งชั่วโมง, `USDCNY` สิบสองชั่วโมง (`GAMEINFO_RATE_CACHE_MS` ใน `src/lib/gameinfo-rate-schedule.js`)
- single-flight ต่อ pair และเก็บ history แบบ unique `(pair, fetched_hour)`
- background scheduler (`src/server/gameinfo-rate-scheduler.js` เริ่มจาก `src/instrumentation.js`) ยิง refresh เองตามเวลาไทย: `USDT/THB` ทุกต้นชั่วโมง xx:00, `USDCNY` เวลา 11:05 และ 23:05 — ไม่ต้องมีผู้ใช้เปิดหน้าค้างไว้
- scheduler ทำงานเฉพาะ production nodejs runtime และกันซ้ำด้วย global key เดียว; PM2 ตั้ง `instances: 1` จึงมีตัวจับเวลาชุดเดียวต่อ deploy
- API/UI แสดง source, fetched time, stale/error, กราฟ 48 จุดล่าสุด และปุ่ม Details อธิบายรอบอัปเดตของแต่ละ pair
- formula และตัวแปรผสมใช้ `[USDT/THB]`, `[USDCNY]` จาก snapshot เดียวกันโดยไม่เขียน rate ลง pack JSON

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
- bulk packs: ต้องมี game ID ที่มีอยู่จริง; `game_name` ไม่ใช้ผูก
- single-game packs page: URL game ID เป็น source of truth และ ignore `game_id` ในไฟล์
- append สร้าง `pack_id` ใหม่ทุกแถว จึง duplicate ได้
- replace กระทบเฉพาะเกมที่ preview และผู้ใช้ยืนยัน
- แสดง required/optional, ชนิดข้อมูล, ตัวอย่าง และคอลัมน์ที่ถูก ignore
- หลัง Task 6 ใช้ `amount_charged_fee` และไม่รับ `amount_charged`
- preview ต้องบอกจำนวน create/update/duplicate/skip ก่อน commit

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

## Task 15: preset การแสดงคอลัมน์ส่วนตัว

- บันทึกชุดคอลัมน์ที่แสดง/ซ่อนเป็น preset ที่ตั้งชื่อได้
- preset เป็นของผู้ใช้คนนั้น, game ID นั้น และแยกหน้า `edit`/`view` อย่างเด็ดขาด
- เลือก preset ที่บันทึกไว้เพื่อสลับการแสดงทุก category/table ในหน้าเดียวกัน
- หน้า view ที่อ่านข้อมูลอย่างเดียวสร้างและบันทึก preset ส่วนตัวได้ โดยไม่ให้แก้ pack data
- ใช้ฐานข้อมูลเป็น source of truth; ค่า localStorage รุ่นเก่าอ่านได้ครั้งเดียวเป็น draft เพื่อให้ผู้ใช้ตั้งชื่อและย้ายเข้าระบบ

Acceptance criteria:

- ผู้ใช้ A ไม่เห็นหรือเขียนทับ preset ของผู้ใช้ B
- preset หน้า edit ไม่ปนกับหน้า view
- ชื่อ preset, visible columns และ order ถูกโหลดหลัง refresh
- คอลัมน์ที่ถูกลบหรือยังไม่มีใน schema ปัจจุบันถูกละทิ้งอย่างปลอดภัยตอนแสดง/บันทึก

## Task 16: บันทึกลำดับคอลัมน์แบบ explicit

- การลากหัวตารางเปลี่ยนลำดับเพียงใน draft ของ preset ปัจจุบัน
- การซ่อน/แสดงและการลากคอลัมน์จะไม่เขียน localStorage หรือฐานข้อมูลอัตโนมัติ
- ผู้ใช้ต้องกด `บันทึก` เพื่ออัปเดต preset ที่เลือก หรือ `บันทึกเป็นใหม่` เพื่อสร้าง preset ชุดใหม่
- เมื่อเปลี่ยน preset ขณะมี draft ที่ยังไม่บันทึก ต้องยืนยันก่อนทิ้งการแก้ไข

Acceptance criteria:

- drag แล้ว refresh ก่อนกดบันทึก ลำดับจากฐานข้อมูลเดิมยังคงอยู่
- drag แล้วกดบันทึก และ refresh ลำดับถูกใช้กับทุก category/table ในหน้า
- save error คง draft ไว้ให้แก้/ลองบันทึกใหม่
- การกดคืนค่าเริ่มต้นเป็นเพียง draft จนกว่าจะกดบันทึก

## Task 17: ยืนยันก่อนลบข้อมูลในหน้า list และ packs

- ปุ่มลบเกมในหน้า list ต้องถามยืนยันทั้งเกมที่บันทึกแล้วและแถวเกมฉบับร่าง
- ปุ่มลบในหน้า packs ต้องยืนยันก่อนลบ currency, category, pack และคอลัมน์สูตร
- ปุ่มลบข้อมูล tutorial ที่เปิดแก้ไขจากหน้า list ต้องยืนยันก่อนลบหมวดหมู่, ข้อ และรูป
- กดยกเลิกในกล่องยืนยันต้องไม่เปลี่ยน draft และไม่เรียก API ลบ

Acceptance criteria:

- ทุก destructive button ในหน้า list/packs มี confirmation ก่อน mutation
- ข้อความยืนยันบอกชนิดข้อมูลที่กำลังลบ และกรณีเกมที่บันทึกแล้วบอกว่าเรียกคืนไม่ได้
- ยืนยันแล้วจึงลบจาก draft หรือเรียก API ตามสถานะข้อมูลเดิม

## Task 19: สถานะให้บริการเกมและ packs

- เพิ่มไฟสถานะเกม 4 แบบในหน้า list และหน้ารายละเอียดเกม:
  - เขียว: เกมเปิดและ packs ทุกอันเปิดให้บริการ
  - ส้ม: เกมเปิด แต่มี pack อย่างน้อยหนึ่งอันปิดให้บริการ
  - เทา: ปิดให้บริการทั้งเกม โดยสถานะนี้ชนะสถานะ packs
- เพิ่มสถานะเกม `ใหม่` เป็นไฟแดง โดยสถานะนี้ชนะไฟเขียว/ส้มและยังถือว่าเกมเปิดให้บริการ
- สถานะเปิด/ปิดเกมเก็บในตาราง `gamelist_service_status` เพื่อไม่แก้ schema ของ `game_list` ที่ใช้ร่วมกับระบบอื่น
- สถานะ pack เก็บ `serviceEnabled` และสถานะพิเศษ `serviceStatus: "new"` ใน JSON; ข้อมูลเก่าที่ไม่มี field เหล่านี้ถือว่าเปิด
- pack สถานะ `ใหม่` แสดงไฟสีแดง แต่ยังถือว่าเปิดให้บริการและไม่ทำให้ไฟเกมเป็นสีส้ม
- หน้า list เปลี่ยนสถานะเกมทีละเกมหรือหลายเกมได้ทันที
- หน้า packs เปลี่ยนสถานะทีละ pack หรือเปิด/ปิดทุก pack ในหมวดจากหัวหมวดได้ โดยยังเป็น draft และเขียนฐานข้อมูลเมื่อกดบันทึกตาม save/cancel เดิม
- checkbox แบบเลือกหลายรายการใช้เฉพาะหน้าเกม; หน้า packs ใช้คำสั่งเปิด/ปิดทั้งหมวดแทน

Acceptance criteria:

- ปิดเกมแล้วไฟเป็นเทาเสมอ แม้ packs ทุกอันเปิด
- เปิดเกมที่มี pack ปิดอย่างน้อยหนึ่งอันแล้วไฟเป็นส้มโดยอัตโนมัติ
- เปิด pack ที่ปิดทั้งหมดและบันทึกแล้ว ไฟเกมเปลี่ยนกลับเป็นเขียวหลังโหลดข้อมูลล่าสุด
- pack เก่าที่ไม่มี `serviceEnabled` ยังคงแสดงว่าเปิดให้บริการ
- bulk เกมตรวจว่า ID มีอยู่จริงและอัปเดตทั้งหมดใน transaction เดียว
- เปิด/ปิดทั้งหมวดยังเป็น draft; ยกเลิกแล้วสถานะกลับ baseline และบันทึกแล้วใช้ audit flow เดิม
- API ล้มเหลวต้องไม่เปลี่ยนไฟใน client และต้องแสดงข้อผิดพลาด
- ผู้ไม่มีสิทธิ์แก้ไขเห็นไฟสถานะได้ แต่กดเปลี่ยนสถานะไม่ได้

## Task 20: Popup ข้อควรระวังประจำเกม

- แยกข้อมูล `ข้อควรระวัง` ออกจาก Tutorial โดยใช้ editor/viewer รูปแบบเดียวกัน
- หน้า game list มีปุ่มข้อควรระวังอยู่ข้าง Tutorial สำหรับเพิ่มและแก้ไขข้อมูล
- หน้า view มีปุ่มข้อควรระวังอยู่ข้าง Tutorial และเปิด popup อัตโนมัติทุกครั้งที่เข้าหน้าเกม
- ปิด popup แล้วสามารถกดปุ่มข้อควรระวังเพื่อเปิดดูซ้ำได้
- popup อัตโนมัติทำงานเฉพาะเกมที่มีข้อมูลข้อควรระวัง เพื่อไม่แสดงกล่องว่างแก่ผู้ดู

Acceptance criteria:

- warning และ Tutorial โหลด/บันทึกแยกกัน การแก้ warning ไม่เขียนทับ Tutorial
- ผู้ไม่มีสิทธิ์แก้ไขอ่าน warning ได้ แต่แก้ไขไม่ได้
- หน้า list รู้ว่าเกมใดมี warning ด้วย summary query เดียว ไม่ยิง query ต่อแถว
- หน้า view เปิด warning ทุกครั้งที่ component ของหน้าเกมถูกเปิดใหม่ โดยไม่ใช้ session/localStorage ปิดถาวร
- ลบเกมแล้วข้อมูล Tutorial และ warning ถูกลบพร้อมแถว storage เดียวกัน

## Task 21: หลายลิงก์เว็บเติมเกมพร้อมชื่อ

- เปลี่ยนช่องกรอกข้อความ `Link` ในหน้า game list edit เป็นปุ่ม `จัดการลิงก์`
- หนึ่งเกมเพิ่มลิงก์ได้หลายรายการ โดยแต่ละรายการต้องมีชื่อปุ่มและ URL
- หน้า view แสดงปุ่มจริงตามชื่อที่ตั้งไว้ เพื่อบอกชัดเจนว่าแต่ละปุ่มพาไปหน้าใด
- เก็บรายการใหม่ใน side table `gamelist_links` โดยไม่ ALTER ตาราง `game_list` ที่ใช้ร่วมกับระบบอื่น
- ค่า `game_list.link` เดิมยังอ่านเป็นลิงก์ `เว็บเติมเกม` เมื่อเกมนั้นยังไม่เคยบันทึกผ่านตัวจัดการใหม่
- หลังบันทึกรายการใหม่แล้ว side table เป็น source of truth รวมถึงกรณีบันทึกเป็นรายการว่าง เพื่อไม่ให้ลิงก์ legacy กลับมาเอง

Acceptance criteria:

- รองรับสูงสุด 20 ลิงก์ต่อเกม และรับเฉพาะ `http://`/`https://`
- ชื่อและ URL เป็น required; validation ฝั่ง server ไม่พึ่ง client
- เกมที่มีหลายลิงก์แสดงปุ่มตามชื่อครบและเปิดแท็บใหม่อย่างปลอดภัย
- หน้า list โหลดลิงก์ทุกเกมด้วย query เดียว ไม่ query ต่อแถว
- save รายการลิงก์ไม่เปลี่ยน field อื่นใน `game_list`
- ลบเกมแล้วลบแถว `gamelist_links` ด้วย
- CSV legacy ที่มี `link` ยังนำเข้าได้และแสดงเป็นลิงก์เริ่มต้น

## Task 22: ตัวแปรผสมสูตร/ราคาชุดกลาง

- เพิ่มปุ่ม `ตัวแปรผสม` บน toolbar หน้าแก้ Game List ข้าง `จัดการ CSV` และให้หน้าแก้ Packs เปิดแก้ข้อมูลก้อนเดียวกันได้
- ตัวแปรหนึ่งตัวมีชื่อ, หมวดหมู่ (เว้นว่างเพื่อวางแบบลอย), ค่าคงที่หรือสูตร, ผู้แก้ล่าสุด และวันที่แก้ล่าสุด
- สูตรของตัวแปรอ้างค่า pack, ราคาแลกเปลี่ยน และตัวแปรอื่นด้วย `[ชื่อ]`; คอลัมน์สูตรและสูตรเฉพาะ pack อ้างตัวแปรชุดนี้ได้เช่นกัน
- ตัวแปรเป็นชุดกลางชุดเดียว ใช้ร่วมกันทุกเกมและทุก Pack ไม่สร้างสำเนาแยกตามเกมหรือ Pack
- เก็บ config กลางใน `gamelist_formula_variables` scope 0 และเก็บประวัติแยกใน `gamelist_formula_variable_logs`
- ตัด UI และคอลัมน์ `โปรไฟล์ต้นทุน` ออกจากหน้า packs; คงข้อมูลเดิมใน JSON แบบ read-only เพื่อให้สูตร legacy `[ต้นทุน]` ยังอ่านได้ระหว่าง migration

Acceptance criteria:

- บันทึกจาก Game List หรือหน้า Packs ของเกมใดแล้ว ทุกเกมต้องเห็นข้อมูลชุดเดียวกันหลังโหลดใหม่
- ชื่อตัวแปรห้ามซ้ำ/ชนชื่อ field ที่ระบบใช้ และสูตรต้องไม่อ้างชื่อที่ไม่มีหรือวนซ้ำ
- ห้ามลบหรือเปลี่ยนชื่อตัวแปรที่คอลัมน์สูตรยังอ้างอยู่จนกว่าจะแก้สูตรนั้นก่อน
- ตัวแปรสูตรซ้อนกันและอัตรา `USDT/THB`, `USDCNY` คำนวณใน pack ได้
- การบันทึก config และ audit log อยู่ใน transaction เดียวกัน; ไม่สร้าง log เมื่อ definition ไม่เปลี่ยน
- กล่องตัวแปรแต่ละใบแสดงวันที่และผู้แก้ล่าสุด และหน้าเดียวกันเปิดดูประวัติรวมได้
- ลบเกมต้องไม่ลบ config หรือ log ชุดกลาง เพราะเกมอื่นยังใช้ร่วมกัน

## Task 23: ชุดข้อมูล UID / IDPASS

- เพิ่มตัวสลับ UID/IDPASS ในหน้า Game List ทั้งโหมดแก้ไขและ `?view=1`, หน้ารายละเอียดเกม และหน้า Packs
- ชื่อเกม, ID, รูปเกม, ลำดับ, สถานะเกม และตัวแปรผสมสูตร/ราคาเป็นข้อมูลร่วม
- Region, Platform, Server, Bot/Manual, Links, Tutorial, ข้อควรระวัง และข้อมูล Packs แยกตามชุด
- UID ใช้ storage เดิมทั้งหมดเพื่อ backward compatibility; IDPASS เก็บเป็น JSON side table `gameinfo_mode_data`
- หน้าเมนูของเกม clone ข้อมูลทั้งหมดจากอีกชุดได้ และหน้า Packs clone เฉพาะ Packs ได้ โดยถามยืนยันก่อนแทนที่
- การเปลี่ยนตัวแปรผสมต้องตรวจ computed formulas ทั้ง UID และ IDPASS ทุกเกม

Acceptance criteria:

- สลับ mode แล้ว URL เก็บ `mode=idpass` และไม่ทำค่า `view=1` หาย
- แก้ IDPASS ไม่เขียนทับ field หรือ Packs ของ UID และกลับกัน
- Clone UID → IDPASS และ IDPASS → UID ไม่รวมตัวแปรผสมสูตร/ราคา
- Clone จากหน้า Packs ไม่เขียนทับ Region/Links/Tutorial/Warning
- หน้า view แสดง Links/Tutorial/Warning และสถานะ pack ของ mode ที่เลือก
- CSV export จากหน้า Packs ส่งออก mode ที่กำลังเปิด
- ลบเกมลบ IDPASS side data ด้วย แต่ไม่ลบตัวแปรผสมชุดกลาง

## Task 25: ชื่อ Pack หลายภาษา

- เพิ่มตัวเลือกภาษาในหน้าแก้ไข Packs เพื่อสลับชื่อ Pack ที่กำลังแก้
- ผู้ใช้ตั้งชื่อภาษาใหม่เองได้ และระบบบันทึกชื่อภาษาไว้เป็นรายการกลางสำหรับเลือกใช้กับเกมอื่น
- Dropdown ภาษาแสดงภาษาที่เคยสร้างไว้ทั้งหมด เพื่อลดการพิมพ์ชื่อภาษาเดิมซ้ำ
- เมื่อเลือกภาษาที่ยังไม่มีชื่อ Pack ช่องชื่อจะแสดงเป็นค่าว่างให้กรอกคำแปลใหม่
- ชื่อ Pack ของแต่ละภาษาเก็บแยกกัน การแก้ชื่อในภาษาหนึ่งต้องไม่เขียนทับภาษาอื่น
- รองรับการเพิ่มภาษาใหม่ได้เรื่อย ๆ โดยไม่ใช้รายการภาษาแบบตายตัว

สถานะ milestone: ชื่อหลักยังอยู่ใน `name` เพื่อรองรับข้อมูลเก่า, คำแปลเก็บใน `localizedNames` โดยอ้าง ID จากรายการภาษากลาง และหน้า Packs สลับ/เพิ่มภาษาได้โดยไม่ reload; รองรับทั้ง UID และ IDPASS

Acceptance criteria:

- สร้างชื่อภาษาในเกมหนึ่งแล้วสามารถเลือกชื่อภาษาเดียวกันจาก Dropdown ในเกมอื่นได้
- เปลี่ยนภาษาแล้วแสดงชื่อ Pack ที่บันทึกไว้ของภาษานั้นทันที
- ภาษาที่ยังไม่มีคำแปลแสดงช่องว่าง ไม่คัดลอกชื่อจากภาษาอื่นมาโดยอัตโนมัติ
- บันทึกแล้วสลับภาษาไปมา หรือโหลดหน้าใหม่ ชื่อของแต่ละภาษายังคงถูกต้อง
- การเพิ่มหรือลบคำแปลต้องไม่ลบ Pack และไม่กระทบสูตร ราคา สถานะ หรือข้อมูลอื่นของ Pack
- UID และ IDPASS ใช้รายการชื่อภาษากลางร่วมกัน แต่ชื่อ Pack หลายภาษาต้องผูกกับชุด Packs ที่กำลังแก้

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
