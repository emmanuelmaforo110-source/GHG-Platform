# GHG Emission Tracking Platform — Backend (MVP Scaffold)

This is a working-code scaffold implementing Phases 0–4 of the roadmap in
`GHG_Platform_Architecture.md`: multi-tenant schema, auth/RBAC, emission-factor management,
activity-data entry with the calculation engine, and audit logging. It does **not** yet include
the frontend (Phase 5 dashboard UI) or a deployment pipeline (Phase 7) — see "What's next" below.

**Honest disclaimer:** this code was hand-written against NestJS/Prisma's documented APIs, not
compiled or run in a live environment (the sandbox it was written in has no network access to
install packages or run Postgres). Treat it as a strong, structurally-correct starting point —
budget time for the inevitable small fixes (a typo, a version mismatch) on first install.

---

## Phase 0 (stabilise) — what changed

These changes are on the Git branch `phase-0-stabilise`, for review before merging into `main`.

| Area | Change |
| --- | --- |
| Deleting entries | Deleting a Scope 1/2 entry now also deletes its automatic WTT / T&D entry (previously it stayed and kept counting). Entries in submitted, approved or locked periods can no longer be deleted. Automatic entries can't be deleted or edited directly. |
| Editing entries | New `PATCH /api/activity-data/:id` and **Edit** / **Delete** buttons on the Activity data page. Emissions and automatic entries are recalculated; the audit log stores old and new values. |
| Units | Quantities are converted to the emission factor's unit before calculating (e.g. MWh → kWh, US/imperial gallons → litres, tonnes → kg, miles → km, GJ → kWh). Units that don't fit the factor (e.g. litres for electricity) are rejected with a clear message instead of giving a wrong number. See `backend/src/activity-data/units.ts`. |
| Emission factor matching | Exact name match first; if several factors could apply, the API asks the user to choose instead of guessing. The prior-year fallback no longer looks at other organisations' private factors. A factor chosen by id must be a global default or the user's own organisation's. The grid-loss (T&D) row now uses the exact grid factor of its Scope 2 entry. |
| Automatic rows in the database | New migration `20260925130000_phase0_derived_rows`: removes orphaned/duplicate automatic rows, deletes automatic rows together with their source (`ON DELETE CASCADE`), and allows only one automatic row per source + category. |
| Sessions | New `GET /api/auth/me` returns the signed-in user's current record; the web app now confirms the session with it on page load, so role changes and deactivations apply without re-login. |
| Tests | 33 unit tests, including an in-memory run of every line of the reference workbook `Pemandu_GHG_Inventory_Calculator.xlsx`: Scope 1 = 9.61 t, Scope 2 = 6.12 t, Scope 3 = 12.3816 t (air 0.9, hotels 0.3, ground transport 0.136, commuting 7.5072, waste 0.108, WTT + T&D 3.4304), grand total = 28.1116 t. Run with `npm test` in `backend/`. |
| CI | `.github/workflows/ci.yml` (repository root): on every push, builds and tests the backend, applies all migrations to a fresh PostgreSQL and seeds it, and builds the frontend. |
| Build / deploy | `backend/tsconfig.build.json` fixes `npm run start:prod` (the build previously went to `dist/src/`). New `Dockerfile`s for backend and frontend; `docker compose --profile app up -d --build` now runs the whole system (database, API on :4000, web app on :3000). |
| Setup fix | `backend/.env.example` now points at port 15432, matching `docker-compose.yml`. |

### Trying Phase 0 on your computer

1. Start Docker Desktop, then in a terminal in the `ghg-platform` folder run `docker compose up -d`.
2. In `ghg-platform/backend`: `npm install`, then `npx prisma migrate deploy` (applies the new migration), then `npx prisma generate`, then `npm test` — you should see all tests pass.
3. Start the API with `npm run start:dev`, and in `ghg-platform/frontend` start the web app with `npm run dev`.
4. Open http://localhost:3000, sign in, go to **Activity data**, and try:
   - Enter 18 **MWh** of electricity — the result should be 6,120 kg CO2e (the same as 18,000 kWh).
   - Enter 100 **litres** against the electricity factor — you should get a clear error.
   - Click **Edit** on a diesel entry and change the quantity — the "WTT — Diesel" automatic row updates too.
   - Click **Delete** on that diesel entry — its automatic row disappears as well.

Note: the Dockerfiles and CI workflow were written without being able to run Docker or GitHub Actions in the environment where they were prepared; the first CI run on GitHub is their real test.

---

## 1. Prerequisites

- Node.js 20+ and npm
- Docker + Docker Compose (for local Postgres, Redis, and MinIO — no manual installs needed)

## 2. First-time setup

```bash
# From the repo root (where docker-compose.yml lives)
docker compose up -d

# Confirm Postgres is healthy before continuing
docker compose ps
```

```bash
cd backend
npm install

cp .env.example .env
# Open .env and set a real JWT_SECRET, e.g.:
#   openssl rand -hex 32
```

### Create the MinIO bucket (one-time)

The Docker Compose file starts MinIO but doesn't pre-create a bucket. Either:

- Open the MinIO console at **http://localhost:9001** (login: `ghg_minio_admin` /
  `ghg_minio_dev_password` — from docker-compose.yml) and create a bucket named `ghg-attachments`, or
- Use the `mc` CLI if you have it installed:
  ```bash
  mc alias set local http://localhost:9000 ghg_minio_admin ghg_minio_dev_password
  mc mb local/ghg-attachments
  mc anonymous set download local/ghg-attachments   # only if you want public read via S3_PUBLIC_URL_BASE
  ```

### Run migrations and seed data

```bash
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
```

If the seed script completes, you'll see:
```
Seeded 19 GHG categories.
Seeded 17 emission factors for 2026 (global defaults).
Seeded demo organization "Pemandu Associates (Demo)" with facility and admin user.
  Login: [email protected] / ChangeMe123!
```

### Run the API

```bash
npm run start:dev
```

The API listens on `http://localhost:4000/api`. Test it:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"[email protected]","password":"ChangeMe123!"}'
```

You should get back an `accessToken` — use it as a `Bearer` token on every other request, e.g.:

```bash
TOKEN="paste the accessToken here"

curl http://localhost:4000/api/facilities \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:4000/api/emission-factors \
  -H "Authorization: Bearer $TOKEN"
```

### Create a reporting period, then enter activity data

```bash
# 1. Create the 2026 reporting period (becomes the base year automatically, since it's the first one)
curl -X POST http://localhost:4000/api/reporting-periods \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"year": 2026, "staffFte": 12}'
# -> copy the returned "id" as REPORTING_PERIOD_ID

# 2. Look up the Dar es Salaam facility id and the "Stationary Combustion" category id
curl http://localhost:4000/api/facilities -H "Authorization: Bearer $TOKEN"
curl http://localhost:4000/api/emission-factors -H "Authorization: Bearer $TOKEN"

# 3. Enter the Scope 1 generator diesel line from the reference workbook (1000 litres)
curl -X POST http://localhost:4000/api/activity-data \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "facilityId": "<facility id>",
    "reportingPeriodId": "<reporting period id>",
    "categoryId": <stationary combustion category id>,
    "sourceName": "Backup generator",
    "fuelOrMaterialType": "Diesel",
    "quantity": 1000,
    "unit": "litres"
  }'
```

The response should show `emissionsKgco2e: 2680` (1000 × 2.68 — matches
`calculation-engine.service.spec.ts`). Check the dashboard:

```bash
curl http://localhost:4000/api/dashboard/summary/<reporting period id> \
  -H "Authorization: Bearer $TOKEN"
```

### Run the tests

```bash
npm test
```

This runs the pure-function unit tests in `calculation-engine.service.spec.ts` that check the
engine's output against the known line items from `Pemandu_GHG_Inventory_Calculator.xlsx`. The
full-inventory integration test is stubbed with `.skip`/`.todo` — wire it up once you're ready to
run tests against a seeded test database (see the comment in that file for what it should assert).

---

## 3. Project structure

```
backend/
  prisma/
    schema.prisma       # full data model — see architecture doc Section 2
    seed.ts              # reference data + your workbook's emission factors + demo org
  src/
    auth/                 # login, JWT strategy
    common/                 # RBAC guards, decorators, audit-log interceptor — the enforcement layer
    organizations/           # tenant self-service settings
    users/                     # Admin manages org's users
    facilities/                 # Admin manages sites
    reporting-periods/           # draft -> submitted -> approved -> locked workflow
    emission-factors/              # Admin reviews/overrides factors (Section 2.0 point 2)
    activity-data/                  # THE CORE MODULE — see below
      calculation-engine.service.ts    # factor resolution, snapshotting, derived rows, recalculation check
      calculation-engine.service.spec.ts # regression tests against the reference workbook
    attachments/                      # audit-evidence file upload (S3/MinIO)
    dashboard/                          # aggregation queries for Section 5 reporting views
    audit-logs/                           # Admin-only read endpoint

frontend/
  app/
    login/page.tsx                # public route
    (app)/layout.tsx               # auth gate + sidebar, wraps every protected page
    (app)/dashboard/page.tsx         # Section 5 dashboard: metric cards, YoY chart, share donut, Scope 3 completeness
    (app)/activity-data/page.tsx       # THE MAIN SCREEN — Scope 1/2/3 entry form + file upload + entries list
    (app)/admin/reporting-periods/       # draft -> submit -> approve workflow, recalculation-threshold warning
    (app)/admin/emission-factors/          # view defaults, create org-specific "reviewed" overrides
    (app)/admin/facilities/                  # simple CRUD
    (app)/admin/users/                         # invite users, assign role + optional facility restriction
    (app)/admin/audit-logs/                      # read-only, Admin only
  lib/
    api.ts                # fetch wrapper: attaches JWT, redirects to /login on 401
    auth-context.tsx        # React context: login/logout/hasRole, session restored from decoded JWT
    types.ts                  # mirrors the backend's Prisma models and DTOs
  components/
    Sidebar.tsx            # role-scoped nav — mirrors the Section 4 RBAC table
    RoleGate.tsx              # hides UI a role can't use — UX only, NOT the security boundary
    MetricCard.tsx
```

## 4. Running the frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # points at http://localhost:4000/api by default
npm run dev
```

Open `http://localhost:3000` — it redirects to `/login`. Sign in with the seeded demo admin
([email protected] / ChangeMe123!), then:

1. Go to **Admin → Reporting periods** and create the 2026 period (becomes base year automatically).
2. Go to **Admin → Facilities** — the seed script already created "Dar es Salaam Office".
3. Go to **Activity data**, select that facility and period, pick "Stationary Combustion", enter
   1000 litres of Diesel — the emissions figure should read 2,680 kg CO2e, matching the backend
   regression test.
4. Go to **Dashboard** to see it charted.

A Data Entry or Management user will see a different sidebar — try inviting one from
**Admin → Users** and logging in as them (in an incognito window, since sessions are stored in
`localStorage`) to see the RBAC table from the architecture doc enforced in the UI.

**Honest disclaimer, same as the backend:** written by hand against Next.js 14 App Router and
Recharts' documented APIs, not compiled or run in this sandbox (no network access). Expect a small
number of first-run fixes — most likely an import path or a Recharts prop name — rather than a
flawless `npm run dev` on the very first try.

## 5. What's next (not yet built)

1. ~~**No "who am I" endpoint**~~ — done in Phase 0 (`GET /auth/me`).
2. **No dedicated categories endpoint** — the activity-data form currently derives the category
   list from `/emission-factors` (see the comment in that page). Small addition:
   `GET /ghg-categories` on the backend, matching the `facilities`/`reporting-periods` pattern.
3. **Scope3RelevanceScreen has no write UI yet** — same gap noted below for the backend; the
   dashboard's completeness panel is read-only until that endpoint and a small admin form exist.
4. **Attachments aren't listed/downloadable in the UI yet** — upload works end-to-end, but there's
   no screen to browse previously uploaded evidence per activity row.

## 6. What's next on the backend (not yet built)

1. **Frontend** — no UI exists yet. Recommended: Next.js + TypeScript + Tailwind, calling this
   API. Priority screens: login, activity-data entry form (Scope 1/2/3), Admin emission-factor
   review screen, and the dashboard (Section 5 of the architecture doc maps directly to chart
   components — Recharts is a good fit for the stacked bar/pie/YoY views).
2. **Scope3RelevanceScreen endpoints** — the schema and dashboard read-side
   (`GET /dashboard/scope3-completeness/:id`) exist, but there's no write endpoint yet for an
   Admin/Data Entry user to record the relevance assessment for excluded categories. Small
   addition, same CRUD pattern as `facilities`.
3. **PDF/CSV export** — Section 5.6 of the architecture doc. Add a background job (BullMQ, using
   the `REDIS_URL` already wired in `.env.example`) that renders the dashboard summary to PDF via
   Puppeteer, and a simple CSV export of `activity_data` for the current period.
4. **Postgres Row-Level Security policies** — the app-layer tenant scoping
   (`organizationId` from the JWT on every query) is in place, but the defense-in-depth RLS
   policies described in architecture doc Section 4 aren't written yet. Add as a Prisma
   migration once the schema stabilizes.
5. **Multi-organization-per-email login** — flagged directly in `auth.service.ts`: the current
   login looks up a user by email only, which breaks if the same person belongs to multiple
   tenants. Fine for the pilot (Phase 6), needs revisiting before wider rollout.
6. **CI + deployment** — CI and Dockerfiles added in Phase 0; a hosted staging server (e.g. Render/Railway)
   is still to be set up.
