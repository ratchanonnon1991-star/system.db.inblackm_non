# GameDB

Service ตาราง Query สำหรับทีมงาน INBLACKM — เลือก query ที่บันทึกไว้เพื่อดึงข้อมูลจากฐานข้อมูล แสดงผลเป็นตารางที่จัดคอลัมน์เองได้ (เรียงลำดับ, ซ่อน, เปลี่ยนชื่อ, เพิ่มคอลัมน์สูตร `+ - * /`)

- Next.js 16 + Tailwind 4 — dev พอร์ต **4183**, production พอร์ต **5589** (PM2 app: `system.db.inblackm`)
- ตารางของ service นี้: `gamedb_users`, `gamedb_queries`, `gamedb_connections`
- **มีระบบ login ของตัวเอง** — ตาราง `gamedb_users` + cookie `gamedb_session` แยกขาดจาก inblackm, รหัสผ่านแฮชด้วย scrypt, กัน brute force 8 ครั้ง/10 นาที
- **ต่อหลายฐานข้อมูลได้** — Admin เพิ่ม connection PostgreSQL อื่นผ่านปุ่ม "ฐานข้อมูล" แล้วเลือกได้ต่อ query (รหัสผ่านถูกเข้ารหัส AES-256-GCM ด้วย `GAMEDB_ENC_KEY` ก่อนเก็บ)

## เริ่มใช้งาน (dev)

```bash
npm install
cp .env.example .env   # แล้วเติมค่าตามด้านล่าง
npm run dev            # http://localhost:4183
```

ค่าใน `.env`:

| ตัวแปร | ค่า |
|---|---|
| `PG_HOST` / `PG_PORT` / `PG_DATABASE` / `PG_USER` / `PG_PASSWORD` | PostgreSQL ที่เก็บตาราง `gamedb_*` |
| `SESSION_SECRET` | คีย์เซ็น session cookie ของ gamedb เอง (string ยาว ๆ อะไรก็ได้) |
| `GAMEDB_ENC_KEY` | คีย์เข้ารหัสรหัสผ่าน connection (ตั้งแล้วห้ามเปลี่ยน ไม่งั้น connection เดิมถอดรหัสไม่ได้) |
| `GAMEDB_ADMIN_USERNAME` / `GAMEDB_ADMIN_PASSWORD` | บัญชี admin คนแรก — ถูกสร้างอัตโนมัติครั้งเดียวตอนตาราง `gamedb_users` ยังว่าง |

## ผู้ใช้และสิทธิ์

- login ที่หน้าแรกด้วย username/รหัสผ่านจากตาราง `gamedb_users` (ไม่เกี่ยวกับบัญชี inblackm)
- role `admin`: จัดการ Query, จัดการฐานข้อมูล, ทดสอบรัน SQL ได้ทั้งหมด
- role `staff`: ดู, รัน query, จัด layout ได้
- เพิ่มคนหรือเปลี่ยนรหัสผ่าน: ตอนนี้ทำผ่าน SQL ตรง ๆ เช่น ล้างแล้ว seed ใหม่ — `DELETE FROM gamedb_users;` แล้วแก้ `GAMEDB_ADMIN_*` ใน `.env` + restart (จะ seed ใหม่ตอนตารางว่าง)
- SQL ทุกคำสั่งถูกบังคับ: `SELECT`/`WITH` statement เดียว + คัดกรองคีย์เวิร์ด + รันใน transaction `READ ONLY` + timeout 8 วินาที + จำกัด 1,000 แถว

## Deploy production

1. วาง `.env` บนเซิร์ฟเวอร์ (รวม `GAMEDB_ADMIN_USERNAME`/`GAMEDB_ADMIN_PASSWORD` สำหรับ seed รอบแรก)
2. `npm run build` แล้ว `npm run pm2:start` (PM2 app ชื่อ `system.db.inblackm`, พอร์ต 5589) — หรือปล่อยให้ GitHub Actions (`.github/workflows/deploy.yml`) ทำให้เมื่อ push `main`
3. เพิ่ม site ใน aaPanel/nginx: subdomain ชั้นเดียว เช่น `systemdb.inblackm.com` → reverse proxy `http://127.0.0.1:5589` (subdomain ซ้อน 2 ชั้นจะติดปัญหา cert ของ Cloudflare)
