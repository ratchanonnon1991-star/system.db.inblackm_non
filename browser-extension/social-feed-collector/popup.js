const account = document.querySelector("#account");
const status = document.querySelector("#status");
chrome.storage.local.get({ accountLabel: "", ingestSecret: "", lastCheckAt: "" }).then((data) => { account.textContent = data.accountLabel ? `บัญชี: ${data.accountLabel}` : "ยังไม่ได้ตั้งชื่อบัญชี"; const configured = data.ingestSecret.length >= 24 ? "Ingest secret: ตั้งค่าแล้ว" : "Ingest secret: ยังไม่ได้ตั้งค่า"; status.textContent = data.lastCheckAt ? `${configured} · ตรวจล่าสุด ${new Date(data.lastCheckAt).toLocaleString("th-TH")}` : configured; });
document.querySelector("#options").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.querySelector("#check").addEventListener("click", async (event) => {
  event.currentTarget.disabled = true; status.textContent = "กำลังตรวจกลุ่ม...";
  const result = await chrome.runtime.sendMessage({ type: "RUN_SOCIAL_FEED_CHECK" });
  status.textContent = result.ok ? `ตรวจแล้ว ${result.results.length} กลุ่ม` : result.error;
  event.currentTarget.disabled = false;
});
