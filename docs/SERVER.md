# Company server (server.js)

Runs the same `app.html` on A&H's own hosting, with company logins. It needs Node 18+ and no npm packages.

## Live setup

| Item | Value |
|---|---|
| Address | https://app.anhservicesllc.com (backup address: rona28.sg-host.com) |
| Host | SiteGround GrowBig, Node.js project, server IP 35.215.119.253 |
| Deploys | Every merge to `main` on GitHub (anhservicesllc/ah-company-app). Each deploy goes into a new folder under `public_html/.nodeapp/`, with `latest` pointing at the newest. |
| Data | `ah-data/` at the site's top level (outside `public_html` and outside every build folder): `db/`, `blobs/`, `users.json`, `sessions.json`, `audit.log`, `ai.json`, `mail.json`, `export.json` |
| Health | `GET /api/health` returns `{"ok":true,"app":"ah-estimating","users":true,"ai":false}` |
| SSL | Let's Encrypt with HTTPS Enforce, set in Site Tools > Security |
| Backups | SiteGround daily automatic backups (up to 30 days), which include `ah-data` |

`dataDir()` picks the data folder: `AH_DATA` if set, otherwise `<site>/ah-data` when running inside `.nodeapp`, otherwise `./data`.

## Endpoints

| Path | Who | What |
|---|---|---|
| `GET /api/health` | anyone | Status |
| `GET /login`, `POST /login`, `/logout` | anyone | Sign in and out (30-day session cookie `ah_s`) |
| `POST /setup` | first visitor only | Creates the owner; refused once any user exists |
| `GET /`, `/app.html` | signed in | The app |
| `GET /admin`; `POST /admin/add`, `/admin/user` | admins | Add people, change access, turn people off, reset passwords |
| `POST /admin/ai`, `/admin/mail`, `/admin/export` | owner | AI settings, outgoing mailbox, "Send training update now" |
| `GET /api/me`, `/api/users`, `/api/rev` | signed in | Who am I, people list, change counter |
| `GET /api/col?path=`; `GET/PUT/PATCH/DELETE /api/doc?path=` | signed in, subject to the access rules | Records |
| `POST /api/upload`, `GET /_blob/<id>` | signed in | Photos and files |
| `POST /api/ai` | signed in | "Fill it in for me" through the owner's AI settings |

The access rules are in `allowed(u, s, op)` and match DATA-MODEL.md.

## Daily training email

Scheduled tasks run in Anthropic's cloud and **can't reach this server**; the network blocks it. So the server sends its training data out instead:

- **When:** every 15 minutes it checks. After 3 pm Mountain, once a day, if the training data changed, `exportTraining()` sends it.
- **What:** an email with the subject `A&H server training export YYYY-MM-DD`. The body is base64 JSON:

  ```json
  {"kind":"ah-training-export","v":1,"from":"app.anhservicesllc.com","at":"…","names":{"u_…":"Name"},"training":[…],"trmiles":[…]}
  ```

- **Where to:** info@anhservicesllc.com by default.
- **How it's sent:** over SMTP with implicit TLS (port 465) and AUTH LOGIN, using a mailbox the owner sets on /admin. The password is stored only in `ah-data/mail.json`.
- **Status:** the result and last error show on /admin and are saved in `export.json`.

## Photos to Google Drive

Every photo uploaded to the server is also copied to the owner's Google Drive (`gdSync`, every 10 minutes and on **Copy now**).

- **Where:** a folder the server creates, **A&H App Photos**, with a subfolder per kind (Homes, Estimates and jobs, Work orders, Daily logs…) and one per record. Photos not on any record after an hour go to **Unfiled**. The server finds where a photo belongs by looking for its id in the records.
- **Permission:** the owner's own Google Cloud OAuth client with the `drive.file` scope. The server can only see what it created. The owner pastes the client ID and secret on `/admin` and taps **Connect Google Drive**. The refresh token lives in `ah-data/gdrive.json`; what's been copied is in `ah-data/gdrive-sync.json`.
- **Google Cloud setup** (owner, once): project "A&H App" → enable Google Drive API → OAuth consent screen (External, scope `…/auth/drive.file`, **Publish app** so the connection doesn't expire after 7 days) → Web client with redirect URI `https://app.anhservicesllc.com/admin/google/callback`.
- **Branding in Google Cloud:** home page `https://app.anhservicesllc.com`, privacy policy `https://app.anhservicesllc.com/privacy` (a public page on this server), authorized domain `anhservicesllc.com`.
- **Errors** show on `/admin` and in `audit.log`. "Google sign-in failed" means reconnect.
- **Tests:** `tests/server-drive.test.js` runs the whole flow against a fake Google (`AH_GOOGLE_AUTH`, `AH_GOOGLE_OAUTH`, `AH_GOOGLE_API`, `AH_PUBLIC_URL`).

## Appointment reminder emails

Every 5 minutes the server emails appointment reminders (`sendReminders`) to the people booked on each appointment who have a sign-in, using the outgoing mailbox from "Training updates to the office". Sent reminders are tracked in `ah-data/reminders-sent.json` so nobody gets one twice. Owners can send due reminders right away by POSTing `/admin/reminders`. Non-ASCII subjects are encoded (RFC 2047).

## Home-screen icon

`/manifest.webmanifest` and `/icons/icon-*.png` are public, so "Add to Home screen" shows the A&H saw-blade logo even from the sign-in page. The icons in `icons/` were made from the logo inside `app.html` (180 px, scaled to 192 and 512, plus a padded "maskable" 512 for Android). The server adds the icon links to every page it sends, including `app.html`.

## Running it locally

```
node server.js                       # http://localhost:3000, data in ./data
AH_DATA=/tmp/ahdata PORT=3999 node server.js
```

The first visit to `/login` offers to create the owner.

## Users

- **Who adds people:** admins, on /admin, with a temporary password of 10+ characters. The owner gives it to the person directly; never by email, and never by Claude.
- **When someone leaves:** turning them off signs them out everywhere at once.
- **Roles:** the in-app roles (tech, estimator, …) still come from the Team list inside the app.
