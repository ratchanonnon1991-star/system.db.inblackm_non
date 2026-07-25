# GameDB

Service ตาราง Query สำหรับทีมงาน INBLACKM — เลือก query ที่บันทึกไว้เพื่อดึงข้อมูลจากฐานข้อมูลกลาง แสดงผลเป็นตารางที่จัดคอลัมน์เองได้ (เรียงลำดับ, ซ่อน, เปลี่ยนชื่อ, เพิ่มคอลัมน์สูตร `+ - * /`) เตรียมไว้สำหรับโดเมน `gamedb.inblackm.com`

- Next.js 16 + Tailwind 4 — dev พอร์ต **4183**, production พอร์ต **5589** (PM2 app: `system.db.inblackm`)
- ใช้ PostgreSQL กลางตัวเดียวกับ storefront `inblackm` เป็น DB หลัก (ตารางของ service นี้: `gamedb_queries`, `gamedb_connections`)
- **ต่อหลายฐานข้อมูลได้** — Super Admin เพิ่ม connection PostgreSQL อื่นผ่านปุ่ม "ฐานข้อมูล" แล้วเลือกได้ต่อ query (รหัสผ่านถูกเข้ารหัส AES-256-GCM ด้วย `GAMEDB_ENC_KEY` ก่อนเก็บ)
- ไม่มีหน้า login ของตัวเอง — ตรวจ cookie `inblackm_session` ที่เซ็นโดย inblackm

## เริ่มใช้งาน (dev)

```bash
npm install
cp .env.example .env   # แล้วเติมค่าตามด้านล่าง
npm run dev            # http://localhost:4183
```

ค่าใน `.env`:

| ตัวแปร | ค่า |
|---|---|
| `PG_HOST` / `PG_PORT` / `PG_DATABASE` / `PG_USER` / `PG_PASSWORD` | ชี้ DB เดียวกับ `inblackm/.env` |
| `SESSION_SECRET` | **ต้องตรงกับ secret ที่ inblackm ใช้เซ็น session** (ปัจจุบัน inblackm ไม่ตั้ง `SESSION_SECRET` จึง fallback ไปใช้ `OTP_SECRET` — ให้ copy ค่า `OTP_SECRET` ของ inblackm มาใส่) |
| `GAMEDB_ENC_KEY` | คีย์เข้ารหัสรหัสผ่าน connection (string อะไรก็ได้ ตั้งแล้วห้ามเปลี่ยน ไม่งั้น connection เดิมถอดรหัสไม่ได้) |
| `NEXT_PUBLIC_INBLACKM_ADMIN_URL` | ลิงก์หน้า admin login ของ inblackm (dev: `http://localhost:4182/admin/login`) |

การ login บน dev: เข้าสู่ระบบ admin ที่ `localhost:4182/admin/login` ก่อน แล้วเปิด `localhost:4183` — cookie ของ `localhost` แชร์ข้ามพอร์ตอัตโนมัติ

## สิทธิ์

- role `admin` (Super Admin): เพิ่ม/แก้/ลบ/ทดสอบรัน SQL ได้
- role `staff`: ดู, รัน query, จัด layout ได้
- SQL ทุกคำสั่งถูกบังคับ: `SELECT`/`WITH` statement เดียว + คัดกรองคีย์เวิร์ด + รันใน transaction `READ ONLY` + timeout 8 วินาที + จำกัด 1,000 แถว

## Deploy production (gamedb.inblackm.com)

1. `npm run build` แล้ว `npm run pm2:start` (PM2 app ชื่อ `system.db.inblackm`, พอร์ต 5589) — หรือปล่อยให้ GitHub Actions (`.github/workflows/deploy.yml`) ทำให้เมื่อ push `main`
2. เพิ่ม site ใน aaPanel/nginx: `gamedb.inblackm.com` → reverse proxy `http://127.0.0.1:5589` + ออก SSL
3. **สำคัญ:** cookie ของ inblackm เป็น host-only (`inblackm.com`) — ถ้าจะให้ session ใช้ข้ามไป `gamedb.inblackm.com` ต้องแก้ฝั่ง inblackm ให้ตั้ง cookie `Domain=.inblackm.com` (ใน `getSessionCookieOptions`) ก่อน ไม่งั้นหน้า gamedb จะขึ้นให้ login ตลอด
