import assert from "node:assert/strict";
import { bridgeSignature, verifyBridgeRequest } from "../src/server/itune-order-bridge-auth.js";
import { runOrderBridge, entryOrderHistory } from "@/server/itune-order-usage";
import { log, reset, setResponder } from "@/lib/db";

let passed = 0;
function check(fn) { fn(); passed++; }
const secret = "test-secret-not-for-production-123456789";
const now = 1791800000000;
const raw = JSON.stringify({ action: "list" });
const headers = new Headers({ "x-itune-timestamp": String(now), "x-itune-signature": bridgeSignature(secret, String(now), raw) });
check(() => assert.doesNotThrow(() => verifyBridgeRequest(headers,raw,secret,now)));
check(() => assert.throws(() => verifyBridgeRequest(headers,raw+" ",secret,now), { status:401 }));
check(() => assert.throws(() => verifyBridgeRequest(headers,raw,secret,now+60001), { status:401 }));
check(() => assert.throws(() => verifyBridgeRequest(headers,raw,"short",now), { status:503 }));
check(() => assert.throws(() => verifyBridgeRequest(new Headers({"x-itune-timestamp":String(now),"x-itune-signature":"bad"}),raw,secret,now), { status:401 }));

const id = "12345678-1234-4123-8123-123456789abc";
let existing = null;
let entry = { id:12,email:"reserved@example.com",currency:"USD",amount:"100",claimed_by_user_id:7,active_claim_session_id:"555" };
let mapped = true;
let pendingReject = false;
function setup() {
  reset();
  setResponder((sql,params) => {
    if (sql.includes("SELECT gamedb_user_id FROM gamedb_itune_order_accounts")) return { rows: mapped ? [{ gamedb_user_id:7 }] : [] };
    if (sql.includes("FROM gamedb_users u") && sql.includes("WHERE u.id")) return { rows: [{ id:7,username:"worker",role:"user",permissions:["projectm.claim"] }] };
    if (sql.includes("SELECT * FROM projectm_itune_order_usage WHERE id=")) return { rows:existing ? [existing] : [] };
    if (sql.includes("SELECT * FROM projectm_itune_entries WHERE id=")) return { rows:entry ? [entry] : [] };
    if (sql.includes("AS pending")) return { rows:[{pending:pendingReject}] };
    if (sql.includes("SELECT e.*") && sql.includes("WHERE claimed_by_user_id")) return {rows:entry ? [{...entry,password:"never-expose-password",qna:"never-expose-qna",amount_confirm_image:"private-proof"}] : []};
    if (sql.includes("INSERT INTO projectm_itune_order_usage")) {
      existing = {id:params[0],order_id:params[1],line_id:params[2],entry_id:params[3],claim_session_id:params[4],user_id:params[5],external_user_id:params[6],email:params[7],currency:params[8],status:"planned",used_amount:null};
      return { rows:[] };
    }
    if (sql.includes("UPDATE projectm_itune_order_usage SET status=")) { existing.status=params[1]; existing.used_amount=params[2]; return { rows:[] }; }
    return null;
  });
}
const request = (action,payload) => ({action,actorId:"staff-123",order:{id:"order-1",lineId:"9",gameName:"Test",packageLabel:"Pack"},payload});
setup();
await runOrderBridge(request("plan",{id,entryId:12,claimSessionId:"555"}));
check(() => assert.equal(existing.status,"planned"));
check(() => assert.ok(log.some((q) => q.text.includes("pg_advisory_xact_lock"))));
check(() => assert.ok(log.some((q) => q.text.includes("projectm_itune_entries WHERE id=$1 FOR UPDATE"))));
await runOrderBridge(request("plan",{id,entryId:12,claimSessionId:"555"}));
check(() => assert.equal(log.filter((q) => q.text.includes("INSERT INTO projectm_itune_order_usage")).length,1));
await assert.rejects(runOrderBridge(request("plan",{id,entryId:13,claimSessionId:"555"})), {status:409}); passed++;
entry.claimed_by_user_id=8;
await assert.rejects(runOrderBridge(request("confirm",{id,usedAmount:"10.25"})), {status:409}); passed++;
entry.claimed_by_user_id=7; entry.active_claim_session_id="556";
await assert.rejects(runOrderBridge(request("confirm",{id,usedAmount:"10.25"})), {status:409}); passed++;
entry.active_claim_session_id="555"; entry.currency="TRY";
await assert.rejects(runOrderBridge(request("confirm",{id,usedAmount:"10.25"})), {status:409}); passed++;
entry.currency="USD";
pendingReject=true;
await assert.rejects(runOrderBridge(request("confirm",{id,usedAmount:"10.25"})), {status:409}); passed++;
pendingReject=false;
await assert.rejects(runOrderBridge(request("confirm",{id,usedAmount:"1.234"})), {status:400}); passed++;
// Balance may already have been updated after spending: confirmation is a log, not a debit.
entry.amount="0";
await runOrderBridge(request("confirm",{id,usedAmount:"10.25"}));
check(() => assert.equal(existing.status,"completed"));
await runOrderBridge(request("confirm",{id,usedAmount:"10.25"}));
check(() => assert.equal(log.filter((q) => q.text.includes("UPDATE projectm_itune_order_usage SET status=")).length,1));
await assert.rejects(runOrderBridge(request("confirm",{id,usedAmount:"11"})), {status:409}); passed++;
check(() => assert.ok(!log.some((q) => /UPDATE projectm_itune_entries/.test(q.text))));
existing.status="planned"; existing.user_id=99; entry=null;
await runOrderBridge(request("cancel",{id}));
check(() => assert.equal(existing.status,"cancelled"));
check(() => assert.equal(log.findLast((q) => q.text.includes("UPDATE projectm_itune_order_usage SET status=")).params[4],7));
entry={id:12,email:"reserved@example.com",currency:"USD",amount:100,claimed_by_user_id:7,active_claim_session_id:555};
const options=await runOrderBridge(request("list",{}));
check(()=>assert.equal(options.entries.length,1));
check(()=>assert.equal(options.entries[0].recommended,true));
check(()=>assert.ok(!JSON.stringify(options).includes("never-expose")));
check(()=>assert.ok(!("password" in options.entries[0]) && !("qna" in options.entries[0]) && !("amountConfirmImage" in options.entries[0])));
mapped=false;
await assert.rejects(runOrderBridge(request("list",{})), {status:403}); passed++;
setup();
await entryOrderHistory(12,{id:7,permissions:["projectm.claim"]});
check(() => assert.deepEqual(log.find((q) => q.text.includes("AND ($2::boolean OR user_id=$3)")).params,[12,false,7]));
console.log(`${passed} passed`);
