const account = document.querySelector("#account");
const status = document.querySelector("#status");
function showResults(results = []) {
  status.style.whiteSpace = "pre-line";
  status.textContent = `ตรวจ ${results.length} กลุ่ม · เพิ่มใหม่ ${results.reduce((n, r) => n + (r.ingested || 0), 0)} · มีแล้ว ${results.reduce((n, r) => n + (r.existing || 0), 0)}\n` + results.map((r) => `${r.source}: ${r.note || r.status}`).join("\n");
}
chrome.storage.local.get({ accountLabel: "", ingestSecret: "", lastCheckAt: "", lastResults: [] }).then((data) => {
  account.textContent = data.accountLabel ? `บัญชีที่เก็บไว้: ${data.accountLabel}` : "ดึง Public โดยไม่ต้อง Login";
  if (data.lastCheckAt) showResults(data.lastResults);
  else status.textContent = data.ingestSecret.length >= 24 ? "Ingest secret: ตั้งค่าแล้ว" : "Ingest secret: ยังไม่ได้ตั้งค่า";
});
document.querySelector("#options").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.querySelector("#check").addEventListener("click", async (event) => {
  event.currentTarget.disabled = true;
  status.textContent = "กำลังรวบรวมโพสต์จากทุกกลุ่ม...";
  try {
    const result = await chrome.runtime.sendMessage({ type: "RUN_SOCIAL_FEED_CHECK" });
    if (result.ok) showResults(result.results);
    else status.textContent = result.error;
  } catch (error) { status.textContent = error.message; }
  finally { event.currentTarget.disabled = false; }
});
