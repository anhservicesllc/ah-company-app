# Data model

Records are JSON documents in collections. Paths alternate between collection and document: for example `estimates/E-1002`, or `office/private/customers/C-1002`. claude.ai and the company server use the same paths and the same access rules.

## Access rules

| Path | Read | Write |
|---|---|---|
| `office/private/*` (pay, meta, run reports, archive state) | owner and admins (claude.ai: Editors) | owner and admins |
| `office/private/customers` | everyone signed in | admins |
| `office/private/team` | everyone signed in | admins |
| `office/private/custreq` | everyone signed in | everyone signed in |
| everything else | everyone signed in | everyone signed in (claude.ai: Contributor and up) |

**The access checks on claude.ai.** The app tests what the viewer can read through two marker documents, `office/private/team/check` and `office/private/meta/check`. It then shows customer details read-only or editable to match.

**What outside people get on claude.ai.** People invited from outside the organization only get Viewer or Commenter. Neither can write, so they can't save quizzes. That's why field crews train on the company server (see TRAINING.md).

## Collections

| Collection | One document per | Notes |
|---|---|---|
| `config/main` | (single doc) | Price book (`book`), margins, labor rate, minimum job, tax, factors, payment split, settings. Merged over `DEFAULT_CFG` in the app. |
| `estimates` | estimate (`E-####`) | Scopes with measurements, tiers and adjustments; extras; status; trail (history); proposal settings; signature; job number once won |
| `jobs` | job | Program, steel and other jobs tracked for billing |
| `invoices` | invoice | Billing; payments; online payment switch |
| `homes` | home | Home profile and history of work |
| `accounts` | property-management or builder account | Terms: hourly rate, trip charge, materials markup, not-to-exceed, rate card |
| `wos` | work order | Work for accounts, priced from the account's rate card |
| `campaigns` | marketing campaign | Results by source |
| `dlogs` | daily log entry | Field daily logs with photos and checklist answers |
| `coreqs` | change order request | Raised in the field, priced by the estimator, signed by the customer |
| `appts` | appointment | Schedule |
| `timeclock` | clock-in record | Hours by person, job and cost code |
| `punch` | punch-list item | Closeout |
| `orders` | material order | Ordering and lead times |
| `costs` | job cost entry | Actual costs for job profit |
| `warranty` | warranty or service call | |
| `subs` | sub or vendor company | Contacts, vendor packet status, insurance and license dates, paperwork requests (vendor task) |
| `actuals` | actual-hours record | Feeds the "actual vs. estimate" averages |
| `training` | person + course (`<uid>__<course>`) | Quiz best, tries, passed, field task, sign-off, log (see TRAINING.md) |
| `classes` | live training class | Date, place, seats, sign-ups, attendance |
| `trmiles` | person + milestone (`<uid>__<key>`) | Milestones reached; `announced` is set by the milestone task |
| `office/private/customers` | customer (`C-####`) | Protected contact details |
| `office/private/custreq` | customer request | Field staff request a new or changed customer; an admin applies it |
| `office/private/team` | team member | Roles for each person (when the list is empty, anyone can pick any role) |
| `office/private/pay` | person | Pay rates (payroll access only) |
| `office/private/backupRuns`, `vendorRuns`, `trainingRuns` | run date | Reports written by the scheduled tasks |
| `office/private/trainingArchive/state` | (single doc) | Milestone task state: last run, people → Drive folders and docs, server export state |

## Backups

`BK_COLS()` lists what the app's **Backup and restore** (Price book tab) exports. The weekly backup task writes the same format to Drive. When you add a collection:
1. add it to `STORES`, `setStore`, `loadStores` and `BK_COLS`
2. add it to the restore map
3. add it to the weekly backup task's list (AUTOMATIONS.md)

## Numbering

- **Leads:** `YYMMDD-###`, with the count resetting on January 1.
- **Jobs:** `YY-CHANNEL-###`, with each channel counting separately and resetting on January 1.
- **Estimates:** `E-####`.
- **Customers:** `C-####`.
