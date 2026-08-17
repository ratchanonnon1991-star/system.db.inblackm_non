# Gameinfo packs: UID context

เอกสารนี้เป็น context สำหรับการพัฒนา `/gameinfo/[lang]/[id]/packs` จากไฟล์ตัวอย่าง
`1.1 ข้อมูลเติมเกม UID.xlsx` โดยครอบคลุมเฉพาะเกมที่เติมด้วย UID ในรอบนี้

> ขอบเขตสำคัญ: ระบบ ID+PASS จะมีในอนาคต แต่ยังไม่ออกแบบ field, validation หรือ UI ของส่วนนั้นในงานชุดนี้

## สิ่งที่พบใน XLSX

ไฟล์มี 225 ชีต ไม่ได้เป็นตารางรูปแบบเดียว ชีตแบ่งได้เป็นกลุ่มใหญ่ดังนี้

- ข้อมูลกลาง: `ต้นทุน ค่าเงินทั้งหมด`, `ค่าเงินและต้นทุน`
- รายชื่อ/สถานะเกม: `GAMELIST`, `List Game เปิด-ปิด`, `Game UID AUTO`, `Final List Game เปิด-ปิด`
- คู่มือเติมเกม: `How To Top up`
- ข้อมูลแพ็กรายเกม: ชีตที่เหลือ โดยแต่ละเกมมีประมาณ 14–30 คอลัมน์และหัวตารางอยู่คนละแถวได้

แนวคิดที่พบซ้ำในชีตเกม:

- ราคาขาย
- ชื่อหรือจำนวน pack ที่กด และบางเกมมีจำนวนที่ได้รับแยกต่างหาก
- ยอดที่กดรวม fee
- ช่องทางหลัก/สำรอง, link, ประเทศ, region และหมายเหตุ
- ต้นทุน, กำไร และ `% กำไรเฉลี่ย`
- ต้นทุนจากหลาย provider/currency เช่น Razer CAD, USD, SGD, PHP หรือช่องทางเฉพาะเกม
- ค่าเงิน USDT/THB, USD/CNY และการแปลงค่าเงินอื่น

สูตรที่พบซ้ำและควรรองรับในเว็บ:

```text
ยอดที่กดรวม fee = ยอดที่กด + fee
ต้นทุน (THB) = ยอดที่กดรวม fee * อัตราต้นทุน
กำไร = ราคาขาย - ต้นทุน
กำไร (%) = กำไร / ราคาขาย * 100
ราคาบวก 5% = ราคาขาย * 1.05
ราคา USDT = ราคาขาย / USDT_THB
```

ไฟล์ต้นฉบับมีสูตรเสียอยู่แล้ว เช่น `#REF!` ในชีตต้นทุนและในบางชีตเกม ดังนั้นห้ามถือว่าสูตรทุกเซลล์ใน XLSX เป็น source of truth และห้าม import cached result ของสูตรมาเป็นข้อมูลถาวร

## ข้อมูลที่เว็บควรรับและแสดงจริง

### ข้อมูล pack หลัก

```json
{
  "id": "pk_immutable_id",
  "name": "ชื่อแพ็ก/จำนวนที่กด",
  "image": "",
  "price": "100",
  "amountChargedFee": "75.50",
  "channelsMain": ["RAZER(OTHER)"],
  "channelsSecondary": [],
  "country": "",
  "link": "",
  "notice": ""
}
```

- `id` เป็น internal immutable ID ห้ามใช้ชื่อ pack เป็น ID เพราะชื่อซ้ำและเปลี่ยนได้
- `price` คือราคาขาย
- ใช้ `amountChargedFee` เป็นยอดต้นทางสำหรับคำนวณตาม task 6
- `amountCharged` เดิมจะเลิกแสดงและเลิกรับค่าจาก UI/CSV หลัง migration สำเร็จ
- `link` และ `notice` เพิ่มเมื่อยืนยันว่าใช้แสดงจริงในหน้า pack/view; ไม่ควร import คอลัมน์อื่นเผื่อไว้
- ค่าตัวเลขใน API ควรส่งเป็น decimal string เพื่อไม่ให้เสีย precision แล้วค่อยแปลงตอนคำนวณ

### โครงสร้างกลุ่ม

โครงสร้างหน้าเดิมยังใช้ได้:

```text
Game
└─ Currency/กลุ่มใหญ่
   └─ Category/หัวข้อพับได้
      └─ Pack[]
```

ชื่อ Currency และ Category เป็นการจัดกลุ่ม ไม่ใช่ตัวตนของ pack การ duplicate ต้องสร้าง `pack.id` ใหม่เสมอ แม้ค่าที่แสดงทุกช่องเหมือนต้นฉบับ

### สูตร

สูตรควรแยกเป็นสองระดับ:

1. `columnFormula`: สูตรเริ่มต้นของคอลัมน์ ใช้กับทุกแถวในเกมนั้น
2. `rowFormulaOverrides[packId]`: สูตรเฉพาะ pack; ถ้าไม่มีให้ fallback ไปใช้สูตรระดับคอลัมน์

ตัวอย่าง contract:

```json
{
  "key": "profit_percent",
  "label": "กำไร",
  "formula": "([ราคา] - [ต้นทุน]) / [ราคา] * 100",
  "type": "number",
  "display": { "symbol": "%", "position": "suffix", "decimals": 2 },
  "rowOverrides": {
    "pk_special": "([ราคา] - ([ยอดที่กด + fee] * [USDT/THB])) / [ราคา] * 100"
  }
}
```

ตัวแปร external rate ต้องอยู่ใน namespace ของ formula engine เดียวกับ field ปกติ เช่น `[USDT/THB]` และ `[CNY/THB]` ไม่ใช้ cell address แบบ Excel และไม่เก็บค่าผลลัพธ์ลง pack

### ต้นทุนของเกม

ต้นทุนไม่ควรกระจายเป็นคอลัมน์ hard-code จำนวนมากแบบใน XLSX ให้เก็บเป็น cost profile ต่อเกม เช่น:

```json
{
  "id": "cost_razer_other",
  "label": "RAZER (OTHER)",
  "inputCurrency": "USD",
  "baseValue": "4.68",
  "rateFormula": "[USDT/THB] * [baseValue] / [USDT/CNY]",
  "updatedAt": "ISO-8601",
  "updatedBy": 123
}
```

pack อ้าง profile ด้วย ID หรือ formula อ้าง field ที่ profile สร้างขึ้น ไม่ copy ค่า rate ลงทุกแถว เพราะ rate เปลี่ยนรายชั่วโมง

## ข้อมูลที่ไม่ควร import เข้าระบบ packs

- สี, merged cells, ความกว้างคอลัมน์, รูปแบบกระดาษ และแถวว่างที่ใช้จัดหน้าใน Excel
- cached result ของสูตรและเซลล์ที่เป็น error (`#REF!`, `#N/A`, `#VALUE!`)
- cell address และสูตร `GOOGLEFINANCE` โดยตรง
- ตารางสถานะคู่แข่ง/ราคาตลาดจาก `GAMELIST` จนกว่าจะมีหน้าจอที่ใช้ข้อมูลนี้จริง
- สูตรเช็กชื่อเกมซ้ำ เช่น `COUNTIF` เพราะระบบควร validate ที่ API/DB
- คู่มือจาก `How To Top up` ใน packs; ให้ใช้โมดูล tutorial ที่มีอยู่แล้ว
- คอลัมน์เฉพาะบางเกมที่ยังไม่เคยแสดงหรือใช้คำนวณ ให้เพิ่มผ่าน custom field หลังมี use case เท่านั้น
- ข้อมูล ID+PASS ทั้งหมดในรอบ UID นี้

## สถานะ storage ปัจจุบัน

ระบบปัจจุบันไม่ได้เก็บ “ข้อมูลดิบหนึ่งชุด + JSON อีกหนึ่งชุด” ต่อ pack:

- ตาราง `gamelist_packs` มี key `(game_id, pack_id)`
- รายละเอียดแต่ละ pack อยู่ใน `data JSONB`
- currency/category/order ถูก denormalize อยู่ใน JSON ของแต่ละ pack
- computed columns ถูกเก็บในแถวพิเศษ `pack_id = "__computed__"`
- การ save ปัจจุบันลบทุกแถวของเกมแล้ว insert ใหม่ทั้งชุดใน transaction

### ข้อสรุปเรื่อง JSON

ยังไม่ควรเปลี่ยนเป็น JSON ก้อนเดียวต่อเกม เพราะ:

- การแก้หรือ duplicate pack เดียวจะ rewrite ทั้งเกม
- ทำ optimistic concurrency และ audit diff ราย pack ยาก
- สูตร override รายแถวและ log ย้อนหลังจะผูกกับ pack ยากขึ้น
- query จำนวน pack/ช่องทาง/VPN จะต้องแตก JSON array ทุกครั้ง

แนวทางที่แนะนำคือคง “หนึ่งแถวต่อ pack + JSONB ราย pack” แล้วแยก config ออกจาก sentinel:

- `gamelist_packs`: ข้อมูล pack และกลุ่มที่สังกัด
- `gamelist_pack_configs`: schema version, computed columns, shared editor config, cost profiles
- `gamelist_pack_user_views`: visible columns/order/filter ของแต่ละ user และ surface (`edit`/`view`) หากต้อง sync ข้ามเครื่อง
- `gamelist_pack_audit_logs`: actor, action, game_id, pack_id, before/after, timestamp
- `gameinfo_exchange_rates`: pair, rate, provider, fetched_at, expires_at

ถ้าต้องการให้ “ของหน้าจอใครหน้าจอมัน” หมายถึงเฉพาะ browser ปัจจุบัน ให้เก็บ visible columns/order/filter ใน `localStorage` แทน `gamelist_pack_user_views` โดย key ต้องรวม `userId + gameId + surface + schemaVersion`

## Shared config กับ personal view

ต้องแยกสองสิ่งนี้ออกจากกัน:

- Shared game config: รายการคอลัมน์, สูตรระดับคอลัมน์, icon/format, cost profiles เป็นค่าเดียวของ pack ID นั้นและมีผลทั้งหน้า
- Personal view: ซ่อน/แสดง, ลำดับคอลัมน์, filter preset เป็นของผู้ใช้แต่ละคน และห้ามเปลี่ยน shared config

หน้า view เป็น read-only ต่อข้อมูลเดิม แต่ยังสร้าง personal view/filter preset ใหม่ได้ ลบหรือแก้ข้อมูล pack ไม่ได้

## CSV identity contract

อ้างอิง behavior จาก `C:\Git\gameinfo`:

- `game_id` คือ ID ตัวเลขจากฐานข้อมูล `game_list.id` ไม่ใช่ชื่อเกม ไม่ใช่ลำดับแถว และไม่ใช่ pack ID
- import packs หลายเกมต้องมี `game_id` ที่มีอยู่แล้ว; ไม่พบ ID ให้ข้ามและรายงาน error
- `game_name` ใช้อ่านประกอบเท่านั้น การผูกเกมใช้ `game_id`
- import จากหน้า `/gameinfo/[lang]/[id]/packs` เป็น single-game context จึง ignore `game_id` ในไฟล์และบังคับทุกแถวให้เป็นเกมใน URL
- `pack_id` ไม่ควรให้ผู้ใช้สร้างเองใน template รอบแรก; import แบบเพิ่มให้ server สร้าง ID ใหม่ จึง duplicate ได้โดยไม่ชน primary key
- export สำหรับ round-trip ในอนาคตควรมี `pack_id` แต่ต้องแยกโหมด `update existing` ออกจาก `append as duplicate` อย่างชัดเจน

## API และ concurrency ที่ควรได้หลัง refactor

```text
GET    /api/gameinfo/gamelist/:gameId/packs
POST   /api/gameinfo/gamelist/:gameId/packs/:packId/duplicate
PATCH  /api/gameinfo/gamelist/:gameId/packs/:packId
DELETE /api/gameinfo/gamelist/:gameId/packs/:packId
PUT    /api/gameinfo/gamelist/:gameId/pack-config
GET    /api/gameinfo/rates?pairs=USDTTHB,CNYTHB
GET    /api/gameinfo/gamelist/:gameId/pack-audit
```

ทุก mutation ควรรับ revision หรือ `updatedAt` เพื่อป้องกัน browser เก่าเขียนทับข้อมูลใหม่ และบันทึก audit log ใน transaction เดียวกับการแก้ข้อมูล

## ประเด็นที่ต้องยืนยันก่อนลงมือ task 3/7/11

1. personal view ต้องตาม user ข้ามเครื่อง (DB) หรือจำเฉพาะ browser (localStorage)
2. หน้า view “เพิ่มใหม่ได้” หมายถึงเพิ่ม filter preset หรือเพิ่ม pack; เอกสารนี้ตีความว่าเพิ่ม filter preset เท่านั้น
3. custom cost เป็นค่าต่อเกม, ต่อ category หรือเลือกต่อ pack; ข้อเสนอเริ่มที่ต่อเกมและให้ pack เลือก cost profile
4. `CNY/THB` ต้องเป็น direct rate หรือคำนวณผ่าน USD/USDT; API ควรส่ง source และเวลาให้ตรวจสอบได้
