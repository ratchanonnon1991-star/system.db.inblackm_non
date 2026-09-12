async function load() {
  const description = await chrome.runtime.sendMessage({ type: "LOGIN_DESCRIBE" });
  document.querySelector("#source").textContent = `ชื่อบัญชี: ${description.label}`;
  document.querySelector("#current").textContent = description.currentFacebookId ? `พบ Login ปัจจุบัน: Facebook ID ${description.currentFacebookId}` : "ยังไม่พบ Facebook Login ใน profile นี้";
  document.querySelector("#use").disabled = !description.currentFacebookId;
}
document.querySelector("#use").addEventListener("click", async () => { document.querySelector("#status").textContent = "กำลังบันทึกบัญชี Bot..."; await chrome.runtime.sendMessage({ type: "LOGIN_USE_CURRENT" }); });
document.querySelector("#fresh").addEventListener("click", async () => { document.querySelector("#status").textContent = "กำลังเปิด Facebook Login..."; await chrome.runtime.sendMessage({ type: "LOGIN_FRESH" }); });
load().catch((error) => { document.querySelector("#status").textContent = error.message; });
