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

## Jobs after signing

Jobs, the schedule, the time clock, daily logs, change orders (`coreqs`), orders, job costs, punch, warranty, closeout packets and invoices all hang off the job number. The Money tab rolls up revenue, cost and profit, and flags "Losing money" when job costs pass the price.
