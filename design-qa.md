# System DB workbench implementation QA — 2026-11-03

final result: passed

The approved template/table/drawer prototype is integrated into the real GameDB source. No actionable P0/P1/P2 findings remain in the reviewed scope. This is local implementation evidence, not a production deployment or a live account-access verification.

## Visual evidence

Evidence directory: `C:/Users/wrd88/Documents/Codex/2026-10-31/https-tools-inblackm-com-https-tools/outputs/systemdb-implementation-2026-11-03/`

- Source visual truth: `C:/Users/wrd88/Documents/Codex/2026-10-31/https-tools-inblackm-com-https-tools/outputs/system-db-prototype/preview.png`.
- Implementation: `desktop-drawer.png`; table-only state: `desktop-table.png` in the evidence directory.
- Comparison: `comparison-after.png` places source on the left and implementation on the right in one image. `comparison-table-detail.png` compares the toolbar, status filters, table headings and first row at readable scale.
- Viewport: 1515 × 900 CSS px. Both source and implementation are 1515 × 900 pixels, effective density 1. No resizing or density normalization was necessary. The combined full comparison is 3030 × 900 pixels.
- State: light mode, game/channel template, first row details open, same row title. The original prototype has 24 fictitious records and a fixed game schema; the implementation fixture has 36 fictitious records and real query/layout structures. Counts, field content and available templates intentionally differ.
- Additional captures: `mobile-table.png`, `mobile-drawer.png` at 390 × 844; `laptop-user.png`, `dark.png` at 1280 × 720; `packs.png`, `empty.png`, `query-error.png`, `metadata-error.png`. `preview.png` is the normal-size handoff screen.

## Comparison history and resolved findings

1. **[P2, resolved] Extra vertical chrome and unused table width.** The initial real-table integration retained a filler column and stacked a metadata strip below the status tabs. `comparison-before.png` / `desktop-drawer-before.png` show the extra strip; the initial table-only inspection showed unused width. The workbench now collapses the filler column, distributes the available width across data columns, places status filters and metadata on one line, and reduces vertical grid noise. Verified in `comparison-after.png` and `comparison-table-detail.png`: the first row starts at approximately the same vertical position as the source, and the table occupies its main region.
2. **[P2, resolved] Read-only template accounts could not sort locally.** Reusing the builder's layout guard also disabled harmless sorting. `PanelTable` now has a separate optional local-sort callback. Sorting in workbench mode changes only client layout and retains the server's write guards and template-hidden columns. Browser verification sorted GAME to AUTO CHESS and opened the matching row; refresh retained the local sort and column visibility. Legacy builder defaults are unchanged.
3. **[P2, resolved] Dark-mode grid borders were too bright.** The legacy table border token produced stronger grid lines than the surrounding surfaces. Workbench-scoped dark table borders now use the workbench line token. The revised `dark.png` has subdued dividers and readable headings/body text.

## Required fidelity surfaces

- **Fonts and typography:** retains the application's UI font stack, including Thai fallbacks. Hierarchy, heading size, red eyebrow, compact labels, table text and drawer title were inspected in the full and focused comparisons. The first visible data column is emphasized. The prototype prioritizes Noto Sans Thai; the application prioritizes its existing UI font to remain consistent with other menus. This optical difference is intentional.
- **Spacing and layout rhythm:** 60px red header, 242px desktop template rail, flexible table workspace and 398px docked details follow the source structure. At laptop widths the toolbar compacts; below 1100px the drawer overlays. At 390px the content stays within the viewport, pickers replace long navigation labels, and existing mobile cards expose a details action. Temporary viewport overrides were reset.
- **Colors and tokens:** shared red brand header/actions, pale red navigation selection, light canvas, neutral surfaces and subtle dividers match the approved direction. Existing query formatting remains responsible for semantic cell colors. The implementation does not invent a global green/red meaning for arbitrary query values. The selected cell highlight remains the existing table engine's highlight.
- **Image quality and assets:** this is a data interface without photographic assets. Lucide icons use the repository's existing icon library; screenshots are browser-rendered PNGs. No raster artwork was replaced with CSS drawings.
- **Copy and content:** production labels and data come from available templates, queries, layouts and query results. The drawer shows actual visible fields and safe HTTP(S) links. Game-specific pack cards, fixed operational statuses and guide text from the fictional prototype are not fabricated for unrelated queries. Status tabs appear only for a visible status column with a small set of actual values. The LOCAL QA label belongs only to the fixture entry point.

## Interaction and accessibility verification

Browser-tested against actual repository components with synthetic local APIs:

- Template switching, query selection, search, status filtering and clearing filters.
- Save a status-filtered view, clear the table, select the saved view, and recover the same five filtered rows.
- Column hiding/restoring; hidden columns and local sorting survive data refresh without a template/layout PATCH.
- User account cannot offer template-hidden fields in the column chooser or the builder entry point.
- Drawer identity after filtering/sorting; details close when the displayed data/filter/layout changes.
- Safe guide link points to the corresponding row's URL; copy action produces that row's fields.
- CSV download contains visible column headings and rows; template-hidden notes are absent.
- Escape closes details; close restores the originating row control. Drawer tabs and modal focus containment were checked. Mobile background is inert while its dialog is open.
- Column dialog and help dialog trap keyboard focus and close with Escape.
- Query permission error and retry; empty table; metadata load failure and retry; missing requested template with recovery by choosing an available template.
- Light and dark modes; desktop, laptop and mobile layouts. At 390px, body scroll width equals viewport width.
- Application console error-level entries checked: none. Deliberate fixture API failure states were exercised separately.

## Source integration and operational boundaries

- `SystemDbScreen` opens the new workbench by default. Its builder action opens the existing `GamedbWorkspace`, with a return button to the new screen. `/systemdb` and `/view/[id]` retain their existing route/authentication entry points.
- Only the active table mounts/runs. Metadata comes from existing queries/views/my-layouts APIs. No fake production templates or authentication bypass routes were added.
- Read/write authorization stays in existing APIs. Read-only templates and staff/user grants are preserved. Profit authorization and other modules are outside this change.
- Saved filter views add `column_value_filters JSONB NOT NULL DEFAULT '{}'::jsonb` through the repository's idempotent schema setup. Existing saved views default to no column filter. A local PGlite check using the actual repository SQL verified legacy-row preservation, repeated migration and parameterized JSON persistence (`filter-schema-check.json`). Deployment requires the application database role to support that existing schema-setup pattern, or the equivalent additive migration to be applied beforehand. No production migration was run.
- The existing dirty hub color edit in `src/app/page.js` was preserved.

## Validation and remaining integration gaps

- `node tests/run.mjs`: 169 suites, 5,955 assertions, zero failed suites (`tests.log`).
- `npm run build`: production compilation/static generation passed (`build.log`).
- Targeted ESLint covering all changed/new JS source, API, script and test files: passed (`lint.log`; only the existing npm user-config notice).
- `git diff --check`: passed.
- Local real-component preview: `http://127.0.0.1:4191/?role=user`. Run with `node scripts/systemdb-workbench-preview.mjs`. Synthetic APIs run in memory and never connect to the production database. Port 4191 avoids the blocked-port behavior observed with the earlier 4190 preview.
- Actual signed-in production data, live database write flows, deployment and the builder's live integration were not exercised by this fixture. Existing backend tests and the production build passed; these do not prove a deployed release or a particular live user's grants.

## Implementation checklist

- [x] Integrate template navigation, full-area table and side details in real source.
- [x] Preserve route/API authorization and existing builder access.
- [x] Use real query/layout metadata and visible row fields.
- [x] Persist saved column filters with bounded, parameterized data.
- [x] Correct the visual and local-sort findings, then recapture and compare.
- [x] Verify primary interactions, responsive states, console, tests, lint and build.
- [x] Leave a local preview open with clearly labeled synthetic data.
- [ ] Production deployment and live-account acceptance are not part of this local handoff.
