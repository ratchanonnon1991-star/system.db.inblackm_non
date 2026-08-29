// Geometry for the 1:1 crop step in gameinfo-image-picker-modal.js. Kept pure
// (no canvas, no DOM) so the clamping rules are testable — the modal only owns
// the pointer handling and the actual drawImage() call.

// Square the cropped result is rendered at. Big enough for the largest place a
// pack/currency image is shown, small enough that the data: URL stays modest
// in the pack row's JSONB.
export const CROP_OUTPUT_SIZE = 512;

// The scale at which the image just covers the square viewport — zoom 1 shows
// as much of the picture as a 1:1 crop can, and never leaves a blank edge.
export function coverScale(naturalWidth, naturalHeight, viewport) {
  if (!(naturalWidth > 0) || !(naturalHeight > 0) || !(viewport > 0)) return 0;
  return viewport / Math.min(naturalWidth, naturalHeight);
}

// Keeps the drawn image covering the viewport: the offset (image top-left
// relative to the viewport top-left, in viewport px) can never be positive or
// leave the far edge inside the square.
export function clampCropOffset(offset, { naturalWidth, naturalHeight, viewport, zoom }) {
  const scale = coverScale(naturalWidth, naturalHeight, viewport) * zoom;
  if (!(scale > 0)) return { x: 0, y: 0 };
  const minX = Math.min(0, viewport - naturalWidth * scale);
  const minY = Math.min(0, viewport - naturalHeight * scale);
  return {
    x: Math.min(0, Math.max(minX, offset.x)),
    y: Math.min(0, Math.max(minY, offset.y)),
  };
}

// Source square, in natural image pixels, that the viewport is currently
// showing — the drawImage() source rect.
export function computeCropRect({ naturalWidth, naturalHeight, viewport, zoom, offset }) {
  const scale = coverScale(naturalWidth, naturalHeight, viewport) * zoom;
  if (!(scale > 0)) return { sx: 0, sy: 0, size: 0 };
  const clamped = clampCropOffset(offset, { naturalWidth, naturalHeight, viewport, zoom });
  const size = viewport / scale;
  return {
    sx: -clamped.x / scale + 0,
    sy: -clamped.y / scale + 0,
    // A rounding wobble must never ask the canvas for pixels past the edge.
    size: Math.min(size, naturalWidth, naturalHeight),
  };
}

// Centres the image in the viewport, the state a freshly pasted image starts in.
export function centeredCropOffset({ naturalWidth, naturalHeight, viewport, zoom }) {
  const scale = coverScale(naturalWidth, naturalHeight, viewport) * zoom;
  if (!(scale > 0)) return { x: 0, y: 0 };
  return clampCropOffset(
    { x: (viewport - naturalWidth * scale) / 2, y: (viewport - naturalHeight * scale) / 2 },
    { naturalWidth, naturalHeight, viewport, zoom }
  );
}
