# Social Feed Collector Extension

1. สร้าง Chrome profile สำหรับ Bot และ login Facebook เพียงครั้งเดียวใน profile นั้น
2. เปิด `chrome://extensions` > Developer mode > Load unpacked แล้วเลือกโฟลเดอร์นี้
3. เปิดตั้งค่า Extension ใส่ SystemDB URL และ `SOCIAL_FEED_INGEST_SECRET`
4. หากต้องใช้กลุ่มที่ต้อง Login ให้ Login Facebook ใน Chrome profile นี้ แล้วกด “ใช้ Facebook ที่ล็อกอินอยู่” ใน Extension
5. หากไม่กดหรือยังไม่ได้ Login ระบบจะอ่านหน้า Public โดยไม่แนบ Facebook cookie จากนั้น Bot จะดึงโพสต์จากทุกกลุ่มที่เปิดใช้งานอัตโนมัติทุก 5 นาที

เมื่อผู้ใช้กดผูกบัญชี Extension จะอ่านและเก็บเฉพาะ `c_user` ใน `chrome.storage.local` เพื่อแสดง Facebook User ID แต่ไม่เก็บหรือส่ง cookie ยืนยันตัวตน (`xs`) หรือรหัสผ่านออกจาก Chrome profile และควรใช้เฉพาะบัญชี/กลุ่มที่องค์กรได้รับอนุญาตให้เข้าถึง
