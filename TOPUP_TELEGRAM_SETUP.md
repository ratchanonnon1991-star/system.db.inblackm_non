# แจ้งเตือน Topup Inventory ผ่าน Telegram

หน้าใช้งาน: `/projectm/th/topup-inventory/alerts` (มีลิงก์จากหน้า Topup Inventory)
ผู้มีสิทธิ์ Projectm Claim/Admin ดูยอดได้; เฉพาะ Projectm Admin ตั้งยอดเป้าหมายได้

## 1. สร้าง Bot และเชื่อม Channel

1. เปิด [@BotFather](https://t.me/BotFather) ที่เป็นบัญชีทางการ ส่ง `/newbot`
2. ตั้งชื่อบอทและ username ที่ลงท้ายด้วย `bot` แล้วเก็บ Bot Token ที่ได้เป็นความลับ
3. ไปที่ channel ที่สร้างไว้ → Administrators → Add Admin → เลือกบอท → เปิด **Post Messages**
4. Channel สาธารณะใช้ `@channel_username` เป็น Chat ID ได้เลย
5. Channel ส่วนตัวต้องใช้เลข `chat.id` (ปกติเริ่มด้วย `-100`): หลังเพิ่มบอท ให้โพสต์ข้อความใหม่ใน channel แล้วเรียก `getUpdates` ตามด้านล่าง และเลือก `channel_post.chat.id` ของ channel ที่ต้องการ

อ้างอิง: [สร้างบอท](https://core.telegram.org/bots/features#botfather), [sendMessage](https://core.telegram.org/bots/api#sendmessage), [getUpdates](https://core.telegram.org/bots/api#getupdates)

ตัวอย่าง PowerShell สำหรับหา Chat ID โดยไม่ฝัง Token ลงในคำสั่ง/history:

```powershell
$stockBotSecret = Read-Host 'Bot token' -AsSecureString
$stockBotToken = [System.Net.NetworkCredential]::new('', $stockBotSecret).Password
try {
  $stockBotUpdates = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$stockBotToken/getUpdates" -ContentType 'application/json' -Body '{"allowed_updates":["channel_post"]}'
  $stockBotUpdates.result | ForEach-Object { $_.channel_post.chat } | Where-Object { $_ } | Select-Object id,title,username
} catch { Write-Output 'อ่านไม่สำเร็จ ตรวจ Token และการเชื่อมต่อ (ไม่พิมพ์ error ที่อาจมี Token)' }
Remove-Variable stockBotToken,stockBotSecret,stockBotUpdates -ErrorAction SilentlyContinue
```

ถ้าไม่พบรายการ ให้โพสต์ข้อความใหม่แล้วเรียกซ้ำ `getUpdates` ใช้ไม่ได้พร้อม webhook และ updates เก็บไว้ไม่เกิน 24 ชั่วโมง แนะนำสร้างบอทใหม่เฉพาะงานนี้หากบอทเดิมมีระบบใช้งานอยู่ ไม่ต้องตั้ง webhook สำหรับระบบแจ้งเตือนนี้

## 2. ตั้งค่าบนเซิร์ฟเวอร์

เพิ่มค่าตาม `.env.inventory-alerts.example` ลง `.env` ของโปรเจกต์:

```dotenv
TOPUP_INVENTORY_ALERTS_ENABLED=true
TOPUP_TELEGRAM_BOT_TOKEN=<token จาก BotFather>
TOPUP_TELEGRAM_CHAT_ID=@your_channel
```

ถ้า channel เป็นส่วนตัว ใส่เลข `-100...` ที่ได้แทน `@your_channel` ห้ามใส่ invite link หรือชื่อที่แสดงบน channel
เก็บ Token ไว้เฉพาะเซิร์ฟเวอร์ ไม่ใส่ `NEXT_PUBLIC_` ไม่ commit และไม่ส่งในแชต

ใช้ config ฐานข้อมูลเดิมของแอป (`PG_*`, `PROFIT_DATABASE_URL` และ saved connection ของ iTune)
ระบบสร้างตารางใหม่ `gamedb_inventory_alerts` ในฐานข้อมูลหลักอัตโนมัติ บัญชี DB ต้องมีสิทธิ์ CREATE TABLE และอ่าน/เขียนตารางนี้ ไม่มีการแก้ไขยอดสต็อก

หลัง deploy โค้ดและ build/restart แอปตามขั้นตอนเดิม ให้เริ่ม worker แยกบนเซิร์ฟเวอร์:

```sh
npx pm2 start ecosystem.config.cjs --only inventory-alert-worker
npx pm2 save
```

ถ้า worker มีอยู่แล้ว หลังแก้ `.env`:

```sh
npx pm2 restart inventory-alert-worker --update-env
npx pm2 logs inventory-alert-worker --lines 30
```

รีสตาร์ตแอปเว็บด้วยเพื่อให้สถานะ config บนหน้าเว็บตรงกัน Worker ทำงานได้โดยไม่ต้องเปิดหน้าเว็บ และตรวจใหม่ 60 วินาทีหลังจบรอบก่อนหน้า หน้า settings รีเฟรชยอดทุก 30 วินาทีโดยคงช่องทางที่เลือกและยอดเป้าหมายที่กำลังพิมพ์ไว้

## 3. ตั้งยอดและตรวจการทำงาน

1. เปิดหน้า Topup Inventory → ตั้งค่าแจ้งเตือนสต็อกต่ำกว่า 50% ผ่าน Telegram
2. ตั้งยอดเป้าหมายแต่ละบัญชีในสกุลเงิน/หน่วยที่แสดง แล้วกดบันทึก เช่น ตั้ง 1,000 → เตือนเมื่อยอด **น้อยกว่า 500** (500 พอดีไม่เตือน)
3. ช่องว่างแล้วกดบันทึก = ปิดแจ้งเตือนบัญชีนั้น ไม่ตั้งยอดอัตโนมัติจากตัวเลขอ้างอิงในชีท
4. หากยอดต่ำอยู่แล้ว จะส่งในรอบถัดไป เมื่อส่งสำเร็จจะไม่ส่งซ้ำจนยอดกลับมา >=50% แล้วลดต่ำลงอีก การเปลี่ยนเป้าหมายเริ่มรอบใหม่ การบันทึกค่าเดิมไม่เริ่มรอบใหม่
5. กดโหลดยอดและสถานะใหม่ ดู **ตรวจล่าสุด** และ **ส่งล่าสุด** ตรวจว่า worker ทำงานจริง (สถานะ config เพียงอย่างเดียวไม่ได้ยืนยันว่า worker รันอยู่)
6. ทดสอบจริงด้วยบัญชีที่ต้องการ: ตั้งเป้าหมายมากกว่าสองเท่าของยอดคงเหลือ รอรอบตรวจ ตรวจข้อความใน channel แล้วปรับกลับเป็นเป้าหมายที่ต้องการ การทดสอบนี้ส่งข้อความจริง

## ขอบเขตของยอดและการส่ง

- แยกบัญชี/กระเป๋าและสกุลเงิน ไม่รวมยอดข้ามสกุลเงิน อ่านจากแหล่งข้อมูลเดียวกับ Inventory ของแต่ละช่องทาง
- ใช้ยอดล่าสุดที่ระบบบันทึกไว้ ไม่เรียกผู้ให้บริการเติมเกมเพื่อรีเฟรชยอด หากข้อมูลต้นทางเก่า การเตือนก็อ้างอิงข้อมูลเก่านั้น โดยข้อความแสดงเวลาและแหล่งข้อมูล
- Gamepoint ใช้ยอดก่อนทำรายการล่าสุดลบยอดตัดที่ยืนยันได้ เป็นยอดคำนวณ; Plsbuy ใช้ API snapshot หรือยอด lot ตาม Inventory เดิม
- Netease บัญชีที่ระบุแยกกระเป๋าไม่ได้ไม่เดายอด; Razer ใช้ Gold แยก SGD/CAD และไม่รวมบัญชี hidden; WavePay แยกเบอร์; Multigamecard แยก Bot/Manual และ Serial ซ้ำไม่ใช้ยอด; USDCodashop ใช้ providerBalance ของธุรกรรมบอทจาก gamedb_coda_ledger เช่นเดียวกับหน้าหลัก; iTune แยกเมลและสกุลเงิน ไม่รวมเมลไม่พร้อมใช้งาน (แสดงเวลาแก้ไขบัญชีล่าสุด)
- Moniepoint ยังไม่เปิด Inventory จึงยังไม่รองรับ
- อ่านยอดไม่ได้/ไม่พบบัญชี/ยอดไม่ถูกต้อง → ไม่ส่งและไม่รีเซ็ตรอบเตือน ข้อผิดพลาดแสดงในหน้า settings เมื่อ worker ตรวจ; ตรวจตารางสถานะและ logs ได้
- ส่งไม่สำเร็จ → ยังไม่ถือว่าส่งแล้วและลองรอบถัดไป ข้อความหลายบัญชีอาจถูกรวมกัน หากเกินความยาว Telegram จะแบ่งข้อความ
- เก็บสถานะกันซ้ำใน PostgreSQL จึงอยู่ข้ามการ restart และมี advisory lock กัน worker ซ้อนกัน
- `shortcut: Telegram ไม่มี idempotency key สำหรับ sendMessage; หาก Telegram รับข้อความแล้วแต่การตอบกลับขาดหาย หรือ DB commit ล้มเหลว อาจมีข้อความซ้ำในการ retry ต้องใช้การยืนยันจากปลายทางหากต้องการรับประกันมากกว่านี้`

หลังอัปเดตตัวอ่านยอด USDCodashop ให้ตั้งเป้าหมายในรายการ **USDCodashop Bot** และล้างเป้าหมายรายการยอดกรอกมือเดิม ระบบไม่ย้ายเป้าหมายข้ามบัญชีให้อัตโนมัติ ใช้ `providerBalance` ล่าสุดจากบอท ไม่ใช้ยอดตั้งต้นหรือยอดคำนวณแทน ต้องให้ `usdcodashop-sync-worker` ทำงานเพื่อซิงก์รายการใหม่ทุก 1 นาที Donshop/AgenH2H อ่านจาก `codashop_orders` ด้วยตัวอ่านเดียวกับหน้า Inventory และถ้ารายการบอทล่าสุดยืนยันยอดไม่ได้ จะแสดงไม่ทราบยอดแทนการถอยไปยอดเก่า

หากไม่ได้รับข้อความ: ตรวจ Token/Chat ID, สิทธิ์ Post Messages, การเชื่อมต่อออกไป `api.telegram.org`, config เปิด worker, เวลาตรวจล่าสุด และ error ในหน้า settings ก่อน
