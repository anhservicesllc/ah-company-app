# Testing

## Run the tests

```
npm install --no-save playwright@1.48.2 && npx playwright install chromium   # once
npm test                       # everything (about 2 minutes)
npm run test:server            # only the company server tests (no browser needed)
node --test tests/app-pricing.test.js   # one file
```

If Playwright or Chromium is installed somewhere else, point to them:

```
PW_MODULE=/path/to/node_modules/playwright PW_CHROMIUM=/path/to/chromium npm test
```

GitHub runs `npm test` on every pull request and every push to `main` (`.github/workflows/test.yml`). **Don't merge a pull request with a red check.**

## What's covered

| File | Checks |
|---|---|
| `app-pricing.test.js` | Margin formula (not markup); labor at the higher of cost-based or customer rate; waste and Nevada tax; minimum job; the live margin, rate and limit settings; a price snapshot of the test estimate |
| `app-rules.test.js` | Nevada deposit warning; estimator self-approval only under $5,000 and at target margin; the approve button for senior only |
| `app-training.test.js` | Course counts and valid questions for every academy; PM levels; Cabinet and Estimating milestones; quiz pass/fail and logging; sign-off rules |
| `app-voice.test.js` | Reading phone, spoken email, address, city, ZIP, name, price and day; new estimate by voice (customer, intake, work); jobs without an estimate (emergency/insurance, phone price with the Nevada reminder and proposal, program vs. service); daily log and change order by voice |
| `app-crews.test.js` | Spreadsheet paste keeps only safe columns; making a handyman crew and putting it on a job; crew said by voice; read-only for field crews; phone job rows fit and open the job; preview scrolls as a page |
| `app-calendar.test.js` | Calendars by role, Master and toggles; calendar, crew and vendor on an appointment; office adds a crew calendar and sets who sees it |
| `app-backup.test.js` | Moving records with a backup file: choose what to bring in; sign-in records from the other app start unticked |
| `app-smoke.test.js` | Every tab opens with no JavaScript error, on desktop and phone, for every role; the test estimate opens for every role |
| `server.test.js` | Owner setup and second-setup refusal; sign-in; signed-out requests refused; save, merge, list and delete; access rules; bad paths; admin-only pages; the daily training email, including a wrong mailbox password |

## How the app tests work

`tests/lib/harness.js` opens `app.html` from disk in headless Chromium with a fake `window.claude` (database and user). Seed data:

- **`tests/fixtures/config.json`:** the live price book and settings.
- **`tests/fixtures/estimate.json`:** a synthetic Remodel estimate, `E-TEST`, built from a real job's scopes with every customer detail removed.

Tests call the app's own functions in the page, for example `page.evaluate(() => totals(ests[0]))`, or click through it like a person would.

## Adding a test

- **Bug fixes:** add a test that fails before the fix and passes after.
- **New rules:** test both sides (allowed and blocked).
- **Test data:** never put real customer or employee details in fixtures.
- **Price snapshot:** if a change moves the snapshot price on purpose, update the number in `app-pricing.test.js` and say why in the pull request.

## Older ad-hoc checks

Before this suite existed, each change was checked with one-off Playwright scripts (the `t53_*`, `ui5x` scripts in the working scratchpad). Their checks now live in the files above.
