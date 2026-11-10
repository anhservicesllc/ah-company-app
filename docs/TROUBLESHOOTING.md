# Troubleshooting

Known problems and their fixes. **Add a row whenever you fix something new:** symptom, cause, fix, and the test that now guards it.

## Quick checks

| Symptom | Check first |
|---|---|
| App won't load on the server | `https://app.anhservicesllc.com/api/health`. If it's down, check Site Tools > Devs > Node.js > Logs, and the latest deploy in `public_html/.nodeapp/git.log` |
| Logins gone after an update | Data must be in `ah-data/` at the site's top level, not in the build folder (`dataDir()`). Fixed in PR #3 |
| Someone can't save quizzes or records on claude.ai | They're a Viewer or Commenter. Outside people can't be more, so have them train on the company server |
| Badge says "Demo · this browser only" | No database found: opened from a file or another host, or the claude.ai `db` capability failed. Nothing is shared in this mode |
| 🎤 Talk button missing | The browser has no speech recognition or blocked the microphone. Use the 🎤 on the phone keyboard instead; the box works the same |
| Voice fill missed something | It only fills what it can read with confidence. With AI off (server /admin) it uses the simpler built-in reader. Fill the rest by hand |
| Wrong role options in "Working as" | The Team list (`office/private/team`) controls them. When it's empty, anyone can pick any role |
| Milestone emails missing for server trainees | Server /admin "Training updates to the office": status on, no error. Then search Gmail for `subject:"A&H server training export"` |
| Something entered in claude.ai isn't on the server (or the other way) | They keep separate data | Price book → Backup and restore: download in one, restore in the other, ticking only what to move. Photos stay where they were taken |
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
| Nov 9, 2026 | Admin page mail login failed; AI fields held the owner's Gmail login | Chrome autofilled saved logins into settings fields | `autocomplete="new-password"/"off"` on those fields (PR #9) | — |
| Nov 9, 2026 | Jobs entered without an estimate got the Home Depot job-number channel | `chForJob` only knew Steel and Home Depot | Channel by line: Remodel 40, Service 100 (v86) | `app-voice.test.js` |
| Nov 9, 2026 | Job list hard to read on phones; words and dropdowns cut off | 9-column table squeezed into stacked cards with no side padding | Phone rows that open the job; padding on stacked tables (v87) | `app-crews.test.js` |
| Nov 9, 2026 | Couldn't see the whole proposal preview on a phone | Fixed overlay with its own scroll area, cut off inside claude.ai | Preview is part of the page and scrolls normally (v87) | `app-crews.test.js` |
| Nov 9, 2026 | Home profile didn't keep what was typed; no save button | A live update redrew the screen as focus moved between boxes, dropping the typing | Save as you type, Save/Done bar, no redraw while editing (v88) | `app-crews.test.js` "home profile saves" |
| Nov 9, 2026 | Couldn't tell if a photo uploaded | Only a short toast | Upload count and progress on the screen; gallery or camera (v88–v89) | — |
| Nov 10, 2026 | Some estimate visit answers didn't stick when several were changed quickly | A live update arrived while the save was on its way and replaced the record with the older copy | `pendStart`/`pendEnd`/`keepLocal`: records being saved are kept until the server has them (v96) | `app-crews.test.js` "live update arriving mid-save"; data-entry audit |
| Nov 10, 2026 | Rachael's time didn't show anywhere for the office | Time is stored by sign-in; employees weren't linked to sign-ins, and the sign-in picker only listed the (empty) team list | Time → Employees lists time from unlinked sign-ins with a "This person is" picker; sign-in pickers list all server users (v96) | `app-crews.test.js` |
| Nov 9, 2026 | Cloud tasks can't read server data | Network allowlist blocks the server | Server emails a daily training export (PR #7) | `server.test.js` "daily training email" |

## Where to look in the code

- **A button doesn't respond:** search `app.html` for its `id==="..."` or `data-...` attribute to find the click handler.
- **A screen is wrong:** find the `*Html` function that builds it (e.g. `trTeamHtml`, `jobHtml`, `invHtml`) and how `renderScreen()` calls it.
- **A record didn't save:** check the browser console for `denied` (access rule) and the matching `STORES`/`setStore` entry.
- **Server errors:** `ah-data/audit.log` records sign-ins, saves, uploads, user changes and training export results.
