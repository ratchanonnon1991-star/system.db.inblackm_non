import { performance } from "node:perf_hooks";

function stopped(signal) {
  if (signal?.aborted) throw Object.assign(new Error("ยกเลิกการโหลดข้อมูลแล้ว"), { name: "AbortError", status: 499 });
}

async function acquire(pool, { signal, waitMs }) {
  stopped(signal);
  let timer, onAbort;
  const connection = Promise.resolve().then(() => pool.connect());
  try {
    return await Promise.race([connection, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("ระบบอ่านข้อมูลกำลังทำงานเต็ม กรุณาลองใหม่"), { code: "INVENTORY_POOL_TIMEOUT", status: 504 })), waitMs);
      onAbort = () => reject(Object.assign(new Error("ยกเลิกการโหลดข้อมูลแล้ว"), { name: "AbortError", status: 499 }));
      signal?.addEventListener("abort", onAbort, { once: true });
    })]);
  } catch (error) {
    // pg-pool cannot remove an individual waiter. Release a late acquisition
    // immediately so a timed-out/disconnected reader never leaks its client.
    connection.then((client) => client.release(), () => {});
    throw error;
  } finally { clearTimeout(timer); if (onAbort) signal?.removeEventListener("abort", onAbort); }
}

export const acquireInventoryClient = (pool, options = {}) => acquire(pool, { waitMs: 8000, ...options });

// Server-side statement_timeout cancels the actual SQL. A JS Promise timeout
// alone would return an error while the expensive SELECT continued in the pool.
export async function inventoryReadQuery(pool, sql, values, { signal, statementMs = 25000, poolWaitMs = 8000, onTiming = () => {} } = {}) {
  const waiting = performance.now();
  const client = await acquire(pool, { signal, waitMs: poolWaitMs });
  try {
    onTiming("pool", performance.now() - waiting);
    stopped(signal);
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('statement_timeout',$1,true)", [String(statementMs)]);
    stopped(signal);
    const start = performance.now();
    let result;
    try { result = await client.query(sql, values); }
    finally { onTiming("sql", performance.now() - start); }
    stopped(signal);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "57014") throw Object.assign(new Error("ประวัติใช้เวลาประมวลผลเกินกำหนด กรุณาลดช่วงวันที่แล้วลองใหม่"), { code: "INVENTORY_READ_TIMEOUT", status: 504 });
    throw error;
  } finally { client.release(); }
}
