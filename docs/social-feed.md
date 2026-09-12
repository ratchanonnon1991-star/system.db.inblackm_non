# Feed Social

หน้า `/feed-social` อ่านและเขียนข้อมูลในฐาน `topup_inblackm` (`SOCIAL_FEED_DATABASE`) และรีเฟรชรายการทุก 10 วินาที

## ส่งข้อมูลจาก collector

ตั้ง `SOCIAL_FEED_INGEST_SECRET` อย่างน้อย 24 ตัวอักษร แล้วส่งข้อมูลจาก collector ที่มีสิทธิ์เข้าถึงกลุ่ม:

```http
POST /api/social-feed/ingest
Authorization: Bearer <SOCIAL_FEED_INGEST_SECRET>
Content-Type: application/json

{
  "posts": [{
    "groupId": "414272087779283",
    "externalPostId": "414272087779283_123456",
    "message": "ข้อความในโพสต์",
    "originalUrl": "https://www.facebook.com/groups/414272087779283/posts/123456/",
    "postedAt": "2026-09-11T10:00:00Z"
  }]
}
```

ใช้ `sourceId` แทน `groupId` ได้ ระบบ upsert ด้วยคู่ `source + externalPostId` จึงส่งโพสต์เดิมซ้ำได้โดยไม่เกิดแถวซ้ำ

Facebook Groups API ถูกยุติแล้ว จึงต้องใช้ collector/แหล่งข้อมูลที่องค์กรได้รับอนุญาตให้เข้าถึง ห้ามใส่ session cookie ของ Facebook ไว้ในแอปนี้

Chrome Extension อยู่ที่ `browser-extension/social-feed-collector` ใช้ Chrome profile แยกหนึ่ง profile ต่อหนึ่ง Facebook account หน้า “บัญชี Login” จะแสดงสถานะพร้อม, session หลุด และออฟไลน์ พร้อมกระจายกลุ่มให้บัญชีที่พร้อมอัตโนมัติ
