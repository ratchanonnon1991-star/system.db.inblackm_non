// Shared "someone else already changed this" retry flow for profit's
// editable order overrides (GoCash/Oxide sale, cost, platform) -- same UX
// query-panel.js uses for cell edits: the server rejects with 409 when the
// value on screen no longer matches what's actually stored (see
// assertOverrideUnchanged in profit-repository.js); here we ask whether to
// overwrite anyway or reload to see whoever else's edit won.
//
// `save(includeExpected)` must perform the request, sending the baseline the
// row loaded with when `includeExpected` is true and omitting it (forcing
// the write through unconditionally) when false. `reload()` refreshes the
// page's data either way, so a declined overwrite still shows the winner's
// current value instead of the stale one still on screen.
export async function commitOverrideEdit({ save, reload, onError }) {
  const reportError = onError || ((err) => window.alert(err.message));
  try {
    await save(true);
    await reload();
  } catch (err) {
    if (err?.status !== 409) {
      reportError(err);
      return;
    }
    const overwrite = window.confirm(`${err.message}\n\nต้องการบันทึกทับด้วยค่าที่คุณพิมพ์ไว้ไหม?`);
    if (!overwrite) {
      await reload();
      return;
    }
    try {
      await save(false);
      await reload();
    } catch (err2) {
      reportError(err2);
    }
  }
}

// Bulk variant, for "ตั้งต้นทุน/ราคาขายแบบกลุ่ม" -- applies `save(target,
// includeExpected)` across every target with each one's own baseline
// attached first. Any that come back 409 (someone else already changed that
// *specific* pack since the list loaded -- most others in the batch are
// untouched and still succeed normally) are collected into one combined
// "overwrite these N anyway?" prompt instead of failing the whole batch
// over a single stale row, then retried without a baseline if approved.
// Any non-409 error is rethrown immediately so the caller's own try/catch
// (already alerting + keeping its modal open) handles it exactly as before.
export async function commitBulkOverrideEdit({ targets, save, describe }) {
  const results = await Promise.allSettled(targets.map((t) => save(t, true)));
  // Keeps each conflict's own server message (now names who changed it --
  // see assertOverrideUnchanged/assertScalarUnchanged) instead of collapsing
  // the batch down to a bare pack-name list with no indication of who did
  // what, since a "ทั้งเกม" batch can hit packs changed by different people.
  const conflicts = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== "rejected") continue;
    if (r.reason?.status !== 409) throw r.reason;
    conflicts.push({ target: targets[i], message: r.reason.message });
  }
  if (!conflicts.length) return;

  const detail = conflicts.map((c) => `- ${describe(c.target)}: ${c.message}`).join("\n");
  const overwrite = window.confirm(
    `${conflicts.length} แพ็กถูกแก้ไปแล้วโดยคนอื่นหลังจากที่คุณเปิด\n\n${detail}\n\nต้องการบันทึกทับแพ็กเหล่านี้ด้วยไหม?`
  );
  if (!overwrite) return;

  const retry = await Promise.allSettled(conflicts.map((c) => save(c.target, false)));
  const stillFailed = retry.find((r) => r.status === "rejected");
  if (stillFailed) throw stillFailed.reason;
}
