# Workflows and roles

## Roles (the "Working as" selector)

| Role | Key | Can |
|---|---|---|
| Measure tech | `tech` | Run the visit: measurements, photos, condition checks, who does the work, Good/Better/Best. Submit the visit. |
| Estimator | `est` | Review the priced draft, add lines the price book doesn't cover, send for approval. **Approve and send estimates under $5,000 at target margin** (`selfOK`). |
| Senior estimator | `senior` | Approve and send, or return to the estimator with a note. Approves every estimate of $5,000 or more and anything below target margin; $25,000 and up is flagged. Currently the owner (Ron). |
| Office | `office` | Customers, money, training team progress and sign-offs, Nevada payment warnings |
| Field crew | `crew` | Time clock, daily logs, punch, change order requests |
| View only | `view` | Read |

Roles come from the Team list (`office/private/team`). When the list is empty, anyone can pick any role. Fill it in before giving several people access.

## Estimate status flow

```
(new) ──tech submits visit──▶ estimator ──"Send for approval"──▶ approval ──senior approves──▶ sent ──customer signs──▶ signed / Won
             ▲                     │   └──"Approve and send" (est, < $5,000, at target margin)──────▶ sent
             │                     └──"Needs re-measure"──▶ returned (to tech)
             └────────────────────────────── returned (to est) ◀──"Return to estimator" (senior, note required)
```

- **24-hour clock:** submitting the visit starts it (`submittedAt`).
- **Price book freeze:** approval runs `freezeBook(e)`, which locks the price book lines at the approved prices for this estimate. Returning it runs `unfreezeBook(e)`.
- **Follow-ups** on days 3, 7 and 14 start when an estimate is sent.
- **Quick OK at the visit:** a tech with a customer ready to sign asks for a quick senior OK, the senior approves from their phone, and the customer signs on the tech's phone (`e.quick`).
- **Signing:** the customer signs the proposal (with the right-to-cancel notice). The estimate becomes Won and gets a job number.
- **History:** every step is written to `e.trail` with `log(e, text)`. Never bypass it.

## Nevada payment rules

`nvPayWarn(e)` shows a red banner on Nevada estimates when the deposit is more than the lesser of $1,000 and 10% of the price. A&H may hold the $100,000 consumer-protection bond, which would lift that cap; this is still being confirmed (R-027). The default 30/40/30 split trips the warning on almost every job. See also the PM-103 and EST-114 courses.

## Say it all at once (voice fill)

One box with a 🎤 button fills a whole form from what someone says, on four screens:

| Screen | Fills |
|---|---|
| **New estimate** ("Fill it in and start") | Customer (name, phone, email, address, city, ZIP), visit name, division, state, intake answers (how they heard, why now, budget, timeline, year built, occupied), then the work types, measurements and checks |
| **Job without an estimate** ("Create the job") | How it came in, billing, line of business, job name, what we're doing, program/insurer, PO or claim #, price or not-to-exceed, scheduled day, city, ZIP, customer |
| **Daily log entry** ("Fill in today's entry") | Work done, materials, others on site, delay and details, inspections, customer requests, safety, plan for tomorrow (adds to what's already there) |
| **Change order request** ("Fill in the request") | What changed, why, quantity or size |

- **How it reads:**
  - with AI available (claude.ai's built-in Claude, or the company AI set on the server's /admin), it asks the AI for JSON;
  - otherwise it uses the built-in reader (`sayFacts`, `sayEstLocal`, `sayJobLocal`, `sayLogLocal`, `sayCoLocal`).
- **No guessing:** it never invents values. Everything it fills is meant to be checked.
- **Customer details:**
  - Editors create the customer directly.
  - Everyone else sends a customer request (`office/private/custreq`) with `estId` or `jobId`. Approving it links the estimate or job.
- **The 🎤 button:** shows wherever the browser offers speech recognition. If the microphone is blocked (as it can be inside claude.ai), the button hides and people use their keyboard's 🎤 instead.

## Jobs without an estimate

Start from **Job board → + Job without an estimate**: by voice, or by tapping one of the four kinds.

| How it came in | Default billing | Line |
|---|---|---|
| Service / repair call | Time and materials (Flat price if a price was said) | Service work |
| Price agreed by phone | Flat price | Remodel or Service work |
| Program / builder job | Program rate card | Home Depot program (or Service work) |
| Emergency / insurance | Insurance claim | Service work |

- **Storage:** these are `jobs` records with `noEstimate: true`, plus `how`, `billing`, `scope`, `nte`, `schedDate`, `city`, `zip`, `custId` and `said` (the original words).
- **Job numbers:** they come from the line: Remodel 40, Service 100, Home Depot 10, Steel 90.
- **Nevada contracts:** Nevada residential jobs (not program or steel) show a reminder that work over $1,000 needs a signed written contract. The **Make a proposal to sign** button starts an estimate from the job (`fromJob`), with the work filled in from what was said.

## Employees and crews

**Time → Employees** (Office and Senior estimator only). Tap an employee to see their time card for the week, the last 4 weeks, their crew and open jobs, and approve a submitted week. **Manage employees & crews** opens the editing screen (also on the Job board for those roles). Field crews don't see the list; they see who's on each job.

- **Employees** (`staff`): loaded from the Master Employee List (active rows only). New hires: **+ Add employee**, or paste rows from the spreadsheet (only ID, name, position, department, type and active are read). Link an employee to their app sign-in so their crew's jobs show first at clock-in.
- **Crews** (`crews`): **+ Handyman crew** or **+ Other crew**, tick who's on it, pick a lead.
- **On a job:** the job file and the job screen have a **Crew** picker. Picking a crew copies its people onto the job; **Change who's on this job** adds or removes one person. The job keeps name snapshots (`crewName`, `staffIds`, `staffNames`, `staffLead`) so field crews see who's on it, and `crew` (sign-ins) keeps the time clock working.
- **By voice:** "send the handyman crew", a crew's name, or an employee's full name in a job-without-an-estimate note assigns them.

## Calendar

The **Calendar** tab (was Schedule; screen key `schedule`). Each appointment sits on one calendar (`appts.cal`; older ones are placed by type with `calOf`).

| Calendar | Can see | Can add |
|---|---|---|
| Estimators | Tech, Estimator, Senior, Office | same |
| Field | Tech, Estimator, Senior, Office, Field crew | Senior, Office |
| Vendors & deliveries | Estimator, Senior, Office | same |
| Office | Senior, Office | same |

- **Showing calendars:** tap a calendar to show or hide it; **Master** shows every calendar you can see. The choice is remembered on that phone.
- **Always visible:** someone booked on an appointment always sees it.
- **Manage calendars** (Office, Senior): rename, recolor, set who can see and who can add, turn one off, add crew calendars or others. Changes are stored in `calendars`, overriding the built-in four (`CAL0`).
- **New appointment:** pick the **Calendar**, plus an optional **Crew** (adds the crew's sign-ins to "who goes") and **Vendor or sub**.

## Tabs by role

Each role sees only its tabs (`cfg.tabRoles`, set in **Price book → Settings → Tabs each role sees**; defaults in `TAB_ROLES0`). Money and Subs & vendors start as Office only. Opening a hidden tab's screen sends the person to their first allowed tab. This keeps screens simple; it is not a security lock (the database access rules are).

## Accounts

Loaded Nov 9, 2026 with no jobs: Home Depot, Renaissance Maintenance Inc., Chrysalis, The Brokerage, United Field Services, R&O Construction, KSCO Investments LLC, APE Legacy Transport, Capital Steel. Terms, rates and response times are blank until the office fills them in.

## Phones

- The job board opens on the list on phones: one tappable row per job (job #, step, name, line, date, contract, crew). Tap it to open the job.
- Every photo button has a 📷 camera choice and a 🖼 gallery choice.
- Forms save as you type; a background refresh no longer redraws a screen while someone is typing or tapping (`_lastEdit`, `_ptrDown`).
- Previews (proposals, invoices) open as a normal page that scrolls top to bottom; **Close** goes back.

## Jobs after signing

Jobs, the schedule, the time clock, daily logs, change orders (`coreqs`), orders, job costs, punch, warranty, closeout packets and invoices all hang off the job number. The Money tab rolls up revenue, cost and profit, and flags "Losing money" when job costs pass the price.
