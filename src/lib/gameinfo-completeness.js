// What an admin still has to fill in for one game, in the order the manage
// page asks for it. Each item names the manage-page section that fixes it.
// Only things the website cannot supply are checked here as "for the admin";
// the web-fillable ones (image, categories, packs) are offered by
// "เติมจากเว็บ" first and listed here only while still empty.
export function gameinfoMissingItems({ row, packs = [], testAccountCount = 0, linked = false, salesChannelCount = null }) {
  const items = [];
  const add = (id, label, section) => items.push({ id, label, section });
  const blank = (value) => !String(value ?? "").trim();

  if (!row.rankStars) add("priority", "ความสำคัญ (ดาว)", "s-info");
  if (blank(row.region)) add("region", "Region", "s-info");
  if (blank(row.platform)) add("platform", "Platform", "s-info");
  if (blank(row.server)) add("server", "Server", "s-info");
  if (blank(row.botManual)) add("botManual", "ระบบการเติม (Bot / Manual)", "s-info");
  if (!row.image) add("image", "รูปเกม", "s-info");
  if (!(row.tags || []).length) add("tags", "หมวดหมู่", "s-info");
  if (row.publishers && !row.publishers.length) add("publishers", "ค่ายเกม", "s-info");
  if (!(row.links || []).length) add("links", "ลิงก์ข้อมูลเติมเกมส์", "s-method");
  if (!row.hasTutorial) add("tutorial", "วิธีเติม", "s-method");
  if (!linked) add("web", "เชื่อมกับเกมบนเว็บ TopUp", "s-web");
  if (!testAccountCount) add("testAccount", "บัญชีทดสอบ", "s-test");
  // null = not checked (pages without the sales-channel card).
  if (salesChannelCount === 0) add("sales", "ช่องทางขาย", "s-sales");
  if (!packs.length) {
    add("packs", "แพ็ค", "s-pack");
  } else {
    const count = (test) => packs.filter(test).length;
    const noChannel = count((pack) => !(pack.channelsMain || []).length);
    const noAmount = count((pack) => blank(pack.amountChargedFee));
    const noCost = count((pack) => blank(pack.costProfileId));
    const noPrice = count((pack) => blank(pack.price));
    if (noPrice) add("packPrice", `ราคาแพ็ค (${noPrice} แพ็ค)`, "s-pack");
    if (noChannel) add("packChannel", `ช่องทางเติม (${noChannel} แพ็ค)`, "s-pack");
    if (noAmount) add("packAmount", `ยอดที่กด + fee (${noAmount} แพ็ค)`, "s-pack");
    if (noCost) add("packCost", `โปรไฟล์ต้นทุน (${noCost} แพ็ค)`, "s-pack");
  }
  return items;
}
