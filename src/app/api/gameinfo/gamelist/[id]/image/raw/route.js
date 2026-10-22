import { handleApiError } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { getGamelistImage } from "@/server/gameinfo-gamelist-image";
import { parseImageDataUrl } from "@/lib/gameinfo-image-url";

// The game's uploaded image as a real image response, so the list page can
// point an <img> here instead of inlining the base64 data: URL. The list
// links with ?v=<hash of the stored value>, which changes on every new
// upload, so a versioned request is cached for good; an unversioned one is
// revalidated every time.
export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    const { id } = await params;
    const { imageUrl } = await getGamelistImage(Number(id));
    const parsed = parseImageDataUrl(imageUrl);
    if (!parsed) {
      if (/^https?:\/\//i.test(imageUrl)) return Response.redirect(imageUrl, 302);
      return new Response(null, { status: 404 });
    }
    const versioned = new URL(request.url).searchParams.has("v");
    return new Response(Buffer.from(parsed.base64, "base64"), {
      headers: {
        "Content-Type": parsed.contentType,
        "Cache-Control": versioned ? "private, max-age=31536000, immutable" : "private, no-cache",
        "X-Content-Type-Options": "nosniff",
        // An SVG opened on its own would otherwise run on this origin.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (err) {
    return handleApiError(err, "โหลดรูปภาพไม่สำเร็จ");
  }
}
