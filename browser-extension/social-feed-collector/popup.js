const account = document.querySelector("#account");
const status = document.querySelector("#status");
function showResults(results = []) {
  status.style.whiteSpace = "pre-line";
  status.textContent = `ตรวจ ${results.length} กลุ่ม · เพิ่มใหม่ ${results.reduce((n, r) => n + (r.ingested || 0), 0)} · มีแล้ว ${results.reduce((n, r) => n + (r.existing || 0), 0)}\n` + results.map((r) => `${r.source}: ${r.note || r.status}`).join("\n");
}
const toggle = document.querySelector("#toggle");
function renderToggle(paused) {
  toggle.textContent = paused ? "▶ เชื่อมต่อ" : "■ ตัดการเชื่อมต่อ";
  toggle.classList.toggle("danger", !paused);
}
function connectedStatus(running) {
  return running ? "กำลังอ่าน (เริ่มจากเว็บแล้ว)" : "เชื่อมต่อแล้ว — สแตนบายรอสั่งเริ่มจากเว็บ";
}
chrome.storage.local.get({ accountLabel: "", ingestSecret: "", lastCheckAt: "", lastResults: [], paused: false, collectorRunning: false }).then((data) => {
  account.textContent = data.accountLabel ? `บัญชีที่เก็บไว้: ${data.accountLabel}` : "ดึง Public โดยไม่ต้อง Login";
  renderToggle(data.paused);
  if (data.ingestSecret.length < 24) status.textContent = "Ingest secret: ยังไม่ได้ตั้งค่า";
  else if (data.paused) status.textContent = "ยังไม่ได้เชื่อมต่อ";
  else if (data.lastCheckAt) showResults(data.lastResults);
  else status.textContent = connectedStatus(data.collectorRunning);
});
toggle.addEventListener("click", async () => {
  toggle.disabled = true;
  try {
    const paused = !(await chrome.storage.local.get({ paused: false })).paused;
    await chrome.runtime.sendMessage({ type: "SET_SOCIAL_FEED_PAUSED", paused });
    renderToggle(paused);
    if (paused) status.textContent = "ตัดการเชื่อมต่อแล้ว";
    else status.textContent = connectedStatus((await chrome.storage.local.get({ collectorRunning: false })).collectorRunning);
  } catch (error) { status.textContent = error.message; }
  finally { toggle.disabled = false; }
});
document.querySelector("#options").addEventListener("click", () => chrome.runtime.openOptionsPage());
