# PromptWars 2026 — Hackathon Project

## Source of truth
Official context lives in `Competation context/` — read these instead of relying on this summary:
- `Competation context/Evaluation_criteria&guidelines.txt`
- `Competation context/Schedule.txt`
- `Competation context/Submission_instructions`
- Problem statement: pasted in chat after release (save it to `Competation context/Problem_statement.txt`).

All design decisions (features, stack, scope, timeline) are made only after the problem statement is read. Do not assume them beforehand.

## Evaluation criteria (verbatim from the official file)
1. Code Quality – Structure, readability, and maintainability.
2. Security – Secure and reliable implementation.
3. Efficiency – Performance and resource optimization.
4. Testing – Functionality and reliability.
5. Accessibility – Usability and inclusiveness.
6. Problem Statement Alignment – How effectively your solution addresses the given challenge.

Google technologies (Firebase, Google Cloud, Gemini, Google AI Studio) are encouraged; per the guidelines, "simply using a particular service does not guarantee additional marks" — use them only where relevant.

## Schedule (verbatim, 23.11.2026)
- 12.00 PM — Problem statement release
- 12.05 PM — Hackathon begins
- 05.00 PM — Hackathon concludes and top 10 leaderboard
- 05.30 PM — Top 10 pitching in front of jury

## Environment (already set up)
- CLIs installed and logged in: `gh`, `gcloud`, `firebase` (account matches AI Studio).
- Firebase/GCP project: `prompt-wars-5e5cd` (`gcloud` default and `.firebaserc` set). Billing not confirmed — check before relying on paid-tier services.
- `.env` contains `GEMINI_API_KEY`. Never print, log, or commit it; `.gitignore` covers `.env*`.
- Claude in Chrome is connected (screenshots are token-heavy; prefer CLI checks where possible).

## Working rules
- Keep responses and diffs concise; avoid re-reading files unnecessarily.

## Git workflow
- Solo build: work directly on `main`; no feature branches or PRs.
- Claude commits at each working milestone without asking — small, focused commits; push regularly so the repo is always submittable.
- Message prefixes: `feat:`, `fix:`, `test:`, `docs:`, `a11y:`, `refactor:`, `chore:`.
- No Co-Authored-By or AI attribution lines in commits.
- Never commit secrets — check `git status` before committing; `.env*` stays ignored.

## Submission rules (from `Submission_instructions` — violating these may mean no evaluation)
- Maximum 2 submission attempts.
- Repo must be **public**, **< 10 MB**, and have **only one branch** (`main`). Never commit `node_modules`, build output, or large assets.
- Expected: "a smart, dynamic assistant" with "logical decision making based on user context", "practical and real-world usability", "clean and maintainable code".
- Must choose one of the provided challenge verticals and design around that persona and logic.
- README must explain: chosen vertical, approach and logic, how the solution works, assumptions made.
- Scoring is tiered High / Medium / Low impact (which criteria fall in which tier is not specified).
