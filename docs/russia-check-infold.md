# Love and Deepspace: เชื่อม Login สำหรับ Russia Check

## เชื่อมผ่าน Browser (แนะนำ)

1. กด **โหลดส่วนขยาย** ใน Russia Check หรือเปิด `/gameinfo/th/russia-check/extension` (เฉพาะผู้ดูแล GameInfo)
2. ดาวน์โหลด ZIP จากเว็บที่จะใช้งาน แตกไฟล์ไปโฟลเดอร์ถาวร แล้วเปิด `chrome://extensions` หรือ `edge://extensions` → Developer mode → Load unpacked → เลือกโฟลเดอร์ที่มี `manifest.json`
3. รีโหลด GameInfo → เลือก Love and Deepspace → จัดการ Login → **เชื่อมผ่าน Browser**
4. ตรวจโดเมนปลายทางในหน้าขอยืนยันของส่วนขยาย แล้วอนุญาต จากนั้น Login และเลือกตัวละครในเว็บ Infold จริง
5. เปิด GameInfo ค้างไว้จนตรวจสอบผ่านและ popup ปิดเอง แล้วกดรีข้อมูล

ส่วนขยาย Manifest V3 ต้องใช้ Chrome/Edge 120+ แบบปกติ ไม่ใช่ Incognito ติดตั้งเฉพาะคนเชื่อมบัญชี คนดูแพ็กไม่ต้องติดตั้งหรือ Login Infold ไม่มีการเผยแพร่ขึ้น Web Store หรืออัปเดตอัตโนมัติในรุ่นนี้

ZIP ผูกกับ origin ที่ดาวน์โหลด (รวม port) ไม่มี URL ปลายทางที่ผู้เรียกกำหนดเอง ปิดส่วนขยาย Connector สำเนาอื่นให้เหลือชุดเดียวต่อเว็บ หน้าและ API ดาวน์โหลดต้องมี `gameinfo.admin` พร้อมสิทธิ์เข้าถึง GameInfo

ส่วนขยายขอ `webRequest`, `storage`, `alarms` กับ host ของเว็บเรา/`loveanddeepspace.infoldgames.com`/`passport.infoldgames.com` เท่านั้น ไม่ขอ `cookies`, `debugger`, `<all_urls>` หรือสิทธิ์แก้ไขคำขอ รับเพียง `POST /v2/payment/user/products` ใน popup ที่ผู้ใช้อนุญาตและผูกกับแท็บ/เอกสาร GameInfo เดิม ข้อมูลเข้าจาก isolated content script ส่งตรง API ที่ต้อง Login อยู่ ไม่ส่ง Form Data/token ผ่าน `window.postMessage`, DOM หรือ log และไม่เก็บใน extension storage

worker เก็บเฉพาะ metadata ใน `storage.session` เพื่อทนการพัก worker หยุดรับเมื่อสำเร็จ ยกเลิก ปิด popup หรือครบ 10 นาที (หากเริ่มตรวจสอบแล้วรอผลไม่เกิน 75 วินาที) การปิด GameInfo ระหว่างส่งไม่สามารถย้อนการบันทึกที่เซิร์ฟเวอร์เริ่มไปแล้ว ให้ตรวจสถานะ Login ก่อนลองใหม่

อัปเดต: ดาวน์โหลดแล้วแตกทับโฟลเดอร์เดิม กด Reload ที่หน้าส่วนขยาย และรีโหลด GameInfo ถอนการติดตั้ง: Remove ที่หน้าส่วนขยาย หากต้องการลบ Session ในฐานข้อมูลด้วย ให้กด “ลบ Session” ในจัดการ Login

## นำเข้า Form Data (ทางเลือกสำรอง)

1. ผู้ดูแล GameInfo เปิด Russia Check แล้วเลือก Love and Deepspace → จัดการ Login
2. เปิดเว็บ Top-up Center ของ Infold ล็อกอินและเลือกตัวละครจนเห็นรายการแพ็ก
3. ใน DevTools → Network เลือก `POST /v2/payment/user/products` → Payload → View source
4. เลือก “ใช้ Form Data แบบเดิม” แล้วคัดลอก Form Data ทั้งชุดลงช่องในเว็บเรา: `app_id`, `timestamp`, `sign_type`, `clientid`, `lang`, `data`, `sign` ต้องครบ ไม่ใช่ Response หรือ Cookie
5. กด **ทดสอบและบันทึก Login** ระบบต้องโหลดรายการแพ็กผ่านก่อนขึ้นว่าเชื่อมบัญชีแล้ว จากนั้นกดรีข้อมูลเพื่อบันทึกแพ็กและ Log

Form Data มีข้อมูล Login ห้ามส่งในแชต/issue/ภาพหน้าจอ หรือ commit ลง Git ระบบเก็บ Session แบบ AES-256-GCM ฝั่งเซิร์ฟเวอร์ ตั้ง `RUSSIA_CHECK_SESSION_KEY` (หรือ `GAMEDB_ENC_KEY`/`SESSION_SECRET`) ใน environment และเก็บคีย์เดิมไว้เมื่อ deploy

## ขอบเขตข้อมูล

- Infold ใช้บัญชี/ตัวละคร/พื้นที่จากคำขอที่นำเข้า ไม่ได้บังคับเป็นรัสเซีย ข้อมูลที่ติดตามเป็นรายการที่บัญชีนี้เห็น ไม่ใช่หลักฐานว่าเห็นครบทุกบัญชีหรือทุกประเทศ
- ระบบไม่เก็บรหัสผ่านและไม่ Login ให้อัตโนมัติ เมื่อ token หมดอายุจะให้เชื่อมใหม่ Cookie ที่บันทึกในรุ่นก่อนยังไม่ถือว่าผ่านการตรวจสอบ
- เมื่อมีข้อมูลแพ็กแล้ว ระบบไม่อนุญาตเปลี่ยนบัญชี/ตัวละคร/พื้นที่ เพื่อป้องกัน Log เข้าออกที่เกิดจากการเปลี่ยนขอบเขตข้อมูล เปลี่ยน token ของชุดเดิมได้
- ทุกครั้งที่ดึงจะสร้าง timestamp/sign ใหม่ ใช้ endpoint สินค้าคงที่ ไม่มีการซื้อสินค้า
- ดึงอัตโนมัติผ่าน scheduler Russia Check เดิมเวลา 09:00 ไทย หรือกดรีเองได้หลังตรวจสอบ Login ผ่าน
- response ว่าง/ซ้ำ/แบ่งหน้าไม่ครบ/รูปแบบไม่รองรับจะทำให้รอบนั้น failed โดยไม่แก้แพ็กหรือสร้าง event
- แพ็กที่ยังแสดงอยู่แต่ติดโควตาซื้อของบัญชีจะยังนับว่ามีอยู่ หากผู้ให้บริการซ่อนรายการจากบัญชีโดยสิ้นเชิง ระบบแยกไม่ได้จากการถอดแพ็กออก

## ตรวจสอบ

`npm test` ใช้ fixture สังเคราะห์และฐานข้อมูลจำลอง ไม่เรียก Infold จริง ชุด `gameinfo-infold-tests` ตรวจ protocol/parser/retry/การบันทึกแบบ transaction; `gameinfo-infold-run-tests` ตรวจรอบที่ failed และการย้อนกลับเมื่อเขียนไม่สำเร็จ

ชุด `gameinfo-extension-tests` ตรวจ ZIP/manifest, origin/document/tab isolation, consent, single-flight, worker resume, cancellation/timeout และไม่เก็บ secrets; `gameinfo-extension-bridge-tests` รัน content script ใน VM เพื่อตรวจการส่งข้อมูลเข้า API และไม่เปิดเผย Form Data ให้หน้าเว็บ; `gameinfo-infold-api-tests` ตรวจสิทธิ์หน้า API ดาวน์โหลดด้วย

Manual extension smoke: ติดตั้ง ZIP ใน Chrome และ Edge → ตรวจพบเวอร์ชัน → เชื่อมบัญชีจริง → ยืนยันว่าเกิด event เฉพาะหลังกดรี → เริ่มใหม่แล้วกดยกเลิก/ปิด popup → การเชื่อมต้องหยุด → เปิด Infold ในแท็บอื่นโดยไม่ได้กดเชื่อมต้องไม่บันทึก Session การทดสอบ fixture ไม่แทนการตรวจ Login จริงหรือการติดตั้งบนเบราว์เซอร์จริง

Manual smoke: ทำขั้นตอนเชื่อมบัญชีด้านบน → กดรี → ตรวจชื่อแพ็กกับเว็บ Infold → รีอีกครั้งต้องไม่มี event เพิ่มซ้ำ → ตรวจว่ารอบถัดไปเป็น 09:00 ไทย ไม่ต้องส่ง Form Data หรือ token ออกมาจากช่องจัดการ Login เพื่อรายงานผล
