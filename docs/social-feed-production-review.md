# Social Feed production review

Reviewed the collector → queue API → repository → feed path using the scrutinize workflow.

## Fixes

- Added atomic per-source work claims. Concurrent collectors cannot claim the same unexpired lease. Successful reads impose a five-minute cooldown; failed reads release the lease. Crashed collectors become eligible after the lease expires.
- Excluded logged-out source/account pairs from assignment, alongside checkpoint and needs-join states.
- Legacy public-mode collectors receive HTTP 426: upgrade all collectors before restarting collection.
- Refreshed worker presence before each source and stopped collection on checkpoint.
- Bounded API and content-script waits, preventing a stalled request from holding a run indefinitely.
- Preferred structured timestamps over relative labels; missing labels no longer overwrite a timestamp already found during the scan.
- Renamed arbitrary risk scores to workload labels. They are not predictions of Facebook enforcement.
- Included collector source in version control, alongside the downloadable ZIP.

## Remaining validation and limitations

- Automated collector tests mock the browser and API. They do not prove real Facebook DOM extraction or real PostgreSQL contention behavior.
- Verify two real collectors against the deployed database: concurrent claim of one source, successful cooldown, failure handoff, and crash recovery.
- The displayed assignment is the current calculated allocation, not a live view of a worker's in-flight job.
- Date labels without a year still infer a year, and date-only labels use a placeholder time. Relative labels are approximate. These must not be treated as second-accurate publication times.
- Background browser suspension can outlast a lease. Exactly-once reading is not guaranteed; database post deduplication remains necessary.
- `logged_out` source/account pairs remain excluded until their status is reset or updated after access is restored.

## Rollout test

1. Deploy server and install/reload collector 1.4.9 on every participating profile.
2. Start two named collectors against the same server and confirm worker presence and assignments.
3. Verify concurrent claims and that a stopped/crashed collector's work becomes available again.
4. Exercise Login/checkpoint failure, confirming collection stops or the source is reassigned as appropriate.
5. Check a dated, relative-time, and unknown-time post; repeat collection and confirm no duplicate rows.
6. Check search, date bounds in Bangkok time, category filters, pagination, and deletion using disposable test records.

Verdict: fix-then-ship; real two-machine queue and Facebook extraction validation is still required before general production use.
