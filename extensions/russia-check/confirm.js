/* global chrome */
const approve = document.getElementById("approve");
const status = document.getElementById("status");
async function send(action) {
  const result = await chrome.runtime.sendMessage({ action });
  if (result?.error) throw Error(result.error);
  return result;
}
send("describe").then((result) => {
  document.getElementById("origin").textContent = result.origin;
  document.getElementById("game").textContent = `เชื่อม ${result.gameName || "บัญชีเกม"}`;
  approve.disabled = result.status !== "confirming";
}).catch(() => { status.textContent = "การเชื่อมบัญชีนี้ไม่พร้อม กรุณาปิดหน้าต่างแล้วกดเชื่อมจาก GameInfo ใหม่"; });
approve.addEventListener("click", async () => {
  approve.disabled = true;
  try { await send("approve"); }
  catch (error) { status.textContent = error.message; }
});
document.getElementById("cancel").addEventListener("click", () => { void send("cancel").catch(() => window.close()); });
