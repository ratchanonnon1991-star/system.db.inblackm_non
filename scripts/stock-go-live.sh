#!/usr/bin/env bash
# Stock's first run on a server, after the deploy that brings purchase orders, wallets and the
# account sheets. Run on the server, from the app folder, as the user the app runs as:
#   bash scripts/stock-go-live.sh "/path/to/folder holding the ข้อมูลบัญชี M-YYYY folders"
# Each step shows a dry run first and writes only after you type y. Safe to run again: every
# import replaces its own rows and keeps what people entered.
set -Eeuo pipefail

FOLDER="${1:-}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

if [ -z "$FOLDER" ] || [ ! -d "$FOLDER" ]; then
  echo "ใช้: bash scripts/stock-go-live.sh \"<โฟลเดอร์ที่มีโฟลเดอร์ ข้อมูลบัญชี M-YYYY>\"" >&2
  exit 2
fi
[ -f .env ] || { echo "ไม่พบ $APP_DIR/.env" >&2; exit 1; }

ask() {
  local answer
  read -r -p "$1 [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ]
}

step() {
  echo
  echo "=================================================================="
  echo "$1"
  echo "=================================================================="
}

step "0. สำรองตาราง Stock และชีตบัญชีก่อน"
BACKUP="$APP_DIR/data/stock-backup-$(date +%Y%m%d-%H%M%S).sql"
if command -v pg_dump >/dev/null 2>&1; then
  # Read only the PG_* keys from .env (surrounding quotes dropped), without running the file as shell.
  envval() { sed -n "s/^$1=//p" .env | tail -1 | sed -E "s/^[\"'](.*)[\"']\$/\1/"; }
  PG_HOST="$(envval PG_HOST)"
  PG_PORT="$(envval PG_PORT)"
  PG_USER="$(envval PG_USER)"
  PG_DATABASE="$(envval PG_DATABASE)"
  mkdir -p "$APP_DIR/data"
  if PGPASSWORD="$(envval PG_PASSWORD)" pg_dump -h "${PG_HOST:-127.0.0.1}" -p "${PG_PORT:-5432}" -U "$PG_USER" -d "$PG_DATABASE" \
      --data-only -t 'stock_*' -t 'account_sheet_*' -f "$BACKUP"; then
    echo "สำรองแล้ว: $BACKUP"
  else
    ask "สำรองไม่สำเร็จ ทำต่อโดยไม่สำรอง?" || exit 1
  fi
else
  ask "ไม่พบ pg_dump ทำต่อโดยไม่สำรอง?" || exit 1
fi

step "1. เช็คของที่มีอยู่ (อ่านอย่างเดียว · สร้างตารางใหม่ที่ยังไม่มี)"
node scripts/stock-go-live-check.mjs | tee /tmp/stock-go-live-check.txt
if grep -q "ลบด้วย --clear-old-2-1" /tmp/stock-go-live-check.txt; then
  echo
  echo "ไอดีชุดนี้นำเข้าจากชีต 2.1 STOCK_ ไว้ก่อน ขั้นต่อไปจะสร้างยอดใหม่จากใบสั่งซื้อและยอดนับในชีตบัญชี"
  echo "ถ้าไม่ลบของเก่า ยอดคงเหลือจะนับซ้ำ (รายการที่คนกดเองไม่ถูกลบ)"
  if ask "ลบรายการคลังเก่าจากชีต 2.1 STOCK_?"; then
    node scripts/stock-go-live-check.mjs --clear-old-2-1
  else
    ask "ไม่ลบ แล้วทำต่อ?" || exit 1
  fi
fi

step "2. นำเข้าชีตบัญชี → ข้อมูลบัญชี, กระเป๋าเงิน, ค่าใช้จ่าย, คลังตามชีต"
node scripts/import-account-sheets.mjs "$FOLDER" | tail -25
ask "ยอดด้านบนถูกต้อง เขียนจริง?" || exit 1
node scripts/import-account-sheets.mjs "$FOLDER" --apply | tail -10

step "3. ไอดี แพ็ค และใบสั่งซื้อจากชีต → คลัง, ใบสั่งซื้อ"
node scripts/import-sheet-inventory.mjs | tail -25
ask "ยอดด้านบนถูกต้อง เขียนจริง?" || exit 1
node scripts/import-sheet-inventory.mjs --apply | tail -5

step "4. ผูกไอดีกับเกมใน GameInfo (เฉพาะที่แน่ใจ)"
node scripts/link-stock-games.mjs | tail -25
if ask "ผูกเฉพาะที่ขึ้นลูกศร → ?"; then
  node scripts/link-stock-games.mjs --apply | tail -5
fi
echo "ไอดีที่ต้องเลือกเอง: แก้ในหน้า Stock › คลัง › ดูไอดีนี้ › แก้ไขไอดี หรือรัน"
echo "  node scripts/link-stock-games.mjs --apply <ไอดี>=<เลขเกม>"

step "5. สรุปหลังนำเข้า"
node scripts/stock-go-live-check.mjs
echo
echo "เสร็จแล้ว · เปิด /stock, /stock/purchase-orders, /stock/wallets เพื่อตรวจ"
