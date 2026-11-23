# PromptWars 2026 — Hackathon Project

## Source of truth
Official context lives in `Competation context/` — read these instead of relying on this summary:
- `Competation context/Evaluation_criteria&guidelines.txt`
- `Competation context/Schedule.txt`
- `Competation context/Submission_instructions`
- `Competation context/Briefing (1).pdf` (slides 7–17 are images; key points below)
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
- Firebase/GCP project: `prompt-wars-5e5cd` (`gcloud` default and `.firebaserc` set). Billing enabled (free trial credit). APIs enabled: Cloud Run, Cloud Build, Artifact Registry, Secret Manager.
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

## Briefing (from `Briefing (1).pdf`)
- Scoring is **automatic, by AI** ("Live AI evaluation") across the six criteria. Slide wording: Code Quality "Readable, organized and maintainable code"; Security "Safe inputs, data handling and credentials"; Efficiency "Smart resource usage and lean dependencies"; Testing "Evidence that key features work correctly"; Accessibility "Usable UI, keyboard access and contrast"; Problem Alignment "Does the platform solve the actual challenge?"
- **Three links to submit:** (1) public GitHub repo, URL ending in `.git`, exactly one branch, < 10 MB; (2) live, publicly accessible deployment URL; (3) LinkedIn project post explaining what was built and how it solves the problem. Plus a brief project description.
- **2 attempts; the LATEST score counts, not the best.** First submission returns parameter-level feedback. Resubmit only if clearly stronger.
- Top 10 = leaderboard + working **Cloud Run** deployment. "Even if you are in Top 10 but if your project deployed link is not working you will be DQed."
- Sign in to the platform with the exact registration email.
