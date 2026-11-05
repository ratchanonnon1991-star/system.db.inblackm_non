import { handleApiError } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { getTopupWebPackageIcon } from "@/server/gameinfo-topup-web";
import { parseImageDataUrl } from "@/lib/gameinfo-image-url";

// A website package's icon, read from the website on demand so GameInfo packs
// keep a short link instead of a copy of the image. Same caching and safety
// headers as a game's own image (gamelist/[id]/image/raw).
//
// Website icons are often full-size PNGs of a few MB for what GameInfo shows
// as a thumbnail, so raster images are shrunk to WebP on the way out. sharp
// ships with Next; if it cannot load, the original is sent as it is.
const MAX_SIDE = 512;

async function shrink(bytes, contentType) {
  if (!/^image\/(png|jpe?g|webp)$/.test(contentType)) return { bytes, contentType };
  try {
    const { default: sharp } = await import("sharp");
    const out = await sharp(bytes).resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    return out.length < bytes.length ? { bytes: out, contentType: "image/webp" } : { bytes, contentType };
  } catch {
    return { bytes, contentType };
  }
}

export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    const { packageId } = await params;
    const icon = await getTopupWebPackageIcon(packageId);
    const parsed = parseImageDataUrl(icon);
    if (!parsed) {
      if (/^https?:\/\//i.test(icon)) return Response.redirect(icon, 302);
      return new Response(null, { status: 404 });
    }
    const versioned = new URL(request.url).searchParams.has("v");
    const image = await shrink(Buffer.from(parsed.base64, "base64"), parsed.contentType);
    return new Response(image.bytes, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": versioned ? "private, max-age=31536000, immutable" : "private, no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (err) {
    return handleApiError(err, "โหลดรูปแพ็คไม่สำเร็จ");
  }
}
