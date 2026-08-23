// Stub for @/lib/db. Records every statement and its bound parameters so a
// test can assert that nothing was interpolated into the SQL text.
export const log = [];
export let nextRows = [];
export let failWith = null;
export let responder = null;
let nextClientId = 1;

/** (text, params) => {rows} to answer a specific statement, or null to fall through. */
export function setResponder(fn) {
  responder = fn;
}

export function reset({ rows = [], fail = null } = {}) {
  log.length = 0;
  nextRows = rows;
  failWith = fail;
  responder = null;
  nextClientId = 1;
}

function client() {
  const clientId = nextClientId++;
  return {
    async query(text, params) {
      log.push({ text, params: params ?? null });
      if (failWith && /^\s*(SELECT|INSERT|UPDATE|DELETE)/i.test(text)) throw new Error(failWith);
      if (responder) {
        const answer = await responder(text, params ?? null, { clientId });
        if (answer) return { rows: answer.rows, rowCount: answer.rows.length };
      }
      if (/^SELECT/i.test(text.trim())) {
        return { rows: nextRows, rowCount: nextRows.length };
      }
      if (/^INSERT/i.test(text.trim())) {
        return { rows: [{ pk: 99 }], rowCount: 1 };
      }
      if (/^UPDATE/i.test(text.trim())) {
        return { rows: nextRows, rowCount: nextRows.length };
      }
      if (/^DELETE/i.test(text.trim())) {
        return { rows: [], rowCount: nextRows.length };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      log.push({ text: "RELEASE", params: null });
    },
  };
}

export function getPoolForConnection() {
  return {
    connect: async () => client(),
    query: async (text, params) => client().query(text, params),
  };
}

// Routed through the same log/responder/nextRows machinery as
// getPoolForConnection's client -- no module currently under test called
// getPool().query() and relied on it always answering empty, so unifying the
// two does not change any existing suite's behaviour.
export function getPool() {
  return client();
}
