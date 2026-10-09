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

The home page searches only published BOQs. Search by description, project name or project number; filters cover projects, stages, location, building type, rate type, unit and both BOQ and project dates. Trade filters use accepted AI trade tags, falling back to BOQ headings. Choose one unit to see comparable statistics. SAR, AED and QAR conversion uses the fixed USD pegs in the build plan without changing source values.

Open an item for its full description, source, sibling items and exact-description rate history. Use the + buttons to collect up to 500 rates across searches, then open Basket to export Excel. The basket is saved per user in the current browser tab. Original BOQs still in review must be checked and published before they appear here.

The search migration requires PostgreSQL's `pg_trgm` extension; deployment applies it through `prisma migrate deploy` with the other migrations.

## Confidential data

BOQ files and extraction outputs (`*.pdf`, `*.xlsx`, `*.csv`) and `.env` files are git-ignored. Never commit client BOQs or API keys.

## AI helper (Phase 5)

Open **Admin → AI helper** to add DeepSeek, Meta, OpenRouter or a custom public HTTPS OpenAI-compatible provider. Enter the API key only in that screen. New or changed keys, endpoints and models are tested with a tiny synthetic JSON request before enabling; failed configurations remain disabled for correction. Saved keys are masked, and neither raw nor encrypted keys appear in API responses. Remove key deletes the credential and disables the provider while keeping its usage history.

Set `AI_KEYS_ENCRYPTION_KEY` to the **same base64-encoded 32-byte secret in both web and extractor services**. Generate a secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`, store it in the services' environment variables, and keep a secure backup. Changing it makes previously encrypted provider keys unreadable; re-enter those provider keys after rotation. For local development, `npm run dev` forwards the value from `web/.env` to the extractor. Provider keys use AES-256-GCM with authenticated context; only the extractor decrypts them at request time. Apply the migration and update both services when deploying this phase to Railway.

AI starts disabled. Choose a default provider, then enable the helper. Each upload can use AI off, the default, or a specific provider. The upload screen shows the recipient and its data-policy note. Fallback to up to two other providers, ordered by the admin's priority, requires explicit opt-in. Uploads snapshot approved provider configurations; added or changed providers cannot silently receive existing uploads' text. The global switch stops further requests, including retries. Quantities, rates and amounts are excluded as fields from AI requests; descriptions, headings and shared main descriptions are sent as context. Review the selected provider's current client-data terms, especially Meta Contributor and routed/free models.

AI proposes item spelling fixes, trade tags and main-description links for uncertain items. It never writes numeric fields or automatically applies proposals. Original and proposed text stay in a separate history. Accept or reject all pending suggestions before marking their items checked; accepted suggestions clear the item's check. Publishing still requires a fresh admin review. Invalid JSON, unknown IDs, changed numeric tokens, unsupported fields and unsafe proposals are rejected. An unavailable provider, exhausted budget or interrupted AI run leaves the rule-based extraction available. AI processing is limited to eight minutes per upload; partial results are clearly labelled. An interrupted run becomes reviewable after ten minutes.

For an unfamiliar Excel layout, open **Unfamiliar Excel layout — review column mapping** in the upload form. Paste exact header labels, request an optional AI mapping, or choose columns manually with AI off. Check every source column and apply the reviewed mapping to re-read the file. Numeric cells are still handled by the existing parser. The first matching header row must be within the first 40 rows; description, quantity and unit must be mapped to distinct columns. Tender bidder columns remain Phase 6.

Set input/output USD prices per million tokens to the highest applicable price across your chosen task models. Zero means a verified free model. Costs are estimates, excluding taxes and provider-specific surcharges. Monthly UTC budgets serialize conservative reservations before each attempt, including connection tests. Unmetered/failed requests retain their reservation because the provider may have charged them. The dashboard shows an 80% warning, monthly totals across all attempts and the latest 200 requests by upload. Provider invoices are authoritative.

Provider presets were checked against the official [DeepSeek](https://api-docs.deepseek.com), [Meta](https://dev.meta.ai/docs/overview) and [OpenRouter](https://openrouter.ai/docs/quickstart) documentation. Model access, pricing and data policies can change; connection tests and explicit price entry are required. Local automated verification uses mocked provider responses and synthetic BOQs, without sending real client data to external AI providers. A live connection test requires an admin-entered provider key.
