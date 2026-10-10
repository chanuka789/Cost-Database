# QSGS Cost Database — Build Plan

**Owner:** Quantity Surveying Global Solutions (QSGS)
**Version:** 1.0 — 9 October 2026
**Status:** Phases 0–5 implemented locally. Next: Phase 6 — Tender returns (sample needed). Live AI credential verification and production rollout pending.

---

## 1. Purpose

A web app that turns BOQs into a searchable cost database.

- **Admins** upload BOQs (PTE or tender returns). The app extracts every item with its full description chain and rate(s), the admin reviews and publishes.
- **Users** search the database to find rates for new estimates, filtered by location, building type, rate type and date.

### Success criteria

| # | Criterion | Target |
|---|---|---|
| 1 | Items extracted correctly from a supported BOQ layout | ≥ 99% of items, 100% of numbers checked |
| 2 | Every item keeps Bill › Heading › Main description › Item | 100% |
| 3 | No unreviewed data reaches the database | 100% — publish only after admin review |
| 4 | Rate search response time | < 500 ms for typical queries |
| 5 | Upload → reviewable result for a 40-page PDF | < 2 minutes |

---

## 2. Scope

### In scope (v1)
- Roles: Admin, User. Invite-only accounts.
- Upload PDF (text-based) and Excel BOQs.
- Rate types: **PTE** and **Tender Return** (multiple contractor rates per item).
- **Project name** (required), project number and **project date**, plus tags: Country → City, Building type, Rate type, BOQ date, **Project stage**, Currency, Client, Consultant.
- **Project stage** is picked from an admin-managed list so it's always written the same way. Starting list: Concept, SD 50%, SD 100%, DD 50%, DD 100%, IFC / Construction, Tender. Admins can add more.
- Two dates are kept: the **project date** (when the project started or was received) and the **BOQ date** of each upload (the date its rates were priced, e.g. 05.10.2026 for Q-Walk SD 50%). Rate history and date filters use the BOQ date, because one project can have BOQs months apart.
- The project name is shown with every rate everywhere in the app (search, item detail, exports), so every rate can be traced back to its project.
- Currencies: SAR, AED, QAR — stored in original, viewable in any of the three.
- Rate search with filters, statistics, item detail, export to Excel.
- AI helper for checking and cleaning extraction — providers managed by admins in settings (DeepSeek, Meta Muse Spark 1.3 / 1.3 Contributor, OpenRouter optional, any OpenAI-compatible service).
- Hosting on Railway.

### Out of scope (v1)
- Awarded / contract rates (confirmed not needed).
- Scanned (image-only) PDFs — needs OCR, planned for a later version.
- Rate inflation / indexation to today's prices — later version.
- Public sign-up.

---

## 3. Architecture

```
                        ┌─────────────────────────────┐
  Browser  ───────────► │  Web app (Next.js)           │
  (Admins, Users)       │  UI · API routes · Auth      │
                        └──────┬───────────────┬───────┘
                               │               │
                     SQL       │               │ HTTP (internal network)
                               ▼               ▼
                 ┌──────────────────┐   ┌─────────────────────────┐
                 │ PostgreSQL       │   │ Extractor (Python,      │
                 │ (Railway)        │◄──│ FastAPI)                │
                 │ data + search    │   │ PDF/Excel parsing,      │
                 └──────────────────┘   │ validation, AI helper   │
                                        └────────┬────────────────┘
                 ┌──────────────────┐            │ HTTPS (optional)
                 │ Storage bucket   │◄───────────┤
                 │ (Railway, S3)    │            ▼
                 │ original BOQs    │   AI providers (DeepSeek, Meta,
                 │                  │   OpenRouter, custom)
                 └──────────────────┘
```

All three services live in one Railway project. The extractor is **not** exposed to the internet — only the web app can call it (Railway private network).

### Technology

| Part | Choice |
|---|---|
| Web app | Next.js (App Router), TypeScript, Tailwind, shadcn/ui |
| Database access | Prisma + PostgreSQL |
| Search | Postgres full-text search (`tsvector`) + `pg_trgm` for typo-tolerant matching |
| Auth | NextAuth (credentials), bcrypt password hashes, invite tokens |
| Extractor | Python 3.12, FastAPI, pdfplumber, openpyxl |
| AI | One OpenAI-compatible client; providers, models and keys managed in Admin settings |
| Files | Railway storage bucket (S3-compatible) |
| Email (invites, password reset) | Resend (or similar) — see open items |
| Tests | Vitest (web), pytest (extractor), Playwright (end-to-end) |

---

## 4. Data model

```
countries ─┬─< cities
           │
building_types     stages
           │
projects ──┴── (name, project_no, project_date, country, city, building_type, client, consultant)
   │
   └─< boq_documents   (one per upload: rate_type, stage_id, boq_date, currency,
         │              file, status: processing → review → published)
         ├─< bidders    (tender returns only: name or "Contractor A", order)
         └─< bills      (bill no, title)
               └─< sections        (heading, e.g. "Paving, Band & Edgings")
                     └─< main_descriptions   (the paragraph above the items)
                           └─< boq_items   (item_ref, item_desc, full_desc,
                                 │          unit, qty, page, flags, search_vector)
                                 └─< rates (bidder → null for PTE, rate, amount, currency)

  One main description → one or many items (e.g. Q-Walk p.13: one 60mm paver
  description → items C, D, E, F, G, H, J).

users ─< audit_log          extraction_jobs (status, progress, errors, ai_cost)
```

### Key tables

**projects** — `id, name, project_no, project_date, client, consultant, country_id, city_id, building_type_id, notes, created_by, created_at`
- `name` is required and unique (case-insensitive), e.g. "Q-Walk". `project_no` is the QSGS project number, e.g. "26-1120" (optional, unique when given).
- `project_date` is required when creating a project (day, or month and year if the exact day is unknown).
- On upload the admin picks an existing project or creates a new one, so all BOQs of the same project stay together.

**boq_documents** — `id, project_id, title, rate_type (PTE | TENDER), stage_id (required, from `stages` list, e.g. "SD 50%"), boq_date (required), currency (SAR|AED|QAR), file_key, file_sha256, status (PROCESSING | REVIEW | PUBLISHED | FAILED), uploaded_by, published_by, published_at`
- A project can have several documents (e.g. SD 50% PTE, SD 100% PTE, then tender return) — each with its own stage and BOQ date.

**stages** — `id, name, sort_order, active` — admin-managed list; `sort_order` keeps stages in project order (Concept → SD → DD → IFC → Tender) in filters and on the project page.
- `file_sha256` blocks accidental duplicate uploads.

**bidders** — `id, document_id, name (nullable), label ("Contractor A"), position`
- Display rule: show `name` if known, otherwise `label`.

**bills** — `id, document_id, bill_no, title, sort_order`

**sections** — `id, bill_id, heading (nullable), sort_order`

**main_descriptions** — `id, section_id, text, page_from, page_to, sort_order, ai_touched`
- Stored **once**; all its items link to it. Editing it in review updates every item under it.
- Can be empty for items that stand on their own (e.g. preliminaries items with no paragraph above).
- Spans pages: `page_from` / `page_to` record where it starts and where its last item is.

**boq_items** — `id, document_id, main_description_id, item_ref, item_desc, full_desc, unit_raw, unit, qty, page, sort_order, flags (jsonb), ai_touched (bool), search_vector (generated)`
- `full_desc` = heading + main description + item description (used for search and display).
- `unit` is normalised (m², m³, m, nr, kg, item, day…); `unit_raw` keeps the original.

**rates** — `id, item_id, bidder_id (null = PTE), rate numeric(14,2), amount numeric(16,2), currency`

**users** — `id, name, email, password_hash, role (ADMIN | USER), status (INVITED | ACTIVE | DISABLED), theme (LIGHT | DARK, default LIGHT), last_login_at`

**audit_log** — `id, user_id, action, entity, entity_id, details (jsonb), created_at`

**ai_providers** — `id, name, type (DEEPSEEK | META | OPENROUTER | CUSTOM), base_url, api_key_encrypted, key_last4, default_model, task_models (jsonb), enabled, priority (fallback order), monthly_budget_usd, data_note, created_by, updated_at`

**ai_usage** — `id, provider_id, document_id, task, model, input_tokens, output_tokens, cost_usd, duration_ms, success, created_at`

**app_settings** — `key, value (jsonb)` — e.g. default AI provider, AI on/off by default

### Rules enforced by the database
- Money stored as `numeric`, never floating point.
- Foreign keys with `ON DELETE CASCADE` from document → items → rates.
- Any BOQ can be deleted by an admin, including a published one: its bills, items, rates, review and AI suggestions and its stored file are removed, its rates leave rate search immediately, and the project stays. The activity log records how many items and rates went.
- Unique `(document_id, sort_order)` on items; unique `(document_id, position)` on bidders.
- Indexes: GIN on `search_vector`, trigram GIN on `full_desc`, b-tree on all filter columns.

### Currency conversion
All three currencies are pegged to USD, so conversion uses fixed rates:
`1 USD = 3.75 SAR = 3.6725 AED = 3.64 QAR`.
Stored values never change; conversion happens only when displaying.

---

## 5. Extraction pipeline

```
Upload ─► Store file ─► Detect type ─► Parse ─► Build hierarchy ─► Validate ─► AI assist ─► Review ─► Publish
```

### 5.1 Steps

1. **Upload** — admin selects or creates the **project** (name, number), fills tags, drops file. The app suggests the project name, BOQ date and stage from the BOQ cover page (e.g. "Q WALK", "5/10/2026", "50% Schematic design" → SD 50%) for the admin to confirm. File saved to bucket, SHA-256 checked for duplicates, job created.
2. **Detect** — PDF with text layer, Excel, or scanned PDF (rejected in v1 with a clear message).
3. **Parse (PDF)** — per page:
   - Find the column header row (`ITEM NO / DESCRIPTION / QUANTITY / UNIT / RATE / AMOUNT`) and read column x-positions *from that page* (they shift between pages).
   - Group words into lines by y-position; assign each word to a column by x-position.
   - Skip cover, collection, summary and page-footer lines ("CARRIED TO COLLECTION").
   - Repair split words (tight word spacing) and superscripts (m² / m³).
4. **Parse (Excel)** — detect header row and columns per sheet; same output format as PDF.
5. **Build hierarchy** — lines are grouped into blocks separated by vertical gaps:
   - A line with an item letter/number starts an **item**; following lines (no gap) continue it.
   - A single short block = **heading**.
   - A bold first line followed by regular text = heading + **main description**.
   - A multi-line block = **main description**, replaces the previous one.
   - Heading and main description carry across pages until replaced.
   - **One main description can have any number of items.** Every item that follows it (A, B, C…) links to the same main description until a new main description or heading appears — including items on the next pages.
   - `full_desc` for each item = heading + main description + item description, rebuilt automatically whenever any part is edited.
   - "Ditto" / "As above but" items are expanded from the previous item.
6. **Validate** (see 5.2) — every item gets pass/warning flags.
7. **AI assist** (see section 6) — optional per upload.
8. **Review** — admin checks, edits, confirms (section 8.3).
9. **Publish** — one database transaction; items become searchable instantly.

### 5.2 Validation checks (automatic)

| Check | Result if failed |
|---|---|
| Item has unit and quantity | Warning |
| `qty × rate ≈ amount` (±1%) | Error — must be fixed or confirmed |
| Bill totals equal the collection page / summary totals | Error |
| A letter skipped within a run of item refs (A, B, D) on a PDF page. Refs restart on every page and at new sections, so repeated letters are normal and never flagged | Warning |
| Main description with no items, or item with an unusually long main-description gap | Warning (possible wrong link) |
| Unit recognised | Warning |
| Rate within 10× of the median of similar items already in the database | Warning ("unusual rate") |
| Tender return: every bidder column has a rate or a clear "excluded/included" marker | Warning |

Items with errors cannot be published until fixed or explicitly accepted.

### 5.3 Tender returns
- Detect the repeated column groups (Rate / Amount per contractor) from the header rows.
- Contractor names read from the header when present; otherwise labelled A, B, C… in column order.
- Admin confirms the column-to-contractor mapping on the review screen before publishing.
- Item descriptions are extracted once and shared by all bidders' rates.
- **Waiting for a sample tender return** to finalise this parser.

### 5.4 Test set ("golden files")
Every supported BOQ layout gets a test file plus a checked expected output. The extractor must reproduce it exactly before any release. First entry: **Q-Walk SD 50% BOQ** (184 items, verified in the prototype).

---

## 6. AI helper (multiple providers, managed in Admin settings)

### What it does
| Task | When |
|---|---|
| Check heading / main description links where the rules are unsure | Items flagged "uncertain" |
| Fix broken text and typos ("Allownce" → "Allowance", broken symbols) | Every upload |
| Suggest column mapping for unknown layouts and tender returns | When no known layout matches |
| Suggest trade category (Paving, Lighting, Concrete…) | Every item |
| Group similar items across projects | Background job after publish (phase 6) |
| Read scanned (image) PDF pages | Later version — only with a provider whose model reads PDFs/images |

### Safety rules
1. **AI never changes a number** (qty, rate, amount). Numbers come only from the parser.
2. Every AI change is stored separately and highlighted on the review screen; the original text is kept.
3. Nothing AI-touched is published without admin review.
4. Responses must match a strict JSON format; anything else is rejected and the item is left for manual review.
5. Timeouts and retries; if every provider is down, extraction still completes without AI.

### Supported providers
All use the OpenAI-compatible API format, so one AI client handles them all.

| Provider | Models (examples) | Notes |
|---|---|---|
| **DeepSeek** | `deepseek-chat`, reasoning models | Very low cost; text only |
| **Meta Model API** | **Muse Spark 1.3**, **Muse Spark 1.3 Contributor** | Long context (≈1M tokens); reads text, images and PDFs — useful later for scanned BOQs |
| **OpenRouter** (optional) | Any model OpenRouter offers (Claude, GPT, Gemini, Llama, DeepSeek, Muse Spark…) | One key gives access to many models; useful for testing and as a backup |
| **Other (custom)** | Any OpenAI-compatible service | Admin enters base URL + model name |

Model names are free text with suggestions, so new model versions can be used without a code change.

### Admin settings → AI providers screen
- **Add provider:** pick type (DeepSeek / Meta / OpenRouter / Custom), name it, paste API key, set base URL (pre-filled for known providers), choose model(s).
- **Test connection** button: sends a tiny request and shows OK / error and response time before saving.
- **Default provider** and a **fallback order** (e.g. DeepSeek → OpenRouter). If the first fails or times out, the next one is tried.
- **Per-task model** (optional): e.g. cheap model for text cleanup, stronger model for column mapping.
- **Enable / disable** a provider without deleting it.
- **Monthly budget limit** per provider: AI stops (extraction carries on without it) when the limit is reached; admins see a warning at 80%.
- **Usage dashboard:** requests, tokens and cost per provider, per upload and per month.
- **Data note per provider** shown to admins (e.g. "DeepSeek: servers in China") so they can choose per project.

### API key security
- Keys are entered **only** in this admin screen — never in chat, code or git.
- Stored **encrypted** in the database (AES-256-GCM). The encryption master key lives only in Railway environment variables (`AI_KEYS_ENCRYPTION_KEY`).
- After saving, a key is never shown again — only the last 4 characters (`••••a9F2`). Admins can replace or delete it.
- Keys are decrypted only inside the extractor service at the moment of a request, and never sent to the browser or written to logs.
- Every add / change / delete / test is written to the audit log.

### Per-upload choice
- On upload the admin chooses: **AI off**, **default provider**, or a specific provider.
- Default for each new upload is set in AI settings.

### Data confidentiality
Client BOQ text is sent to the chosen provider. Each provider's data location and policy is shown in settings. For sensitive projects, admins switch AI off or pick a provider their client accepts.

---

## 7. Rate search

### Behaviour
- One search box: searches **heading + main description + item description** together, plus **project name and number** (typing "Q-Walk" or "26-1120" shows that project's rates).
- Typo-tolerant ("pavr" finds "paver") and handles units/sizes ("300x300", "60mm").
- Filters: **Project (name or number, multi-select)**, Country → City, Building type, Rate type, **Project stage (multi-select)**, Unit, **BOQ date range**, **Project date range**, Trade, Bidder (tender).
- Currency switch (SAR / AED / QAR) converts every number on screen.
- Results ranked by relevance, then most recent.

### Results
- **Summary cards:** median rate, min–max, number of rates, number of projects (computed in the database with `percentile_cont`).
- **Result rows:** item description, description chain (shortened), **project name** (+ number), city, **stage**, BOQ date, source (PTE / Tender with bidder count), rate.
- **Item detail panel:** project name, number and project date (link to the project page), stage, BOQ date, full description chain, all rates (PTE + each contractor), lowest/median/highest, rate-over-time chart, **other items under the same main description** (e.g. all paver colours and sizes in that group, with their rates), link to the source page of the original BOQ.
- **Basket:** pick rates from several searches → export to Excel. Every exported row includes project name, project number, project date, location, building type, rate type, stage, BOQ date, bill, item ref, full description, unit and rate.

### Rules
- Statistics only combine rates with the **same unit**. Mixed units show a prompt to pick one.
- Only **published** documents are searchable.

---

## 8. Screens

### 8.1 Design system
Full specification: **[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)**.
- Layout, page sizes, corner radii, buttons, inputs, dropdowns, cards, badges, tables, dialogs and motion copied exactly from the Weekly Allocation app (56px top bar, 240px sidebar, 1280px content width, radius 14 / 10 / 8 / 6 / 4 px, 34px buttons, 38px inputs…).
- Colours replaced: QSGS brand blue `#0A5083` instead of C-Quest red, used sparingly (about 5% of a screen). No C-Quest colours, names or assets.
- Font: Funnel Sans, softened weights, tabular numbers in all rate columns.
- **Theme: light by default**, with a dark theme the user can switch to.
  - Default is always light for new users — it does not follow the computer's dark-mode setting.
  - Switch in the top bar (sun/moon icon) and in the user menu: Light / Dark.
  - Each user's choice is saved to their account, so it stays the same on any device, and is applied before the page appears (no white flash when loading in dark).
  - Sign-in pages use light.
  - Dark theme uses neutral dark greys (not black or blue); brand blue `#0A5083` is lightened slightly in dark so text and buttons keep WCAG AA contrast.
  - Charts, PDF preview frame, tables and status colours designed and tested in both themes.
- Keyboard: `Ctrl+K` search, `Esc` close panels, arrow keys in tables.
- Responsive down to tablet width; accessible (WCAG AA contrast, focus visible, labelled controls).
- Every screen has designed loading, empty and error states.

### 8.2 Screen list

| Screen | Who | Purpose |
|---|---|---|
| Sign in / Set password / Reset password | All | Access |
| Rate search (home) | All | Find rates |
| Item detail (side panel) | All | All rates and history of one item |
| Projects list | All | Browse and search projects by name, number, date and tags; sort by project date |
| Project page | All (edit: Admin) | Project name, number, project date, info, documents listed by stage, items, tender comparison |
| Upload | Admin | File + tags, start extraction |
| Review | Admin | Check and fix extraction, publish |
| Users | Admin | Invite, change role, disable |
| Lists | Admin | Countries, cities, building types, project stages |
| AI settings | Admin | Add/test providers and keys, default and fallback order, per-task models, budgets, usage and cost |
| Activity log | Admin | Who did what |

### 8.3 Review screen (most important admin screen)
- Left: original PDF page. Right: extracted items for that page.
- Click an item → its source lines highlight on the PDF.
- Filters: errors only / warnings only / AI-changed only.
- Items are shown **grouped under their main description**, like the original BOQ. Editing a main description updates all its items at once.
- If an item is linked to the wrong main description, the admin can move it (drag, or select items → "Move to main description…"), split one group into two, or merge two groups.
- Inline edit of any field.
- Tender returns: column-to-contractor mapping step before item review.
- Progress bar: "182 of 184 items checked". Publish button enabled when there are no unresolved errors.

---

## 9. Security and permissions

| Action | Admin | User |
|---|:-:|:-:|
| Search, view, export | ✅ | ✅ |
| Upload, review, publish, edit, delete | ✅ | ❌ |
| Manage users and lists | ✅ | ❌ |

- Permissions checked on the **server** for every API route, not only hidden in the UI.
- Invite-only accounts; invite and reset links expire after 48 hours, single use.
- Passwords hashed with bcrypt; login rate-limited; sessions expire after inactivity.
- Original BOQ files served through signed, short-lived links only.
- The last remaining admin cannot be demoted or disabled.
- All admin actions written to the audit log.
- Secrets only in Railway environment variables, except AI API keys, which are stored encrypted in the database (master key in Railway) and managed in Admin settings. `.gitignore` excludes BOQ files, extraction outputs and `.env`.
- Daily database backups (Railway) plus a tested restore procedure.

---

## 10. Quality and testing

| Level | What | Tool |
|---|---|---|
| Extractor unit tests | Line grouping, hierarchy rules, units, validation | pytest |
| Golden-file tests | Each known BOQ layout reproduces its checked output exactly | pytest |
| Web unit tests | Permissions, currency conversion, statistics, search query building | Vitest |
| End-to-end | Invite → login → upload → review → publish → search → export | Playwright |
| Manual check | Every phase is demonstrated with a real BOQ before sign-off | — |

Rules:
- All tests must pass before deploying.
- Every bug found gets a test that reproduces it.
- Staging environment on Railway for checking before production.

---

## 11. Build phases

Each phase ends with a working, demonstrable result.

### Phase 0 — Project setup ✅
- Repo structure (`web/`, `extractor/`, `docs/`), `.gitignore`, linting, formatting.
- Local Postgres, environment variable templates.
- **Done when:** both services start locally with one command.

### Phase 1 — Foundation ✅
- Built: invite-only accounts, sign in, set/reset password, lockout after 5 wrong passwords, instant sign-out on disable/role/password change, Users, Lists (locations, building types, stages), Activity log, Settings, light/dark theme saved per user.
- Email: invites and reset links are emailed when Resend is configured; until then admins copy the link from the Users screen.

- Database schema and migrations; seed countries/cities (UAE, KSA, Qatar), building types and project stages.
- Auth: invite, set password, sign in, reset password, roles.
- App shell: branding, navigation, theme switch (light default, dark optional, saved per user).
- Admin: Users and Lists screens; audit log.
- **Done when:** an admin can invite a user, the user can sign in, and users cannot reach admin pages or APIs.

### Phase 2 — PTE extraction ✅
- Built: PDF reader (column positions per page; rows cut at gaps so item references on the first line, centred, or above the text all work; footers and collection/summary pages skipped; damaged dashes/apostrophes repaired), Excel reader, hierarchy builder (bill › heading › main description › items, parent headings, ditto), validation checks, cover reading (project, BOQ date, stage), upload screen with duplicate and similar-project protection, background extraction with progress, retry and delete, upload page showing everything extracted.
- Q-Walk SD 50%: 184 / 184 items with the right hierarchy, every item reference and quantity matching the PDF page by page; golden test passes.
- Excel reader is tested on generated workbooks only — confirm with the first real Excel BOQ and add it as a golden file.

- Extractor service from the prototype: PDF parser, hierarchy builder, validation, golden test with Q-Walk.
- Excel parser.
- Local priced Q-Walk workbook verified: 184 items, 121 numeric rates; every extracted quantity, rate and amount matched the original. Excel reference checks respect sheet sections rather than PDF page conventions. Imported locally for admin review.
- Upload screen, file storage, duplicate check, job progress.
- **Done when:** uploading Q-Walk produces all 184 items with correct hierarchy and the golden test passes.

### Phase 3 — Review and publish ✅
- Built: PDF side-by-side with matching source text highlights; page/sheet navigation; error, warning, unchecked and AI-change filters; editable bills, headings, shared descriptions and item fields; bulk check/unit/move, group split and merge; reasoned acceptance of source checks; checked-item progress; atomic publish with admin attribution and audit history; project and published-document pages.
- Editing clears affected item checks. Server-side errors and unchecked items block publishing; stale/concurrent edits are rejected. Users see only published documents and their source files. Tender mapping stays in Phase 6.
- Verified: web tests, PostgreSQL transaction tests, production build, desktop light/dark and 390px browser checks; fixed a flagged synthetic item, bulk checked, published and opened its project/document. Real Q-Walk PDF preview checked without publishing the real BOQ.
- Review screen with PDF side-by-side, inline edit, flags, bulk edit.
- Publish transaction; project and document pages.
- **Done when:** an admin can fix a flagged item, publish, and see the document on the project page.

### Phase 4 — Rate search ✅
- Built: authenticated published-only full-text and typo-tolerant search over the full description chain and project name/number; dimensions are matched exactly; multi-project/stage filters, country/city, building type, rate type, unit, BOQ/project dates and heading filters; SAR/AED/QAR display conversion; SQL median/min/max across all matching rates with one-unit safeguards; relevance/newest ranking and pagination.
- Item panel includes project/source links, all item rates, exact-description/unit history chart and sibling items. Basket persists per user in the browser tab across searches and exports a formatted Excel workbook with complete project metadata, source and converted values. Export rechecks publication and preserves text and large numeric precision.
- Trade uses accepted AI trade tags with BOQ section headings as a fallback. Bidder ID filters appear when published bidder rates exist; tender extraction and bidder mapping remain Phase 6. Timeline shows up to 500 exact-description matches and labels truncation.
- Verified locally: permission/validation tests, Postgres matching/conversion/statistics tests, 5,000-rate pagination/performance test under 500 ms, valid downloaded Excel, desktop and mobile browser interactions. Only published BOQs are searchable; BOQs still in review are excluded.
- Full-text + typo-tolerant search, filters, currency switch, statistics.
- Item detail panel, rate-over-time chart, basket and Excel export.
- **Done when:** searching "60mm concrete paver" returns the correct items with correct statistics, under 500 ms.

### Phase 5 — AI helper (implemented locally)
- Built: admin provider setup, synthetic connection tests before enablement, encrypted credentials decrypted only in the extractor, default and opt-in ordered fallbacks, per-task models, global toggle, serialized monthly budget reservations, 80% warning, token/cost/latency logging and upload-level usage.
- AI produces separate item-text, trade and uncertain-link proposals. Strict schemas reject extra/numeric fields, unknown IDs and changed numeric tokens. Admin acceptance/rejection retains originals and resets checks; pending proposals block checking/publishing. Accepted trade tags feed rate search. Unfamiliar Excel header mappings can be suggested and explicitly reviewed before the deterministic parser re-reads numeric cells.
- Each upload stores consented provider configurations; newly added/changed recipients are excluded. AI-off and provider/budget failures retain normal extraction. Time-bounded/partial processing is labelled, and interrupted runs become reviewable.
- Verified locally with synthetic data: encrypted-key interoperability, JSON/endpoint restrictions, authentication, numeric preservation, review and publication gates, concurrent budgets, failure/retry/fallback behavior, mapping, desktop/mobile review interactions and production build. Live provider credentials still need an admin-entered key; no real BOQ was sent to external AI.
- AI settings screen: add/test/enable providers (DeepSeek, Meta Muse Spark 1.3 / Contributor, OpenRouter, custom), encrypted keys, default + fallback order, per-task models, budgets, usage dashboard.
- One OpenAI-compatible AI client with fallback, strict JSON responses, retries, cost logging.
- Text cleanup, uncertain-link checking, trade tagging, review highlighting, admin toggle.
- **Done when:** an admin adds a provider and it passes "Test connection"; AI suggestions appear highlighted in review; numbers are never changed; switching provider needs no code change; if the main provider fails, the fallback is used; extraction still works with AI switched off.

### Phase 6 — Tender returns
- Tender return parser (after sample received), bidder mapping step, multi-rate review.
- Tender comparison table on project page; bidder statistics in search.
- Similar-item grouping across projects.
- **Done when:** a real tender return is uploaded, contractor columns mapped, and search shows lowest/median/highest bids.

### Phase 7 — Deployment and launch
- Railway project: web, extractor (private), Postgres, bucket; staging + production.
- Backups, monitoring, error alerts; custom domain (optional).
- Load real historical BOQs; user guide for admins and users.
- **Done when:** the team signs in on the live URL and finds rates from loaded projects.

---

## 12. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| New consultant layouts break the parser | Wrong or missing items | Per-page column detection, validation checks, AI layout help, golden files per layout |
| Wrong numbers saved | Bad estimates | Numbers from parser only, `qty × rate = amount` check, bill total check, mandatory review |
| Same item described differently across projects | Weak search results | Search over full description chain, typo tolerance, AI grouping (phase 6) |
| Client data sent to external AI | Confidentiality breach | Per-upload AI choice (off / provider), data note per provider, admin decision |
| API key leaked | Misuse and cost | Keys encrypted, never shown after saving, never sent to browser or logs; budget limits per provider |
| AI provider down or model renamed | AI help unavailable | Fallback order, test button, model names editable; extraction works without AI |
| Scanned PDFs | Cannot extract | Clear rejection message in v1; OCR in a later version |
| Mixed units in statistics | Misleading medians | Statistics only within one unit |
| Data loss | Lost database | Daily backups, tested restore, original files kept |

---

## 13. Open items

| # | Item | Needed by |
|---|---|---|
| 1 | Sample tender return (PDF or Excel) | Phase 6 |
| 2 | BOQ from a different consultant (priced Q-Walk sample supplied and verified locally) | Phase 2 |
| 3 | Full list of cities, building types and project stages to seed | Phase 1 |
| 4 | Email provider for invites (Resend suggested) and sender address | Phase 1 |
| 5 | API keys for DeepSeek / Meta / OpenRouter — entered by an admin in AI settings, never shared in chat | Phase 5 |
| 6 | Railway connector authorisation in claude.ai settings | Phase 7 |
| 7 | Custom domain (e.g. costdb.qsgs…) — optional | Phase 7 |
