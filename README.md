# QSGS Cost Database

Turns BOQs into a searchable rate database for Quantity Surveying Global Solutions.

- **Plan:** [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)
- **Design system:** [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)

## Structure

| Folder | What |
|---|---|
| `web/` | Next.js app — UI, sign-in, admin screens, database (Prisma + PostgreSQL) |
| `extractor/` | Python service (FastAPI) that reads BOQ PDFs and Excel files |
| `docs/` | Build plan and design system |
| `scripts/dev.mjs` | Starts everything locally with one command |

## First-time setup

Needs Node.js 22+ and Python 3.12+. No separate PostgreSQL install — a local one runs from `web/node_modules`.

```bash
npm --prefix web install
```

```bash
cp web/.env.example web/.env
```

Fill in `web/.env`: a `NEXTAUTH_SECRET`, an `EXTRACTOR_TOKEN`, and the first admin's `SEED_ADMIN_*` details.

```bash
python -m venv extractor/.venv
```

```bash
extractor/.venv/Scripts/python -m pip install -r extractor/requirements-dev.txt
```

(On macOS/Linux use `extractor/.venv/bin/python`.)

Then start everything once, and in a second terminal create the lists and first admin:

```bash
npm run dev
```

```bash
npm --prefix web run db:seed
```

## Daily use

```bash
npm run dev
```

- App: http://localhost:3100
- Extractor health: http://localhost:8100/health

The web app reloads on save. The extractor doesn't (uvicorn's auto-reload is unreliable on Windows and can keep serving old code) — after changing extractor code, stop `npm run dev` with Ctrl+C and start it again.

## Tests

```bash
npm test
```

Runs the web unit tests (Vitest) and the extractor tests (pytest). Also run before committing:

```bash
npm --prefix web run lint
```

```bash
npm --prefix web run typecheck
```

## Review and publish

Admins can open a completed upload's review screen, edit items and their hierarchy, resolve errors or accept source issues with a reason, and mark each item checked. PDF uploads include a source preview; Excel uploads provide the original workbook download and sheet navigation. Publishing requires all items checked and no unresolved errors. Published documents appear on their project and are read-only.

PostgreSQL transaction tests run when `TEST_DATABASE_URL` points to a local test database; they create and remove isolated fixtures. For the bundled local database in PowerShell:

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:54329/costdb'
npm --prefix web test
```

## Rate search

The home page searches only published BOQs. Search by description, project name or project number; filters cover projects, stages, location, building type, rate type, unit and both BOQ and project dates. Trade filters currently use the BOQ headings. Choose one unit to see comparable statistics. SAR, AED and QAR conversion uses the fixed USD pegs in the build plan without changing source values.

Open an item for its full description, source, sibling items and exact-description rate history. Use the + buttons to collect up to 500 rates across searches, then open Basket to export Excel. The basket is saved per user in the current browser tab. Original BOQs still in review must be checked and published before they appear here.

The search migration requires PostgreSQL's `pg_trgm` extension; deployment applies it through `prisma migrate deploy` with the other migrations.

## Confidential data

BOQ files and extraction outputs (`*.pdf`, `*.xlsx`, `*.csv`) and `.env` files are git-ignored. Never commit client BOQs or API keys.
