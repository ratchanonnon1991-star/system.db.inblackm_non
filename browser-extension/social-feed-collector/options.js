const ids = ["serverUrl", "ingestSecret"];
chrome.storage.local.get({ serverUrl: "https://systemdb.inblackm.com", ingestSecret: "" }).then((data) => ids.forEach((id) => { document.querySelector(`#${id}`).value = data[id]; }));
document.querySelector("#save").addEventListener("click", async () => {
  const values = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`).value.trim()]));
  await chrome.storage.local.set(values); document.querySelector("#status").textContent = "บันทึกแล้ว";
});
