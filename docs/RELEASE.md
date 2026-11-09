# Shipping a change

The same steps every time. Version numbers are the claude.ai artifact's version, for example "Version 85".

1. **Log the request.** Add a row on the Requests tab of the change-log sheet (R-###).
2. **Read the live app.** Use the Artifact tool's `read` on https://claude.ai/artifact/LkJyGVvG8Th8rEninCPy6N.
   - Confirm it matches `app.html` on `main`. Someone may have published from elsewhere.
   - Save that copy as a backup (`backup_live_<version>.html`).
3. **Branch.** `git checkout -b <short-name>` from an up-to-date `main`.
4. **Change `app.html` with exact replacements.** Write a small script where each replacement asserts how many times the old text occurs, and stop if it doesn't match. Don't reformat the file.
5. **Syntax check.** Extract the `<script>` and run `new Function(code)` on it.
6. **Test.** Run `npm test` and add or adjust tests for the change (TESTING.md).
7. **Publish to claude.ai.**
   - Artifact `publish` with `url` set to the app's URL.
   - Add a short `label` such as "Version 86: …".
   - **Don't pass `capabilities`**, so the stored declaration carries forward.
8. **Pull request and merge.**
   - Bump `version` in `package.json` to match.
   - Push and open a pull request. When the Tests check is green, merge it.
   - SiteGround deploys within a minute or two. Check `/api/health`.
9. **Log the change.** Add a row on the "Change log" tab: version, date, area, what changed, status, notes.
10. **Update the docs:**
    - the docs here, if behavior changed
    - the App Manual Claude Doc, if owner-facing
    - the course books, if training content changed
11. **Tell the owner** what changed, in plain words.

## Rolling back

- **claude.ai:** publish the backup file to the same URL. Every version is kept.
- **Server:** revert the merge commit on GitHub and merge. SiteGround redeploys, and the data folder is untouched.

## Don'ts

- Don't publish untested code to the live app.
- Don't change `office/private` rules or capabilities without the owner's OK.
- Don't edit or delete estimate E-1001 or migrated ProBooks records.
- Don't put credentials anywhere in the repo.
