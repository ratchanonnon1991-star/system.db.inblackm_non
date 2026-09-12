# Social Feed Collector Extension

1. สร้าง Chrome profile สำหรับ Bot และ login Facebook เพียงครั้งเดียวใน profile นั้น
2. เปิด `chrome://extensions` > Developer mode > Load unpacked แล้วเลือกโฟลเดอร์นี้
3. เปิดตั้งค่า Extension ใส่ SystemDB URL และ `SOCIAL_FEED_INGEST_SECRET`
4. ที่หน้า Feed Social เปิดแท็บ “บัญชี Bot” แล้วกด “เพิ่มบัญชี Bot” จาก Chrome profile นี้
5. Login ครั้งเดียว จากนั้น Bot จะดึงโพสต์จากทุกกลุ่มที่เปิดใช้งานอัตโนมัติทุก 5 นาที

Extension อ่านเฉพาะ `c_user` เพื่อแสดง Facebook User ID แต่ไม่อ่านหรือส่ง cookie ยืนยันตัวตน (`xs`) หรือรหัสผ่านออกจาก Chrome profile และควรใช้เฉพาะบัญชี/กลุ่มที่องค์กรได้รับอนุญาตให้เข้าถึง
