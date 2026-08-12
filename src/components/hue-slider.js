"use client";

import { hueTokenOf, isHueToken } from "@/lib/gamedb-layout";

const HUE_TOKEN = /^hue(Solid)?:(-?\d+(?:\.\d+)?)$/;

const RAINBOW = `linear-gradient(to right,
  hsl(0 85% 82%), hsl(60 85% 82%), hsl(120 85% 78%), hsl(180 85% 78%),
  hsl(240 85% 82%), hsl(300 85% 82%), hsl(360 85% 82%))`;

/**
 * A continuous hue-wheel picker standing in for a fixed swatch/dropdown list
 * -- drag anywhere along the band for any colour, instead of only the 16
 * named presets. `value` is a hue token ("hue:210" / "hueSolid:210", see
 * gamedb-layout.js) or a legacy preset name/"" -- a preset value still shows
 * up as "ล้าง"-able but the slider itself only drives hue tokens; picking a
 * legacy preset back to a hue happens the moment the slider is touched.
 */
export default function HueSlider({ value, onChange, allowSolid = true, disabled = false }) {
  const match = HUE_TOKEN.exec(value || "");
  const hue = match ? Number(match[2]) : 0;
  const solid = match ? Boolean(match[1]) : false;
  const active = isHueToken(value);

  const swatchColor = active
    ? `hsl(${hue} ${solid ? 72 : 80}% ${solid ? 45 : 92}%)`
    : value
      ? undefined // a legacy preset name: let the caller's own preview show through
      : "transparent";

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="range"
        min={0}
        max={360}
        step={1}
        value={hue}
        disabled={disabled}
        onChange={(event) => onChange(hueTokenOf(Number(event.target.value), solid))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full outline-none disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: RAINBOW, accentColor: active ? `hsl(${hue} 70% 45%)` : undefined }}
        title={active ? `สี hue ${Math.round(hue)}°` : "ลากเพื่อเลือกสี"}
      />
      <span
        className="h-5 w-5 shrink-0 rounded-full border border-zinc-300"
        style={{ backgroundColor: swatchColor }}
      />
      {allowSolid && (
        <label
          className="flex shrink-0 items-center gap-0.5 text-[8px] font-black text-zinc-400"
          title="สลับเป็นสีเข้มแบบทึบ"
        >
          <input
            type="checkbox"
            checked={solid}
            disabled={disabled || !active}
            onChange={(event) => onChange(hueTokenOf(hue, event.target.checked))}
          />
          เข้ม
        </label>
      )}
      <button
        type="button"
        onClick={() => onChange("")}
        disabled={disabled || !value}
        className="shrink-0 rounded-sm border border-zinc-200 px-1 py-0.5 text-[8px] font-bold text-zinc-400 transition hover:bg-zinc-50 disabled:opacity-30"
      >
        ล้าง
      </button>
    </div>
  );
}
