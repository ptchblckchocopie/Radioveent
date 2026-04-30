Safely push local changes to the remote, handling any remote changes first.

## Steps

1. **Check for uncommitted changes:**
   Run `git status`. If there are uncommitted changes, stage and commit them with a descriptive message before proceeding.

2. **Fetch remote:**
   Run `git fetch origin` to see if the remote branch has new commits.

3. **Check if behind:**
   Run `git status` again after fetch. If the local branch is behind the remote (i.e. "Your branch is behind"), proceed to step 4. If up to date, skip to step 6.

4. **Pull with rebase:**
   Run `git pull --rebase origin main` to replay local commits on top of remote changes. This avoids unnecessary merge commits.

5. **Handle merge conflicts (if any):**
   - If the rebase reports conflicts, list the conflicting files with `git diff --name-only --diff-filter=U`.
   - Read each conflicting file and resolve the conflicts intelligently — keep both sides where possible, prefer local changes for new features, prefer remote for fixes.
   - After resolving each file, run `git add <file>`.
   - Then run `git rebase --continue`.
   - If there are multiple conflict rounds, repeat until the rebase completes.
   - Report which files had conflicts and how they were resolved.

6. **Push:**
   Run `git push origin main`.

7. **Report:**
   Show the user the result — confirm the push succeeded, show the commit hash, and mention any conflicts that were resolved.

## Important
- Never use `--force` push unless explicitly asked.
- Never skip pre-commit hooks (`--no-verify`).
- If the rebase gets too messy, abort with `git rebase --abort` and ask the user what to do.
- Always show the user what happened clearly.
