# LabLink

**Fair, explainable sharing of campus lab equipment, with AI that understands students and rules that decide.**

[![CI](https://github.com/Puneeth-RV/lablink/actions/workflows/ci.yml/badge.svg)](https://github.com/Puneeth-RV/lablink/actions/workflows/ci.yml)

> **Live demo:** moving to Render, link coming soon. You can [deploy your own](#deploy) in a few minutes.

Most colleges have expensive lab equipment, such as oscilloscopes, FPGA boards, GPU workstations and 3D printers, spread across departments. Students in one department rarely know what another department has. When something is in demand, whoever books first gets it, even if someone else's deadline is tomorrow. Approvals, safety training and clashes are usually handled over email.

LabLink is a web app that fixes that. Students find equipment by describing what they need, plan a whole project's lab time from a few sentences, and book slots that are checked against real rules. When several students want the same machine, LabLink ranks them with a transparent score and offers everyone else an alternative. Faculty get pre-reviewed approval requests, one-click conflict resolution and utilisation insights.

## Features

**For students**

- **Find equipment in plain English.** Type "debug I2C signals on my sensor board" and get matching equipment from every department, each with a reason.
- **Plan my project.** Describe the project and its deadline in your own words ("due next Friday"). LabLink extracts the deadline and the equipment you need, then proposes the earliest feasible slots. Book them all in one click.
- **Smart booking.** Every booking is checked against lab hours, safety training, faculty approval, the project deadline and a weekly fair-use cap. If a slot can't be booked, you get the reason and concrete alternatives instead of a dead end.
- **Fair queue for high-demand equipment.** Instead of first-come-first-served, competing requests are allocated fairly (see [How allocation works](#how-allocation-works)).
- **Practical extras.** Check in when you arrive (no-shows are released after 15 minutes), add bookings to your calendar with a reminder, and report faulty equipment.

**For faculty**

- **Approvals with a pre-review** that flags risks such as missing safety training or deadline pressure.
- **One-click conflict resolution.** Competing requests are shown ranked with their score breakdown, and a plain-language explanation is generated.
- **Fault management.** Take reported equipment offline and bring it back once fixed.
- **Utilisation insights.** See which equipment is overbooked and which sits idle, for example "Scope A is 80% booked while Scope B is 3%, so redirect requests".

**Everywhere:** light and dark themes, real equipment photos, keyboard and screen-reader support, and navigation badges for anything that needs attention.

## How allocation works

The core design principle: **AI understands, rules decide.** Gemini reads what people type and explains outcomes, but who gets a machine is decided by deterministic, tested code. That keeps allocation fair, reproducible and auditable, and it still works if the AI is slow or unavailable.

1. **Hard rules first** (`src/server/domain/policy.ts`): within lab hours, not in the past, before the project deadline, equipment in service, the student owns the project, required training done, approval granted where needed, and within the weekly 12-hour cap.
2. **A transparent priority score** (`src/server/domain/allocation.ts`), where each factor is 0–1 and shown to users:

   | Factor           | Weight | Meaning                                                      |
   | ---------------- | ------ | ------------------------------------------------------------ |
   | Deadline urgency | 40%    | the closer the project deadline, the higher                  |
   | Fair share       | 25%    | the less lab time used this week, the higher                 |
   | Requirement fit  | 20%    | essential equipment for the project ranks above nice-to-have |
   | Waiting time     | 15%    | the longer the request has waited, the higher                |

   Ties break by request time, then id, so the result never depends on input order.

3. **Grant in rank order, with alternatives for everyone else:** the nearest free slots on the same equipment before their deadline, or equivalent equipment in another department.
4. **Explain:** Gemini writes a short, neutral explanation from the score breakdown. A templated explanation is used if the AI is unavailable.

### Where Gemini is used

- Natural-language equipment discovery
- Extracting a project's title, deadline and equipment needs from free text
- Pre-reviewing access requests for faculty
- Explaining allocation decisions

Every call uses structured JSON output validated with zod, is filtered to equipment that actually exists (so it can't recommend made-up items), has an 8-second timeout and a 10-minute cache, and falls back to a rule-based assistant. User text is delimited in prompts so it can't override the instructions.

## Architecture

![LabLink architecture: students and faculty use a React web app over HTTPS; it calls an Express API that contains the API layer, allocation engine, project planner and policy rules; the API uses Gemini for discovery, planning and explanations, Firebase Firestore for bookings, requests and approvals, and Secret Manager for API keys.](docs/architecture.jpg)

```
src/server/  routes/ (HTTP) → services/ (orchestration, AI, auth, persistence) → domain/ (pure rules)
src/client/  pages/ · components/ · lib/ (typed API client, hooks, formatting, calendar export)
tests/       server/ (domain, API, AI, persistence, features) · client/ (components, pages, axe)
```

**Tech stack:** React and TypeScript (Vite), Node and Express 5, Gemini via the Google GenAI SDK (`gemini-flash-lite-latest`), Firebase Firestore (optional), and Docker. It runs on any container host: Render, Google Cloud Run, Fly.io and so on.

**Storage:** the app serves reads from an in-memory working set and, when Firestore is enabled, writes every change through to it, so data survives restarts. Without Firestore it runs entirely in memory with seeded demo data.

## Engineering notes

- **Security:**
  - Strict Content-Security-Policy and security headers (Helmet).
  - zod validation and length limits on every input.
  - HMAC-signed, expiring session tokens.
  - Role-based access, with faculty limited to their own department.
  - Per-IP rate limits, stricter on AI endpoints.
  - An error handler that never leaks internals.
  - A non-root container.
- **Testing:** 93 Vitest tests at about 90% line coverage. They cover the pure domain rules, API integration (auth, permissions, validation, booking flows), AI fallbacks with a mocked model, persistence, and every UI page with automated axe-core accessibility checks. CI runs the format check, lint, type check, tests, build and dependency audit on every push.
- **Accessibility:** semantic landmarks, a skip link, labelled inputs, live regions for async results, status always shown as text (never colour alone), visible focus, AA contrast in both themes, and reduced-motion support. Lighthouse scores 100 on accessibility.
- **Performance:** about 80 kB of gzipped JavaScript, code-split faculty pages, immutable asset caching, compression, lazily loaded SDKs, debounced search, bounded memory, and photos of about 40 KB each.

## Getting started

```bash
npm install
cp .env.example .env        # GEMINI_API_KEY is optional; without it a rule-based fallback is used
npm run dev                 # API on :8080, client on :5173
npm test                    # run all tests
npm run lint && npm run typecheck && npm run format:check
npm run build && npm start  # production build on :8080
```

**Demo accounts:** there's no login. A **"Viewing as"** selector in the header switches between demo students and faculty, and stands in for campus single sign-on. The API still uses signed session tokens and role checks on every request. A real deployment would plug in Firebase Authentication or campus SSO.

**Try it:**

1. As **Asha**, describe a need on _Find equipment_.
2. Open _Plan my project_ and describe a project with a deadline.
3. Switch to **Dr. Lakshmi Iyer** and look at _Approvals_ and _Conflicts_. Click **Apply fair allocation**.

## Deploy

**Render (free):** the repo includes a `render.yaml`. In Render, choose **New → Blueprint**, select this repo, and paste your `GEMINI_API_KEY` when prompted. Render builds the Dockerfile, generates `SESSION_SECRET`, and runs the app with in-memory demo data. Free instances sleep after 15 minutes of inactivity, so the first request after that takes a little longer.

**Google Cloud Run (with Firestore):**

```bash
gcloud run deploy lablink --source . --region asia-south1 --allow-unauthenticated \
  --max-instances=1 --memory=512Mi \
  --set-env-vars=PERSISTENCE=firestore,GOOGLE_CLOUD_PROJECT=<project-id> \
  --set-secrets=SESSION_SECRET=session-secret:latest,GEMINI_API_KEY=gemini-api-key:latest
```

## Limitations and next steps

- Demo personas instead of real authentication: Firebase Auth or SSO is the next step.
- Runs as a single instance, so the in-memory working set stays consistent. Scaling out would need reads through Firestore with transactions.
- Seeded demo data. A real campus would import its own equipment list and lab rules (hours, caps and weights are single constants in `src/server/domain/`).
- Notifications by email or WhatsApp for approvals and allocations.

## Background

I built LabLink in about five hours at **PromptWars 2026** (Hack2skill × Cynergy Coding Club), a one-day AI-assisted build challenge, where it finished in the top 12 of 336 on the automated evaluation. I've since cleaned it up as a personal project.

## Credits

Equipment photos are from Wikimedia Commons under free licences; see [`CREDITS.md`](CREDITS.md).
