// gamedb-views-repository.js: the per-template write-permission helpers
// (roleCanWriteView, viewContainsQuery) that requireDataAccess in auth.js
// leans on, plus that a template saved before these fields existed still
// resolves to the same "Staff decides, User never" behaviour it always had.
import {
  findViewById,
  roleCanWriteView,
  viewContainsQuery,
} from "@/server/gamedb-views-repository.js";
import { reset, setResponder } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, cond) => (cond ? pass++ : fail.push(name));

// --- roleCanWriteView ---------------------------------------------------------
ok("no view at all grants nothing", roleCanWriteView(null, "staff") === false);
ok("staff follows the template's allowStaffEdit", roleCanWriteView({ allowStaffEdit: true, allowUserEdit: false }, "staff") === true);
ok("staff is blocked when the template turns it off", roleCanWriteView({ allowStaffEdit: false, allowUserEdit: false }, "staff") === false);
ok("user follows the template's allowUserEdit", roleCanWriteView({ allowStaffEdit: true, allowUserEdit: true }, "user") === true);
ok("user is blocked by default", roleCanWriteView({ allowStaffEdit: true, allowUserEdit: false }, "user") === false);
ok("admin is not this function's concern -- always false here", roleCanWriteView({ allowStaffEdit: true, allowUserEdit: true }, "admin") === false);

// --- viewContainsQuery ---------------------------------------------------------
const view = { config: { panels: [{ queryId: 5 }, { queryId: 9 }] } };
ok("a query the template actually displays passes", viewContainsQuery(view, 5) === true);
ok("a query the template does not display fails -- this is the whole point", viewContainsQuery(view, 42) === false);
ok("a non-numeric queryId fails closed", viewContainsQuery(view, "not-a-number") === false);
ok("no view at all fails closed", viewContainsQuery(null, 5) === false);
ok("a view with no panels fails closed", viewContainsQuery({ config: {} }, 5) === false);

// --- mapRow defaults for a template saved before these columns existed ---------
// A row from before this migration has allow_staff_edit/allow_user_edit as
// SQL NULL until the ALTER's DEFAULT backfills it -- mapRow has to treat
// that the same as "true"/"false" respectively, not as falsy-for-both,
// or every existing template would silently lose Staff's write access.
reset();
setResponder(() => ({
  rows: [
    {
      id: 1,
      name: "เก่า",
      description: "",
      config: { panels: [] },
      is_public: true,
      is_default: false,
      is_read_only: false,
      owner_only: false,
      allow_staff_edit: null,
      allow_user_edit: null,
      shared_with: [],
      created_by: "admin",
      created_at: "now",
      updated_at: "now",
    },
  ],
}));
const legacy = await findViewById(1);
ok("a pre-migration row still lets Staff write (defaults true)", legacy.allowStaffEdit === true);
ok("a pre-migration row still blocks User (defaults false)", legacy.allowUserEdit === false);

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
