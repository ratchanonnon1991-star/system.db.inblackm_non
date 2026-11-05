import assert from "node:assert/strict";
import { gameinfoMissingItems } from "../src/lib/gameinfo-completeness.js";

const complete = {
  row: { rankStars: 2, region: "MMK", platform: "Mobile", server: "GL", botManual: "Manual", image: "/x", tags: ["RPG"], links: [{ id: "a" }], hasTutorial: true },
  packs: [{ price: "17", channelsMain: ["ATOM"], amountChargedFee: "2100", costProfileId: "mmk" }],
  testAccountCount: 1,
  linked: true,
};
assert.deepEqual(gameinfoMissingItems(complete), [], "a filled-in game has nothing missing");

const ids = (input) => gameinfoMissingItems(input).map((item) => item.id);
assert.deepEqual(ids({ ...complete, row: { ...complete.row, platform: " ", rankStars: 0 } }), ["priority", "platform"]);
assert.deepEqual(ids({ ...complete, packs: [] }), ["packs"], "no packs is one item, not four");
assert.deepEqual(
  ids({ ...complete, packs: [...complete.packs, { price: "", channelsMain: [], amountChargedFee: "", costProfileId: "" }] }),
  ["packPrice", "packChannel", "packAmount", "packCost"]
);
assert.equal(gameinfoMissingItems({ ...complete, linked: false })[0].section, "s-web", "each item points at the section that fixes it");
assert.match(gameinfoMissingItems({ ...complete, packs: [{}, {}] })[1].label, /2 แพ็ค/, "pack items say how many packs");

console.log("6 passed");
