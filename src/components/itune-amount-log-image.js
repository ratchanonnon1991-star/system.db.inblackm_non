"use client";

import { useState } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import ItuneImagePreview from "@/components/itune-image-preview";

export default function ItuneAmountLogImage({
  logId,
  hasImage,
  src = "",
  sizeClassName = "h-9 w-9",
}) {
  const [image, setImage] = useState(src);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadImage() {
    if (image || loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiJson(`/api/projectm/itune/amount-log/${logId}/image`, {
        fallbackError: "โหลดรูปยืนยันไม่สำเร็จ",
      });
      setImage(data.image || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (image) {
    return (
      <ItuneImagePreview src={image}>
        <div className={`${sizeClassName} shrink-0 overflow-hidden rounded border border-ll-hairline-strong`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="h-full w-full object-cover" />
        </div>
      </ItuneImagePreview>
    );
  }

  if (!hasImage) {
    return <span className={`${sizeClassName} shrink-0 rounded border border-dashed border-ll-hairline-strong`} />;
  }

  return (
    <button
      type="button"
      onClick={loadImage}
      disabled={loading}
      className={`${sizeClassName} flex shrink-0 items-center justify-center rounded border ${
        error
          ? "border-ll-primary text-ll-primary"
          : "border-ll-hairline-strong text-ll-ink-tertiary hover:bg-ll-surface-2 hover:text-ll-ink"
      } disabled:opacity-60`}
      title={error || "กดเพื่อดูรูปต้นฉบับ"}
      aria-label={error ? `ลองโหลดรูปอีกครั้ง: ${error}` : "ดูรูปยืนยัน"}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
    </button>
  );
}
