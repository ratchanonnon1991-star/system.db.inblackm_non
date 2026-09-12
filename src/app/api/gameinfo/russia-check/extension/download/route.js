import { requireGameinfoEditor } from "@/server/auth";
import { buildRussiaCheckExtension } from "@/server/gameinfo-russia-check-extension";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireGameinfoEditor(request);
    // Never accept a return URL or origin from a query parameter.
    const zip = await buildRussiaCheckExtension(request.nextUrl.origin);
    return new Response(await zip.arrayBuffer(), { headers: {
      "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="russia-check-connector.zip"',
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    const response = jsonError(error.status ? error.message : "สร้างไฟล์ส่วนขยายไม่สำเร็จ", error.status || 500);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
