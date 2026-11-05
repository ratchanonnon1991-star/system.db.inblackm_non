import { handleApiError } from "@/lib/http";
import { requireStockAccess } from "@/server/auth";
import { getStockGameLogo } from "@/server/stock-games";
import { parseImageDataUrl } from "@/lib/gameinfo-image-url";

// A game's logo (GameInfo icon, else its TopUp website thumbnail) for the Stock pages, whose users need not have GameInfo
// access. Read-only; same caching and SVG sandboxing as GameInfo's own /image/raw.
export async function GET(request, { params }) {
  try {
    await requireStockAccess(request);
    const { id } = await params;
    const gameId = Number(id);
    if (!Number.isInteger(gameId) || gameId <= 0) return new Response(null, { status: 404 });
    const imageUrl = await getStockGameLogo(gameId);
    const parsed = parseImageDataUrl(imageUrl);
    if (!parsed) {
      if (/^https:\/\//i.test(imageUrl)) return Response.redirect(imageUrl, 302);
      return new Response(null, { status: 404 });
    }
    const versioned = new URL(request.url).searchParams.has("v");
    return new Response(Buffer.from(parsed.base64, "base64"), {
      headers: {
        "Content-Type": parsed.contentType,
        "Cache-Control": versioned ? "private, max-age=31536000, immutable" : "private, no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (err) {
    return handleApiError(err, "โหลดโลโก้เกมไม่สำเร็จ");
  }
}
