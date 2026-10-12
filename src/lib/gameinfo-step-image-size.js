export const MAX_STEP_IMAGE_DATA_BYTES = 4 * 1024 * 1024;

export function stepImageDataBytes(categories) {
  return (Array.isArray(categories) ? categories : []).reduce((total, category) =>
    total + (Array.isArray(category?.steps) ? category.steps : []).reduce((stepTotal, step) =>
      stepTotal + (Array.isArray(step?.imageUrls) ? step.imageUrls : []).reduce((imageTotal, url) =>
        imageTotal + (typeof url === "string" && url.startsWith("data:image/") ? url.length : 0), 0), 0), 0);
}

export function assertStepImageDataSize(categories) {
  if (stepImageDataBytes(categories) <= MAX_STEP_IMAGE_DATA_BYTES) return;
  const error = new Error("รูปภาพรวมกันใหญ่เกิน 4MB กรุณาลดจำนวนหรือขนาดรูป");
  error.status = 413;
  throw error;
}
