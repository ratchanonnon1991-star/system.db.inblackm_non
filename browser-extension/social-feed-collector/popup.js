const account = document.querySelector("#account");
const status = document.querySelector("#status");
function showResults(results = []) {
  status.style.whiteSpace = "pre-line";
  status.textContent = `ตรวจ ${results.length} กลุ่ม · เพิ่มใหม่ ${results.reduce((n, r) => n + (r.ingested || 0), 0)} · มีแล้ว ${results.reduce((n, r) => n + (r.existing || 0), 0)}\n` + results.map((r) => `${r.source}: ${r.note || r.status}`).join("\n");
}
const toggle = document.querySelector("#toggle");
const facebookLogin = document.querySelector("#facebook-login");
function renderFacebookAccount(data) {
  const facebookId = data.facebookAccountId || "";
  account.textContent = facebookId ? `ใช้ Facebook ID ${facebookId} จากเบราว์เซอร์นี้` : "ใช้งานแบบ Public โดยไม่ผูกบัญชี";
  facebookLogin.textContent = facebookId ? "ยกเลิกใช้บัญชี Facebook" : "ใช้ Facebook ที่ล็อกอินอยู่";
}
function renderToggle(paused) {
  toggle.textContent = paused ? "▶ เชื่อมต่อ" : "■ ตัดการเชื่อมต่อ";
  toggle.classList.toggle("danger", !paused);
}
function connectedStatus(running) {
  return running ? "กำลังอ่าน (เริ่มจากเว็บแล้ว)" : "เชื่อมต่อแล้ว — สแตนบายรอสั่งเริ่มจากเว็บ";
}
chrome.storage.local.get({ ingestSecret: "", facebookAccountId: "", lastCheckAt: "", lastResults: [], paused: false, collectorRunning: false }).then((data) => {
  renderFacebookAccount(data);
  renderToggle(data.paused);
  if (data.ingestSecret.length < 24) status.textContent = "Ingest secret: ยังไม่ได้ตั้งค่า";
  else if (data.paused) status.textContent = "ยังไม่ได้เชื่อมต่อ";
  else if (data.lastCheckAt) showResults(data.lastResults);
  else status.textContent = connectedStatus(data.collectorRunning);
});
facebookLogin.addEventListener("click", async () => {
  facebookLogin.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: "TOGGLE_FACEBOOK_LOGIN" });
    if (!result.ok) throw new Error(result.error || "ตรวจบัญชี Facebook ไม่สำเร็จ");
    renderFacebookAccount({ facebookAccountId: result.facebookAccountId });
    status.textContent = result.facebookAccountId ? "ผูกบัญชีจาก Chrome Profile นี้แล้ว" : result.wasRemoved ? "กลับมาใช้งานแบบ Public แล้ว" : "ยังไม่ได้ Login Facebook ใน Chrome Profile นี้";
  } catch (error) { status.textContent = error.message; }
  finally { facebookLogin.disabled = false; }
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
