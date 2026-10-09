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

## Confidential data

BOQ files and extraction outputs (`*.pdf`, `*.xlsx`, `*.csv`) and `.env` files are git-ignored. Never commit client BOQs or API keys.
