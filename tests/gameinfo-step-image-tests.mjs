import assert from "node:assert/strict";
import { assertStepImageDataSize, MAX_STEP_IMAGE_DATA_BYTES } from "@/lib/gameinfo-step-image-size.js";
import { recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs.js";
import { log, reset } from "@/lib/db.js";

const categoriesWith = (imageUrl) => [{ steps: [{ imageUrls: [imageUrl] }] }];
assert.doesNotThrow(() => assertStepImageDataSize(categoriesWith(`data:image/webp;base64,${"a".repeat(1024)}`)));
assert.throws(
  () => assertStepImageDataSize(categoriesWith(`data:image/webp;base64,${"a".repeat(MAX_STEP_IMAGE_DATA_BYTES)}`)),
  (error) => error.status === 413
);

reset();
const before = { categories: categoriesWith("data:image/webp;base64,AAAA") };
const after = { categories: categoriesWith("data:image/webp;base64,BBBB") };
await recordGameinfoAudit({ gameId: 5, area: "warning", before, after });
const audit = log.find((entry) => /INSERT INTO gamelist_pack_audit_logs/.test(entry.text));
assert.ok(audit, "a changed uploaded image must still produce an audit record");
assert.doesNotMatch(audit.params[8], /data:image\//);
assert.doesNotMatch(audit.params[9], /data:image\//);
assert.notEqual(audit.params[8], audit.params[9], "audit markers must distinguish changed images");

console.log("6 passed");
