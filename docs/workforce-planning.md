# Workforce planning

Entry: `/workforce`, also linked from the tools home page. Access requires an
authenticated administrator or the `workforce.access` permission. The endpoint
`/api/workforce` applies the same authorization independently.

## Counts and staffing

- Headline is orders per hour (average over elapsed hours and peak hour), with
  work units per hour alongside. Staffing uses work units, not distinct orders
  or payment attempts.
- A workday runs 09:00–09:00 in Asia/Bangkok. Hours marked `+1` belong to the
  following calendar date.
- Staffing is not split by Full time / Intern / Part time. One productivity rate
  (work units per person per hour), productive-time percentage and human-handled
  share give hourly people needed = ceil(forecast × share ÷ (rate × productive%)).
  The rate starts at zero (unknown), so no headcount is shown until it is entered.
- Settings persist in this browser only, not as shared team settings.

## Read-only sources and identity

`WORKFORCE_WEB_DATABASE_URL` supplies paid web queue lines from the storefront
database containing `orders` and `queue_bot_orders`. Use a SELECT-only account.
Do not replace the tools login connection (`PG_*`); it may be a different database.
After setting this server-side variable, restart/redeploy the tools process.
When unset, the dashboard still loads available bot/marketplace data and clearly
warns that web Human work not yet dispatched to bots is missing.
`PROFIT_DATABASE_URL` supplies marketplace, reseller, Telegram and bot history:
Kaleoz, Itemku, G2G, Playerok, Russia, InblackM reseller, PAGE and other Telegram
sources. Missing or unavailable sources are disclosed, not silently represented
as a complete zero-demand result. Bot-side web copies are a fallback only when
the primary web source is unavailable.

Queries use allowlisted schema discovery, bounded dates, statement timeouts and
`BEGIN READ ONLY`. They return hourly aggregates, not customer credentials. No
order creation, replay, payment, status mutation or queue dispatch is performed.
Only individual schema-verified metadata columns are projected, never whole-row
JSON conversions. Native timestamp lower bounds allow existing indexes to help;
no new index or production schema mutation is needed for this change.

Within each channel, customer references are normalized across transport prefixes
and unit suffixes. Original source rows take precedence over Telegram and bot
copies; stable unit identities prevent counting execution copies twice. Completed
bot units can resolve a stale synced parent for backlog analytics. A source with
no quantity column contributes one unit per stable source row; embedded bundle
multipliers are not universally inferred, so those sources may undercount packs.

Cancelled/refunded/unpaid records are excluded from incoming work. Backlog is
limited to the queried 56-day history and reflects present statuses, not historical
point-in-time snapshots. Unknown statuses are disclosed. Backlog is not silently
added to next-day forecast demand.

## Forecast

Each channel is trained separately using completed workdays preceding the chosen
date, with at most 56 days of history. Same-weekday hourly means require at least
three samples; otherwise recent same-hour observations are used. The first partial
coverage day is excluded. Insufficient history yields an unavailable forecast,
not a fabricated zero. No current/future workday data enters training.

The displayed low/high range is an empirical variation band, not a calibrated
confidence interval. This baseline does not model holidays, promotions or unusual
events. Source coverage and work-unit accuracy should be verified in production
before using the suggestions as a final roster.

## Checks

```sh
node tests/workforce-planning-tests.mjs
npm test
npm run build
node scripts/workforce-smoke.mjs
```

The browser smoke test uses a local mocked aggregate response only; it does not
connect to production databases or send work to bots.
