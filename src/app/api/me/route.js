import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";

export async function GET(request) {
  try {
    const user = await requireAdmin(request);
    return NextResponse.json({ user });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    // loginUrl is read at runtime so changing .env only needs a restart,
    // not a rebuild (NEXT_PUBLIC_* would be baked in at build time).
    return NextResponse.json(
      {
        error: status >= 500 ? "ตรวจสอบสิทธิ์ไม่สำเร็จ" : err.message,
        loginUrl:
          process.env.INBLACKM_ADMIN_URL ||
          process.env.NEXT_PUBLIC_INBLACKM_ADMIN_URL ||
          null,
      },
      { status }
    );
  }
}
