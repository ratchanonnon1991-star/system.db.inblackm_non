const account = document.querySelector("#account");
const status = document.querySelector("#status");
function showResults(results = []) {
  status.style.whiteSpace = "pre-line";
  status.textContent = `ตรวจ ${results.length} กลุ่ม · เพิ่มใหม่ ${results.reduce((n, r) => n + (r.ingested || 0), 0)} · มีแล้ว ${results.reduce((n, r) => n + (r.existing || 0), 0)}\n` + results.map((r) => `${r.source}: ${r.note || r.status}`).join("\n");
}
const toggle = document.querySelector("#toggle");
function renderToggle(paused) {
  toggle.textContent = paused ? "▶ เริ่มอ่าน" : "■ หยุดอ่าน";
  toggle.classList.toggle("danger", !paused);
}
chrome.storage.local.get({ accountLabel: "", ingestSecret: "", lastCheckAt: "", lastResults: [], paused: false }).then((data) => {
  account.textContent = data.accountLabel ? `บัญชีที่เก็บไว้: ${data.accountLabel}` : "ดึง Public โดยไม่ต้อง Login";
  renderToggle(data.paused);
  if (data.lastCheckAt) showResults(data.lastResults);
  else status.textContent = data.ingestSecret.length >= 24 ? "Ingest secret: ตั้งค่าแล้ว" : "Ingest secret: ยังไม่ได้ตั้งค่า";
});
toggle.addEventListener("click", async () => {
  toggle.disabled = true;
  try {
    const paused = !(await chrome.storage.local.get({ paused: false })).paused;
    await chrome.runtime.sendMessage({ type: "SET_SOCIAL_FEED_PAUSED", paused });
    renderToggle(paused);
    status.textContent = paused ? "กำลังหยุดหลังอ่านกลุ่มปัจจุบันเสร็จ" : "กำลังรวบรวมโพสต์จากทุกกลุ่ม...";
    if (!paused) {
      chrome.runtime.sendMessage({ type: "RUN_SOCIAL_FEED_CHECK" }).then(async (result) => {
        if ((await chrome.storage.local.get({ paused: false })).paused) return;
        if (result.ok) showResults(result.results);
        else status.textContent = result.error;
      }).catch((error) => { status.textContent = error.message; });
    }
  } catch (error) { status.textContent = error.message; }
  finally { toggle.disabled = false; }
});
document.querySelector("#options").addEventListener("click", () => chrome.runtime.openOptionsPage());
