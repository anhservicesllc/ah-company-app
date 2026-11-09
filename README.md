# A&H company app

Private code for the A&H Services LLC / A&H Construction LLC company app: estimates, jobs, schedule, time, customers, subs and vendors, money, marketing, training and the price book.

| File | What it is |
| --- | --- |
| `app.html` | The whole app in one file. The same file runs on claude.ai and on the company server. |
| `server.js` | The company server (Node.js 18+, no outside packages): database, photo storage, sign-in, user admin. |
| `SERVER-README.txt` | How to set up and run the company server. |
| `docs/` | Developer reference: architecture, data model, pricing, training, server, automations, testing, release steps, troubleshooting. Start at [docs/README.md](docs/README.md). |
| `tests/` | Automated tests. `npm test` runs them; GitHub runs them on every pull request. See [docs/TESTING.md](docs/TESTING.md). |

**Current version:** claude.ai app Version 85.

**How changes are made:** every change follows the A&H App Manual (Merge, Maintenance and Development): request on the change log, build, test, Ron approves, release, record. Nothing is pushed here without Ron's approval. Never commit passwords, keys, customer data or backups to this repository.
