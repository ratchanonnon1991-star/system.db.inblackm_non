"use client";

import { hueTokenOf, isCustomTone, isHueToken, rgbTokenOf } from "@/lib/gamedb-layout";

const HUE_TOKEN = /^hue(Solid)?:(-?\d+(?:\.\d+)?)$/;
const RGB_TOKEN = /^rgb:(#[0-9a-fA-F]{6})$/;

// hsl(h 80% 92%) round-tripped through the browser's colour input so the
// swatch has something sane to open on, if a hue is currently picked.
function hueToHex(hue, solid) {
  const h = ((hue % 360) + 360) % 360;
  const s = solid ? 0.72 : 0.8;
  const l = solid ? 0.45 : 0.92;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n) => Math.round(f(n) * 255).toString(16).padStart(2, "0");
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

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
  const hueMatch = HUE_TOKEN.exec(value || "");
  const hue = hueMatch ? Number(hueMatch[2]) : 0;
  const solid = hueMatch ? Boolean(hueMatch[1]) : false;
  const rgbMatch = RGB_TOKEN.exec(value || "");
  const active = isCustomTone(value);

  const swatchColor = rgbMatch
    ? rgbMatch[1]
    : hueMatch
      ? `hsl(${hue} ${solid ? 72 : 80}% ${solid ? 45 : 92}%)`
      : value
        ? undefined // a legacy preset name: let the caller's own preview show through
        : "transparent";

  // The swatch doubles as a native colour-dialog trigger, so black, white,
  // and any exact hex are one click away instead of only what the hue wheel
  // can reach. Opens on whatever colour is already showing (or mid-grey for
  // a first pick), and any pick here overrides the wheel with an rgb token.
  const pickerSeed = rgbMatch
    ? rgbMatch[1]
    : hueMatch
      ? hueToHex(hue, solid)
      : "#808080";

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
      <label
        className="relative h-5 w-5 shrink-0 cursor-pointer rounded-full border border-zinc-300"
        style={{ backgroundColor: swatchColor }}
        title="คลิกเพื่อเลือกสีเป๊ะๆ (รวมดำ/ขาว) จากตัวเลือกสีของเบราว์เซอร์"
      >
        <input
          type="color"
          value={pickerSeed}
          disabled={disabled}
          onChange={(event) => onChange(rgbTokenOf(event.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </label>
      {allowSolid && (
        <label
          className="flex shrink-0 items-center gap-0.5 text-[8px] font-black text-zinc-400"
          title="สลับเป็นสีเข้มแบบทึบ"
        >
          <input
            type="checkbox"
            checked={solid}
            disabled={disabled || !isHueToken(value)}
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
