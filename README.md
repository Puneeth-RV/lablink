# LabLink — Making College Laboratories More Accessible

**Live app:** https://lablink-756211397575.asia-south1.run.app

LabLink is a GenAI-powered campus laboratory resource-sharing platform. Students discover specialised equipment across departments, book slots, request project-based access and get faculty approvals. When several students want the same high-demand equipment at the same time, LabLink **resolves the conflict fairly and transparently** using project deadlines, recent usage, requirement fit and waiting time — and offers everyone else feasible alternatives.

## Chosen vertical

**Campus laboratory resource sharing** (problem statement: *LabLink — Making College Laboratories More Accessible*). Personas: **students** who need equipment for projects, and **faculty** who approve access and oversee their department's equipment.

## How it works

| Need in the problem statement | How LabLink solves it |
|---|---|
| Equipment discovery | Catalogue across 4 departments with search and filters, plus **natural-language discovery**: describe your project need and Gemini recommends matching equipment with a reason for each. |
| Intelligent slot booking | Every booking is checked against hard rules (lab hours, max slot length, training, approval, deadline, weekly fair-use cap). Normal equipment books instantly; clashes return **409 with alternatives** instead of a dead end. |
| Project-based access requests | Approval-gated equipment needs a request tied to a project. Each request gets an **AI pre-review** (summary and risk flags such as missing training or deadline pressure) for faculty. |
| Faculty approvals | Faculty see only requests for equipment owned by their department, with approve/reject and an optional note. |
| Optimising resource utilisation | Utilisation insights by department, equipment and hour, with recommendations such as *"Scope A is 89% booked while equivalent Scope C is 0% — redirect new requests there"*. |
| Fair and feasible conflict resolution | High-demand equipment uses a **fair queue** instead of first-come-first-served. The allocation engine ranks competing requests, grants the slot and gives everyone else ranked alternatives. Gemini explains each decision in plain language. |

### Approach and logic: deterministic decisions, AI understanding

The core design principle is that **decisions are deterministic, tested and auditable, while Gemini understands and explains.** Allocation never depends on an LLM. That makes it fair, reproducible and testable, and the app keeps working if the AI is slow or unavailable.

**Allocation engine** (`src/server/domain/allocation.ts`):

1. **Feasibility filter (hard rules)** — `domain/policy.ts`: inside lab hours (09:00–18:00 IST, whole hours), not in the past, ends before the project deadline, equipment not under maintenance, student owns the project, required safety training done, faculty approval granted if required, and the weekly fair-use cap (12 h) is not exceeded.
2. **Priority score** (each factor 0–1, shown to users as a breakdown):
   - **Deadline urgency – 40%**: `1 − daysToDeadline / 30`
   - **Fair share – 25%**: `1 − hoursUsedLast7Days / 12`, so heavy users don't monopolise equipment
   - **Requirement fit – 20%**: 1 if the equipment category is *essential* to the project, 0.4 if nice-to-have
   - **Waiting time – 15%**: `hoursWaiting / 48`
   - Ties are broken by request time, then id, so the result is fully deterministic regardless of input order.
3. **Grant in rank order** while the slot is still free. Every other request gets **alternatives**: the nearest free slots on the same equipment before its deadline, then *equivalent equipment* (same category) in other departments at the requested time, filtered by the student's training.
4. **Explain**: Gemini turns the score breakdown into a short, neutral explanation for students and faculty. A templated explanation is used if Gemini is unavailable.

**Where Gemini is used** (`src/server/services/ai.ts`):
- Natural-language equipment discovery (structured JSON output, ranked IDs and reasons)
- Access-request pre-review for faculty (summary and risk flags)
- Allocation explanations

Every call uses a JSON schema for structured output, is validated with zod, filtered to known equipment IDs (no hallucinated items), wrapped in an 8 s timeout, cached for 10 min, and falls back to a deterministic rule-based assistant. Untrusted user text is placed inside `<user_input>` delimiters, and the system instruction tells the model never to follow instructions found there.

## Architecture

```
React + Vite SPA  ──►  Express 5 API (single Cloud Run service)
                         ├─ routes/      thin HTTP layer: zod validation, auth, RBAC, rate limits
                         ├─ services/    LabService (orchestration), Gemini assistant, token auth, store
                         └─ domain/      pure, side-effect-free business rules (time, policy, allocation, utilisation)
```

- **Google Cloud Run**: one container serves both the API and the static client (multi-stage `node:22-alpine` image, runs as a non-root user, scales to zero).
- **Gemini (Google GenAI SDK)**: discovery, reviews and explanations.
- **Secret Manager**: the session-signing secret (and the Gemini key) are injected at runtime, never stored in code or the image.
- **Cloud Build**: builds the image from source on deploy.

## How each evaluation criterion is addressed

- **Code quality**: strict TypeScript across client and server; pure domain layer separated from I/O; dependency injection (`createApp(deps)`) so everything is testable; shared domain types between client and server; ESLint (typescript-eslint, jsx-a11y strict, react-hooks).
- **Security**:
  - Helmet with a strict Content-Security-Policy (`default-src 'self'`, no inline scripts or styles), HSTS and `frame-ancestors 'none'`.
  - zod validation with length caps on every input; JSON body limit of 10 kb.
  - HMAC-SHA256 signed, expiring session tokens with a constant-time signature check.
  - Role-based access control, plus department scoping for faculty.
  - Per-IP rate limits, stricter on AI endpoints.
  - A central error handler that never leaks stack traces.
  - Prompt-injection hardening and secrets held in Secret Manager.
  - Non-root container; `npm audit` reports 0 vulnerabilities.
- **Efficiency**:
  - 6 runtime dependencies; the Gemini SDK is lazily imported.
  - The client is about 76 kB gzipped, and faculty-only pages are code-split.
  - Hashed assets are served with `immutable` 1-year caching; responses are gzip-compressed.
  - AI responses are cached with a TTL; catalogue search is debounced.
  - Data lookups are O(1), indexed by id; alternative slots are generated lazily.
  - The Cloud Run service scales to zero.
- **Testing**: 59 Vitest tests:
  - Domain unit tests: time, policy, scoring, deterministic allocation, alternatives, conflict grouping, utilisation.
  - API integration tests with supertest: auth, RBAC, validation, 409/422 flows, the approval workflow, conflict resolution, analytics.
  - AI service tests with a mocked model: caching, timeout, invalid JSON and API-error fallbacks, prompt delimiting, hallucination filtering.
  - Client tests with Testing Library, including **automated axe-core accessibility checks** and keyboard interaction.
- **Accessibility**:
  - Semantic landmarks and a skip link; focus moves to the page heading on navigation.
  - Every input is labelled, and errors are linked with `aria-describedby`.
  - `role="alert"` and `role="status"` live regions announce async and AI results.
  - Availability is shown as a real table with text status, not colour alone; scores and utilisation use labelled `<meter>` elements with text values.
  - Visible focus rings, AA-contrast colours, 44 px touch targets, and `prefers-reduced-motion` support.
- **Problem alignment**: every requirement in the problem statement maps to a feature (see the table above), with fair conflict resolution as the centrepiece.

## Assumptions

- **Authentication**: demo personas stand in for campus single sign-on. Tokens are real HMAC-signed sessions, but there is no password step.
- **Data**: data is in memory and seeded at startup relative to the current date, so the demo always looks current. Cloud Run runs a single instance (`--max-instances=1`) so state stays consistent. The `Store` class is the seam for a persistent database such as Firestore.
- **Time**: slots are whole hours between 09:00 and 18:00 campus time (IST). The weekly fair-use cap is 12 hours per student.
- **Faculty scope**: faculty approve requests and resolve conflicts for equipment owned by their own department.
- **High-demand equipment**: flagged per item and allocated through the fair queue. Other equipment is booked instantly.

## Run locally

```bash
npm install
cp .env.example .env        # add GEMINI_API_KEY (optional — falls back to rules) and SESSION_SECRET
npm run dev                 # API on :8080, client on :5173
npm test                    # all tests
npm run lint && npm run typecheck
npm run build && npm start  # production build on :8080
```

## Deploy (Google Cloud Run)

```bash
gcloud run deploy lablink --source . --region asia-south1 --allow-unauthenticated \
  --max-instances=1 --memory=512Mi \
  --set-secrets=SESSION_SECRET=session-secret:latest,GEMINI_API_KEY=gemini-api-key:latest
```

## Demo walkthrough

1. Sign in as **Asha (student)**. Under *Find equipment*, type *"debug I2C signals on my soil sensor"* to get AI recommendations. Open the Keysight oscilloscope and request a slot: it joins the fair queue.
2. Try booking the 3D printer as Asha: you get a clear *training required* message plus alternatives.
3. Sign in as **Dr. Iyer (faculty, ECE)**:
   - *Approvals*: see the AI pre-review and approve Asha's FPGA request.
   - *Conflicts*: see three students competing for the same oscilloscope slot, each with a transparent score breakdown. Click **Apply fair allocation** to commit it and get an explanation.
   - *Insights*: see the over-used scope and the recommendation to redirect demand to an idle equivalent.
