# Troubleshooting

Known problems and their fixes. **Add a row whenever you fix something new:** symptom, cause, fix, and the test that now guards it.

## Quick checks

| Symptom | Check first |
|---|---|
| App won't load on the server | `https://app.anhservicesllc.com/api/health`. If it's down, check Site Tools > Devs > Node.js > Logs, and the latest deploy in `public_html/.nodeapp/git.log` |
| Logins gone after an update | Data must be in `ah-data/` at the site's top level, not in the build folder (`dataDir()`). Fixed in PR #3 |
| Someone can't save quizzes or records on claude.ai | They're a Viewer or Commenter. Outside people can't be more, so have them train on the company server |
| Badge says "Demo · this browser only" | No database found: opened from a file or another host, or the claude.ai `db` capability failed. Nothing is shared in this mode |
| Wrong role options in "Working as" | The Team list (`office/private/team`) controls them. When it's empty, anyone can pick any role |
| Milestone emails missing for server trainees | Server /admin "Training updates to the office": status on, no error. Then search Gmail for `subject:"A&H server training export"` |
| A price looks wrong | Line flags (*Below market* usually means a missing cost); `cfg.book` for that code; the scope's tier and adjustments; `marginOf(e)`; minimum job (PRICING.md) |
| Red Nevada banner on an estimate | The deposit is over $1,000 / 10%. Fix the payment schedule (WORKFLOWS.md) |

## Fixed issues

| Date | Symptom | Cause | Fix | Guarded by |
|---|---|---|---|---|
| Nov 3, 2026 | Quiz radio buttons huge, labels in capitals | The app's global label styles applied to quiz options | `.tropt` style overrides | smoke test (no layout check yet) |
| Nov 3, 2026 | Training dates showed tomorrow in the evening | UTC date slice | `trD` uses local `en-CA` dates | — |
| Nov 4, 2026 | SiteGround deploy failed: "Missing package.json" | Repo had no package.json | Added `package.json` (PR #2) | — |
| Nov 4, 2026 | Data would vanish on each deploy | Each deploy is a new build folder | `dataDir()` puts data in `<site>/ah-data` (PR #3) | `server.test.js` "data stays outside the app folder" |
| Nov 7, 2026 | Field crews couldn't be given write access on claude.ai | Outside people only get Viewer or Commenter | Train on the company server | — |
| Nov 7, 2026 | Admin page "AI settings saved" went to a wrong URL (`/admin/admin`) | Relative redirect | Redirect to `../admin` (PR #7) | `server.test.js` |
| Nov 9, 2026 | Cloud tasks can't read server data | Network allowlist blocks the server | Server emails a daily training export (PR #7) | `server.test.js` "daily training email" |

## Where to look in the code

- **A button doesn't respond:** search `app.html` for its `id==="..."` or `data-...` attribute to find the click handler.
- **A screen is wrong:** find the `*Html` function that builds it (e.g. `trTeamHtml`, `jobHtml`, `invHtml`) and how `renderScreen()` calls it.
- **A record didn't save:** check the browser console for `denied` (access rule) and the matching `STORES`/`setStore` entry.
- **Server errors:** `ah-data/audit.log` records sign-ins, saves, uploads, user changes and training export results.
