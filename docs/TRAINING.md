# Training (academies)

The course books are Claude Docs; the app holds the quizzes, field tasks, sign-offs, records and milestones.

| Academy | Constant | Courses | Course book |
|---|---|---|---|
| Project Manager Academy | `TRN_PM` | 17 (PM-101…116, PM-190) | https://claude.ai/artifact/3KT7gomfVNFtCpDFxrUWyo |
| Cabinet Academy | `TRN_CAB` | 17 (CAB-101…116, CAB-190) | https://claude.ai/artifact/9CLgrSQe6qKP8ZYNr8aZbD |
| Estimating Academy | `TRN_EST` | 18 (EST-101…117, EST-190) | https://claude.ai/artifact/4w5sjtvAX6TX8KoqmgWvWS |

`TRN` lists the academies. Entries with `soon: 1` (Office, Safety, Field) show as "being built".

## Course data

Each course is:

```js
{ c: "EST-107", t: "Margin, markup and A&H targets", h: 2,
  q: [{ s: 0|1 /* knowledge | scenario */, p: "question", o: ["a","b","c","d"], a: 2 /* index */, x: "explanation" }] }
```

Every course has exactly five questions. `tests/app-training.test.js` checks this.

## A course is completed when…

1. **Quiz passed** at 80% or more. Retakes are allowed; `best` and `tries` are kept.
2. **Field task** done and noted (`task: {note, at}`).
3. **Signed off** by a supervisor (`sign: {by, at}`). `trCanSign()` allows an admin, the owner, or the Senior or Office role. Nobody signs off their own course except the owner.

## Records

- **Storage.** Every attempt, task and sign-off is appended to `log` in `training/<uid>__<course>`. `trSave` also snapshots the person's name.
- **Status.** `trStat(r)` gives a course's status.
- **Levels.** `trLevels(uid)` gives the PM levels (PM-I, PM-II, PM-III). The Estimating levels (EST-I/II/III) are in the course book only.
- **Record screen and PDF.** `trRecHtml` and `trRecModel` produce the per-person record screen and its PDF.

## Milestones

- **Computing them.** `trMiles(uid)` works out milestones from sign-offs:
  - **PM:** first course, 5, PM-I, 10, PM-II, all 17
  - **Cabinet:** `cab1`, `cab9`, `caball`
  - **Estimating:** `est1`, `est9`, `estall`
- **Saving them.** `trMileSync` writes new ones to `trmiles` with `announced: false`. The daily milestone task then emails the executive team and marks them announced.

## Where people train

- **claude.ai app:** for people inside the organization.
- **Company server:** for field crews and anyone outside the organization. claude.ai only allows outside people to be Viewers or Commenters, who can't save. The server emails its training records to the office every afternoon, and the milestone task reads that email (SERVER.md, AUTOMATIONS.md).

## Adding an academy

Follow the Cabinet (`patch58`) and Estimating (`patch59`) changes:
1. Add `TRN_X` and its entry in `TRN`.
2. Add a records card in `trRecModel`.
3. Add milestones in `trMiles`, and their done/of/academy mapping in `trMileSync`.
4. Update the milestone task prompt (course list and milestones).
5. Add the academy to `tests/app-training.test.js`.
