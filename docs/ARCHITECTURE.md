# Architecture

## Files in this repository

| Path | What it is |
|---|---|
| `app.html` | The whole app: markup, styles and one large `<script>`. The same file is published to claude.ai and served by the company server. |
| `server.js` | The company server: storage, sign-in, users, photo uploads, the AI proxy and the daily training email. No npm dependencies. |
| `package.json` | Tells SiteGround to run `node server.js`. Also holds `npm test`. |
| `tests/` | Automated tests (see TESTING.md). |
| `docs/` | These reference files. |
| `SERVER-README.txt` | Short owner-facing setup notes for the server. |

## How the app finds its storage

`boot()` runs when the page loads:

1. **`selfHostShim()`** checks for a company server. If `window.claude` is missing and `GET api/health` answers `{"app":"ah-estimating"}`, it builds a small `window.claude` look-alike on top of the server's REST API (`api/col`, `api/doc`, `api/upload`, `api/me`, `api/users`). It polls `api/rev` every 4 seconds for changes. On claude.ai this step does nothing.
2. **`window.claude.use("db")`**: if a database is available, the app is in **shared** mode. The badge reads "Shared" on claude.ai or "Company server" on the server.
3. **Otherwise it runs in demo mode.** Data stays only in that browser (`localStorage`).

In shared mode the app subscribes to:
- `estimates`
- `config/main`, the price book and settings, merged over `DEFAULT_CFG`
- the other collections listed in `STORES`, through `loadStores()`

Each subscription keeps an in-memory array up to date (`ests`, `homes`, `jobs`, `trnP`, …) and re-renders when it changes.

## Runtime capabilities used on claude.ai

These are declared on the artifact and carried forward on each publish. Don't pass `capabilities` when publishing unless you mean to change them.

| Capability | Used for |
|---|---|
| `db` | All records. Its rules protect `office/private/*` (see DATA-MODEL.md). |
| `user` (`scopes: ["profile"]`) | Who is signed in; names for people ids |
| `assets` (`upload: "interact"`) | Photos and uploaded files |
| `downloads` | PDFs and CSV exports |
| `sample` | "Fill it in for me" AI from job notes |

## Screens and navigation

- **Tabs:** `#tabs [data-v=...]` switches between home (Estimates), board (Jobs), schedule, time, customers, homes, accounts, vendors (Subs & vendors), money, marketing, training, book (Price book) and how (How it works).
- **Screens inside a tab:** `go(name)` sets `screen` and calls `renderScreen()`, which fills `#screen`. Examples are estimate, job, inv, wo, dlog, sign, closeout, trquiz and trrec.
- **Clicks:** handled by delegated `document.addEventListener("click", …)` blocks. Each looks for `data-*` attributes or button ids. Search for the id or attribute to find the handler, for example `id==="approve"` or `data-trquiz`.
- **Roles:** the **Working as** selector (`#role`) sets `role()`. The choices are limited to the roles the signed-in person has in the Team list (`myRoles()`). See WORKFLOWS.md.

## PDFs

`modelPdf()` turns a simple block model into a real PDF. Callers include `invModel`, `propModel`, `trRecModel` and `repModel`. `openPreview()` shows it, and `modelDownload()` saves it through the downloads capability.

## Size and editing

`app.html` is large and mostly long lines. Change it with exact-match replacements: a Python script that asserts each `old` string occurs the expected number of times, then writes a new version. Don't reformat the file. See RELEASE.md.
