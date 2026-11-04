A&H ESTIMATING APP — COMPANY SERVER COPY
========================================

What this is
------------
The same app you use on claude.ai, running on your own hosting so the company can keep
operating if Claude is ever unavailable or unaffordable. Two files:

  server.js   the company server: database, photo storage, sign-in, user admin
  app.html    the app itself (the same file that runs on claude.ai)

No outside packages are needed. Node.js 18 or newer.

What works the same
-------------------
Estimates, price book, proposals, jobs board, invoices and payments, homes, accounts,
work orders, marketing, customers, team roles, daily logs with photos and weather,
change order requests, closeout packets, backup and restore, and the Training tab (courses,
quizzes, field tasks, sign-offs, training records with PDF, milestones, live classes).

What's different
----------------
- Sign-in: people sign in with an email and password you create on the Users page
  (/admin), instead of their Claude account.
- Turning someone off on the Users page signs them out everywhere at once.
- Updates from other people appear within about 4 seconds (not instantly).
- Training milestone emails to the executive team and the Drive training archive run from
  the claude.ai app only. On the company server, milestones and records still show in the
  Training tab and download as PDF, but no emails go out and nothing is archived to Drive.
- Photos taken on claude.ai stay on claude.ai. A backup moves the records and lists the
  photos. Moving the photo files themselves is a separate step if ever needed.

Moving your data over
---------------------
1. In the claude.ai app: Price book > Backup and restore > Download full backup.
2. On the company server, sign in as the owner: Price book > Backup and restore >
   Restore from a backup file > tick "Also replace settings and the price book" > Restore.
   (E-1001 is never overwritten. Nothing is deleted.)

Setting it up on SiteGround (GrowBig includes up to 5 Node.js apps)
-------------------------------------------------------------------
How it is set up now (Nov 2026):
  Code:   GitHub, anhservicesllc/ah-company-app (private), branch main.
  Host:   SiteGround Node.js project, test address https://rona28.sg-host.com
  Deploy: every merge to main deploys automatically. SiteGround builds each deploy in a
          new folder under public_html/.nodeapp/ and points "latest" at it.
  Data:   ah-data/ at the site's top level (next to public_html), NOT inside the build
          folder, so logins, records and photos survive every deploy. The server finds it
          on its own; set AH_DATA in Site Tools > Node.js only to move it somewhere else.
  Check:  https://<address>/api/health  ->  "ok":true, "users":true once the owner exists.

To make a change: edit on a branch, open a pull request, merge to main. SiteGround redeploys
within a minute or two. Nothing in ah-data is touched.

Setting it up again from scratch:
1. SiteGround Site Tools > Devs > Node.js > Create project, connect the GitHub repository,
   branch main. package.json tells SiteGround to run "node server.js" (it sets the PORT).
2. Use Node.js 18 or newer.
3. Assign a domain, for example app.anhservicesllc.com, and turn on the free SSL.
4. Open the address. The first screen creates the owner account. Then open /admin to
   add everyone else, and set their roles in the app under Price book > Team and roles.
5. Turn on SiteGround's daily backups. Everything lives in the ah-data folder: one small
   file per record, plus photos. Copy that folder to keep a backup.

Running it on any computer (for a test or an emergency)
-------------------------------------------------------
  node server.js
Then open http://localhost:3000 on that computer.

Safety notes
------------
- Always use the https address (SSL) so passwords are protected.
- Use passwords of 10+ characters. Admins can reset them on the Users page.
- ah-data/audit.log (data/audit.log when run on a computer) records sign-ins, saves, uploads and user changes, with who and when.
- Access rules match claude.ai: HR-style office records are admin-only, customers are
  readable by everyone and changed by admins, the team list is changed by admins.

AI FOR "FILL IT IN FOR ME" (optional)
  The estimate's "Tell me about the job" box turns a tech's spoken or typed notes into measurements.
  On this server it can use:
    - Off: the app's built-in reader (free, no internet AI; picks up sizes and counts it recognizes).
    - Claude API: get an API key at console.anthropic.com; on /admin choose "Claude API", model claude-haiku-5-5
      (or claude-sonnet-5-5 for harder notes), paste the key. Pay per use.
    - Our own AI: run Ollama or LM Studio on an always-on office computer (16 GB+ memory; a graphics card helps),
      load a model (for example llama3.1), then on /admin choose "Our own AI", address http://<that computer>:11434/v1.
      No per-use cost, nothing leaves the office, but answers are less reliable than Claude's.
  The owner sets this on /admin. The key stays on the server (ai.json in the data folder) and never reaches a phone.
  Needs Node 18 or newer.
