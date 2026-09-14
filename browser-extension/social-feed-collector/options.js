const ids = ["collectorLabel", "serverUrl", "ingestSecret"];
chrome.storage.local.get({ collectorLabel: "", serverUrl: "https://tools.inblackm.com", ingestSecret: "" }).then((data) => ids.forEach((id) => { document.querySelector(`#${id}`).value = data[id]; }));
document.querySelector("#save").addEventListener("click", async () => {
  const values = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`).value.trim()]));
  try {
    values.serverUrl = new URL(values.serverUrl).origin;
  } catch {
    document.querySelector("#status").textContent = "SystemDB URL ไม่ถูกต้อง";
    return;
  }
  document.querySelector("#serverUrl").value = values.serverUrl;
  await chrome.storage.local.set(values);
  document.querySelector("#status").textContent = values.ingestSecret.length >= 24 ? "บันทึกแล้ว — Ingest secret พร้อมใช้งาน" : "บันทึกแล้ว — Ingest secret ต้องมีอย่างน้อย 24 ตัวอักษร";
});
