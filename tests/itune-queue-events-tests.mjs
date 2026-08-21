import assert from "node:assert/strict";
import { publishItuneQueueChanged, subscribeToItuneQueue } from "../src/server/itune-queue-events.js";

const revisions = [];
const unsubscribe = subscribeToItuneQueue((revision) => revisions.push(revision));
publishItuneQueueChanged();
publishItuneQueueChanged();
unsubscribe();
publishItuneQueueChanged();

assert.equal(revisions.length, 2);
assert.equal(revisions[1], revisions[0] + 1);
console.log("2 passed");
