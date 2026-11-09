# A&H app: developer reference

These files explain how the A&H company app is built, how its parts fit together, and how to change it safely. They're for whoever maintains the app (Claude or a developer). The owner-facing guide is the **App Manual** Claude Doc (https://claude.ai/artifact/Bv9WvGY5stKbkAVNgZ2s7r).

| File | Read it when you need to... |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Understand how one HTML file runs on claude.ai and on the company server |
| [DATA-MODEL.md](DATA-MODEL.md) | Find where a record lives and who can read or write it |
| [WORKFLOWS.md](WORKFLOWS.md) | Follow an estimate from the visit to a signed job, and the roles involved |
| [PRICING.md](PRICING.md) | Change or debug how prices are calculated |
| [TRAINING.md](TRAINING.md) | Work on the academies, quizzes, sign-offs and milestones |
| [SERVER.md](SERVER.md) | Run, deploy or fix the company server (app.anhservicesllc.com) |
| [AUTOMATIONS.md](AUTOMATIONS.md) | Change a scheduled task (backups, milestone emails, vendor paperwork) |
| [TESTING.md](TESTING.md) | Run the tests or add one |
| [RELEASE.md](RELEASE.md) | Ship a change: backup, patch, test, publish, deploy, log |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Fix a known problem, or record a new one |

## The short version

- **One file is the whole app:** `app.html` holds about 900 KB of HTML, CSS and JavaScript, with no build step.
- **It runs in two places:**
  - **claude.ai** (the live artifact, https://claude.ai/artifact/LkJyGVvG8Th8rEninCPy6N), where storage is claude.ai's shared database.
  - **The company server** (`server.js`, hosted on SiteGround at https://app.anhservicesllc.com), where storage is JSON files on disk.
- **Every merge to `main` deploys to SiteGround automatically.** Publishing to claude.ai is a separate step (see RELEASE.md).
- **Every change runs the tests** in `tests/` on GitHub before it can be merged.
- **Every change gets a row in the change-log sheet:** "A&H App Change Log", Google Sheet `1IV9m6j9Q-mNkV0GhAyWXkqYKr_rPxJ_0raSANqmt0zU`, tab "Change log".

## House rules (from the owner)

- **Read and back up first.** Read the live app and keep a backup of the current version before changing it. Re-test the sample estimates afterward.
- **Protect estimate E-1001.** Never overwrite or delete it.
- **Keep migrated records.** Don't delete migrated ProBooks records.
- **Credentials:** no passwords, API keys or 2FA codes in code, docs, commits or chat. The owner enters them himself on the server's /admin page or in SiteGround.
- **Personal details:** keep employee and customer details (phone, email, address, wages) out of docs, tests and summaries. Test data is synthetic.
- **Rollout:** nothing rolls out to the team or customers until the owner says the program is complete.
