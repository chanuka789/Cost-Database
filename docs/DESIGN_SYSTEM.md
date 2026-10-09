# QSGS Cost Database — Design System

The layout, sizes, corner radii, components and motion are taken **exactly** from the Weekly Allocation app (`D:\GitHub\Weekly Allocation\C-Quest-Project-Management-System`, `src/app/globals.css` and `src/components/ui`).

**Only the colours change.** C-Quest red (`#cf0a2c`) is replaced by the QSGS brand blue `#0A5083`. No C-Quest colour, name or logo is used anywhere.

**Theme:** light by default; dark is an optional switch saved per user.

---

## 1. Colour tokens

### Principles (same as Weekly Allocation)
- Neutral greys carry the interface; the brand colour marks **brand and interaction only**.
- Green / amber / red are reserved for **status** (OK / warning / error) and always paired with a word or icon.
- Dark mode is a stack of layered greys, with the darkest reserved for the top bar.

### Neutrals (identical to Weekly Allocation)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--qs-canvas` | `#f2f2f2` | `#1f2023` | Page background |
| `--qs-panel` | `#ffffff` | `#26282c` | Cards, sidebar, menus, inputs |
| `--qs-raised` | `#fafafa` | `#2e3035` | Card footers, table headers, segmented track |
| `--qs-hover` | `#efefef` | `#33363b` | Hover fill |
| `--qs-pressed` | `#e3e3e3` | `#3a3d43` | Pressed fill |
| `--qs-border` | `#e3e3e3` | `#383b40` | Default border |
| `--qs-border-strong` | `#c7c7c7` | `#4a4e55` | Inputs, buttons, selects |
| `--qs-text` | `#262626` | `#e6e8eb` | Main text |
| `--qs-text-secondary` | `#464646` | `#c9cdd2` | Nav, secondary text |
| `--qs-text-muted` | `#5d5d5d` | `#9ba1a8` | Labels, descriptions |
| `--qs-text-faint` | `#909090` | `#777d85` | Placeholders, hints |
| `--qs-topbar` | `#ffffff` | `#18191b` | Top bar |
| `--qs-topbar-border` | `#e3e3e3` | `#2a2c30` | Top bar divider |

### Brand (QSGS — replaces C-Quest red)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--qs-brand` | `#0A5083` | `#2F77B0` | Primary button fill, checked checkbox, active tab underline |
| `--qs-brand-rgb` | `10, 80, 131` | `47, 119, 176` | For transparent tints |
| `--qs-brand-hover` | `#083F68` | `#276A9E` | Primary button hover |
| `--qs-brand-tint` | `#E7EFF6` | `#1E2C38` | Active nav item, selected menu row, selected chip |
| `--qs-brand-text` | `#0A5083` | `#8DBDE3` | Brand-coloured text and links on neutral surfaces |
| `--qs-focus-ring` | `0 0 0 3px rgba(10,80,131,.18)` | `0 0 0 3px rgba(47,119,176,.35)` | Keyboard focus |

The dark brand values are lighter than `#0A5083` so buttons and text keep WCAG AA contrast on dark greys. White text on `#2F77B0` passes AA.

### Status

| Token | Light | Dark | Use |
|---|---|---|---|
| `--qs-success` / `-bg` | `#2b7a30` / `#e7f3e8` | `#72c176` / `#223226` | Published, validated |
| `--qs-warning` / `-bg` | `#9a5e08` / `#fbf1e1` | `#d9a441` / `#3a3222` | Warnings, AI-changed |
| `--qs-danger` / `-bg` | `#b42318` / `#fdecea` | `#f97066` / `#3a2328` | Errors, delete |
| `--qs-info` / `-bg` | `#475467` / `#eef1f4` | `#b3bcc8` / `#2b2f36` | Neutral notes (slate, so it never competes with the brand blue) |
| `--qs-highlight` | `#fff1a8` | `#5c5220` | Search-match highlight |

### Where the brand blue is allowed
About 5% of any screen. **Only:**
1. Logo
2. **One** primary button per screen (e.g. "Search", "Publish", "Upload")
3. Active sidebar item (tint background + brand text)
4. Focus ring and focused input border
5. Selected menu row, selected chip/filter, checked checkbox, active tab underline
6. Links
7. The single key statistic on a page (e.g. median rate)

Everything else is neutral. Large blue areas, blue headers, blue table rows and blue backgrounds are **not allowed**.

### Shadows (identical)

| Token | Light | Dark |
|---|---|---|
| `--qs-shadow-sm` | `0 1px 2px rgba(16,18,22,.06)` | `0 1px 2px rgba(0,0,0,.3)` |
| `--qs-shadow-elevated` | `0 2px 6px rgba(16,18,22,.06), 0 10px 24px rgba(16,18,22,.06)` | `0 2px 6px rgba(0,0,0,.25), 0 10px 24px rgba(0,0,0,.25)` |
| `--qs-shadow-popup` | `0 16px 40px rgba(16,18,22,.18), 0 2px 8px rgba(16,18,22,.08)` | `0 18px 48px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.35)` |
| `--qs-backdrop` | `rgba(24,26,30,.38)` | `rgba(0,0,0,.55)` |

No gradients anywhere — flat canvas.

---

## 2. Corner radius (identical)

One block of tokens controls every rounded edge in the app.

| Token | Value | Applies to |
|---|---|---|
| `--radius-dialog` | **14px** | Modal dialogs, slide-over sheets (item detail panel) |
| `--radius-surface` | **10px** | Cards, panels, sidebar, page shells |
| `--radius-menu` | **10px** | Dropdowns, popovers, context menus, listboxes, tooltips |
| `--radius-control` | **8px** | Buttons, inputs, selects, filter triggers, nav items |
| `--radius-item` | **6px** | Rows inside dropdowns/menus/lists, badges |
| `--radius-chip` | **4px** | Checkboxes, small tags, tiny icon tiles |
| `--radius-pill` | **9999px** | Avatars, dots, toggles, deliberate pills |
| `--radius-grid` | **0px** | Data-table and spreadsheet cells — always square |
| Segmented control track | **9px** | Special case (as in Weekly Allocation) |

Rules (same tier system as Weekly Allocation): baseline → surface; floating panels → menu; controls → control; menu rows → item; small chrome → chip; `rounded-full` → pill; table cells → grid. The logo always has square corners.

---

## 3. Typography

| Property | Value |
|---|---|
| Font | **Funnel Sans** (variable), fallback `"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Arial` |
| Mono | `ui-monospace, SFMono-Regular, Menlo, Consolas` |
| Weights (softened) | semibold **550**, bold **600**, extrabold 650, black 700 |
| Numbers | `font-variant-numeric: tabular-nums` on all rates, quantities, amounts, dates |

| Style | Size / weight | Use |
|---|---|---|
| Page title | **20px** (22px from `sm`) / 600, tight leading | Main heading of a page |
| Form / settings title | **18px** / 600 | "New project", "Settings" |
| Sign-in title | **22px** / 600, centred | Login page |
| Card title | **15px** / 600 (14px in small cards) | Card headers |
| Stat value | **18px** bold, tabular, tight tracking (KPI cards up to 24–30px) | Median rate, counts |
| Body / controls | **13.5px** buttons and nav, **13px** menu rows and tabs, **14px** inputs | |
| Small / descriptions | **12.5px** muted | Card descriptions, small buttons |
| Labels / badges | **11px** / 600 | Badges, dropdown group labels |
| Eyebrow | **10–12px** / 600, uppercase, letter-spacing 0.14–0.18em, muted | Small labels above titles and stat cards |

Inputs use **16px** text below the `md` breakpoint so iOS does not zoom.

---

## 4. Layout and page sizes (identical)

| Element | Size |
|---|---|
| Top bar | **56px** high, full width, fixed, `--qs-topbar` with bottom border |
| Logo in bars | **30px** high, width auto, square corners |
| Sidebar | **240px** expanded / **64px** collapsed rail, docked below the top bar, right border, `--qs-panel` |
| Sidebar collapse animation | width 200ms ease-out; collapsed labels become tooltips |
| Content width | max **1280px** + side gutters, centred |
| Side gutters | `clamp(16px, 2.5vw, 24px)` (12px on phones) |
| Vertical padding | 20px, 24px from `lg` (16px on phones) |
| Standard page gap | **16px** (above/below pinned headers, between sections) |
| Pinned page header | sticky at **72px** from top (56px bar + 16px gap) |
| Full-width pages | Review screen and big tables use full width (`px 12–24px`), like the Weekly Allocation schedule |
| Stat card grid | 1 column → 2 from 560px → 4 from 1100px, gap 14px |
| Breakpoints | Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536); sidebar shows from `lg`, mobile sidebar sheet below |

---

## 5. Components

All values identical to Weekly Allocation; only colours mapped to the tokens above.

### Button
| Size | Height | Padding | Text |
|---|---|---|---|
| default | **34px** | 14px sides | 13.5px / 550 |
| sm | **28px** | 10px sides | 12.5px |
| lg | **40px** | 20px sides | 13.5px |
| icon | **34×34px** (40×40 on touch) | 0 | — |

- Radius 8px, icon gap 8px, icons 16px, 1px border.
- Transition: colour, background, border, shadow — 150ms.
- Focus: `--qs-focus-ring`. Disabled: 50% opacity, no pointer.

| Variant | Look |
|---|---|
| **primary** | `--qs-brand` fill, white text, hover `--qs-brand-hover` — max one per screen |
| **secondary / outline** | panel fill, strong border, main text; hover `--qs-hover`, active `--qs-pressed` |
| **ghost** | transparent, secondary text; hover `--qs-hover` + main text |
| **destructive** | panel fill, strong border, danger text; hover danger tint |
| **link** | no border/padding, brand text, underline on hover |

### Input / textarea
- Height **38px**, padding 12px, radius 8px, 1px strong border, panel fill.
- Text 14px (16px on phones), placeholder `--qs-text-faint`.
- Focus: brand border + focus ring, 150ms. Error: danger border + ring. Disabled: raised fill, 60% opacity.

### Select / dropdown
- **Trigger:** height **38px** (sm **28px**, 12.5px text), padding 12px left / 10px right, radius 8px, strong border; hover border `--qs-text-faint`; open/focus brand border + ring; chevron 16px, stroke 1.8, muted.
- **Menu panel:** panel fill, 1px border, popup shadow, radius 10px, padding 4px, offset 4px from trigger, min width 144px (or trigger width), max height = available space, scroll inside.
- **Open animation:** fade + slide, **140ms**, `cubic-bezier(0.22, 1, 0.36, 1)`; zoom 95% for select.
- **Menu row:** min height **32px** (40px on touch), padding 10px, 13px text, radius 6px, gap 8px; hover `--qs-hover`; selected = brand tint + brand text + check icon at right (select) / semibold.
- **Group label:** 11px / 600, faint, padding 10px left, 8px top.
- **Separator:** 1px `--qs-border`, 4px vertical margin.

### Card / panel
- Radius 10px, 1px border, panel fill, shadow-sm; hover shadow-elevated (160ms).
- Padding 16px (small card 12px); gap 16px (12px).
- Title 15px / 600; description 12.5px muted; footer: top border, raised fill, padding 16px.
- Stat pill inside a card: radius 8px, border, raised fill, padding 12×16px, 14px muted.

### Badge
- Height **20px**, padding 0 7px, gap 4px, **11px / 600**, radius 6px.
- Tones: neutral (hover fill, secondary text), brand (tint), success, warning, danger, info.
- Examples: `PTE` (neutral), `Tender · 5` (neutral), `Published` (success), `Needs review` (warning), `Error` (danger), `AI` (warning).

### Sidebar nav item
- Min height **36px** (44px on touch), padding 12px, gap 12px, **13.5px / 500**, radius 8px.
- Default secondary text; hover `--qs-hover` + main text; active = brand tint + brand text.

### Top bar
- Icon buttons **34×34px** (40 on touch), ghost until hovered; open state = brand tint.
- Expanding search: 34px icon → **288px** wide field, brand border + ring when open.
- Theme switch (sun/moon), user avatar menu.

### Segmented control (e.g. PTE / Tender / All, List / Grid)
- Track: padding 3px, gap 2px, 1px border, raised fill, radius 9px.
- Item: min height **28px** (36px on touch), padding 0 12px, 13px, muted text; selected = panel fill, main text, shadow-sm.

### Tabs (line style)
- Height **36px**, padding 12px, 13px / 600, muted → main on hover/active.
- Active underline: 2px brand, 5px below.

### Checkbox
- **18×18px**, radius 4px, strong border, panel fill; hover brand border; checked brand fill + white 14px check; touch target extended by 12×8px.

### Dialog
- Max width **460px** (wider variants for forms: 560 / 720px), padding **22px**, radius 14px, 1px border, popup shadow.
- Backdrop `--qs-backdrop`. Open: fade + zoom from 98%, **150ms**. Close button top-right, muted.
- Header gap 6px; leaves 32px right for the close button.

### Sheet (slide-over panel — used for Item detail)
- From the right, radius 14px on the open side, popup shadow, full height, width 480–640px (full screen on phones).

### Toast
- Dark grey surface with light text **in both themes** (`#2e3035` / text `#e6e8eb`, border `#3a3d43`), radius 10px, small status dot first.

### Tables (rate tables, review grid)
Weekly Allocation's grid rules, adapted for rates:
- Cells square (radius 0) inside a 10px-radius card.
- Header row **36px**, raised fill, 11.5px / 600 muted, sticky on scroll.
- Body rows **40px** (dense mode 32px), 13px, 1px bottom border, hover `--qs-hover`, selected brand tint.
- Numbers right-aligned, tabular; units left-aligned next to quantities.
- Long descriptions: one line with ellipsis + full text in the detail panel; review grid wraps text.

### Loading, empty and error states
- Skeletons in `--qs-hover` with a gentle pulse (no spinners for page loads).
- Empty state: icon, short title ("Upload your first BOQ"), one line of help, one action.
- Error state: what happened + what to do + "Try again".

---

## 6. Motion (identical)

| Token | Value |
|---|---|
| `--duration-fast` | 120ms (hover, nav) |
| `--duration-normal` | 160ms (cards, inputs) |
| `--duration-slow` | 180ms |
| Ease | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Page reveal | fade-in 120ms after 40ms (hides first-paint flash) |

Respect `prefers-reduced-motion`: animations off, transitions instant.

---

## 7. Icons

- **Lucide** icons, 16px in controls (20px in stat cards), stroke 1.8, inherit text colour.
- Icon-only buttons always have an `aria-label` and a tooltip.

---

## 8. Accessibility

- WCAG AA contrast in both themes (checked for every token pair above).
- Visible focus ring on every interactive element.
- Touch targets ≥ 40px on touch screens (sizes above switch automatically with `pointer: coarse`).
- Status never shown by colour alone — always with a word or icon.
- "Skip to content" link, labelled controls, keyboard-navigable menus and tables.

---

## 9. Implementation notes

- Tokens live in one place: `web/src/app/globals.css` (`:root` for light, `.dark` for dark), exposed to Tailwind as `bg-qs-panel`, `text-qs-text-muted`, `border-qs-border-strong`, `bg-qs-brand-tint`, etc.
- Components start from the Weekly Allocation `src/components/ui` files (button, input, select, card, badge, checkbox, dialog, sheet, tabs, sonner) with `cq-*` classes renamed to `qs-*` and red tokens replaced by brand tokens. No C-Quest names, colours or assets are copied.
- Theme handled by `next-themes` with `defaultTheme="light"` and `enableSystem={false}`; the saved user preference is applied on load.
