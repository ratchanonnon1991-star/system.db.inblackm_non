// Shared by itune-image-picker-modal.js (Ctrl+V / file upload) and the
// admin table's right-click-paste handler — there's no upload-to-storage
// backend in this app, so a picked/pasted image is read as a base64 data:
// URL and stored directly as the field's value, same precedent as
// gameinfo-image-picker-modal.js.
export const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;

export function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) {
      reject(new Error("เลือกไฟล์รูปภาพเท่านั้น"));
      return;
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      reject(new Error("ไฟล์ใหญ่เกินไป (สูงสุด 4MB)"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}
