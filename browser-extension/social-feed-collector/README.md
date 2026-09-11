# Social Feed Collector Extension

1. สร้าง Chrome profile แยกหนึ่ง profile ต่อหนึ่งบัญชี Facebook และ login Facebook ใน profile นั้น
2. เปิด `chrome://extensions` > Developer mode > Load unpacked แล้วเลือกโฟลเดอร์นี้
3. เปิดตั้งค่า Extension ใส่ชื่อบัญชีให้ตรงกับช่อง “ใช้บัญชี Login” ใน Feed Social, SystemDB URL และ `SOCIAL_FEED_INGEST_SECRET`
4. ที่หน้า Feed Social เปิดแท็บ “บัญชี Login” แล้วกด “เพิ่ม Login” จาก Chrome profile ที่ต้องการใช้
5. กด “เช็ค Session” เพื่อเช็คทุกกลุ่มที่ผูกกับชื่อบัญชีของ Chrome profile นี้

Extension อ่านเฉพาะ `c_user` เพื่อแสดง Facebook User ID แต่ไม่อ่านหรือส่ง cookie ยืนยันตัวตน (`xs`) หรือรหัสผ่านออกจาก Chrome profile และควรใช้เฉพาะบัญชี/กลุ่มที่องค์กรได้รับอนุญาตให้เข้าถึง
