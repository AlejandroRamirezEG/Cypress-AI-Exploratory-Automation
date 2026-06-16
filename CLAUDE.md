# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                       # install dependencies
pnpm test:ai                       # headless automated scan (CI / quick baseline)
pnpm test:ai_boxes                 # headless scan with violation bounding boxes in screenshot
pnpm test:ai_interactive           # interactive Cypress App session (designer walkthrough)
pnpm test:ai_interactive_boxes     # interactive session with violation bounding boxes enabled
pnpm cy:open                       # open Cypress App without WCAG env set
pnpm cy:run                        # full headless suite (all specs)
```

Target URL is set via `cypress.env.json` (gitignored, create locally):
```json
{ "BASE_URL": "https://your-staging-url.example.com" }
```
Without this file, runs default to `https://www.saucedemo.com`.

Optional flags (add to `cypress.env.json` or pass via `--env`):
- `WCAG_HIGHLIGHT_BOXES: true` — inject impact-colored bounding boxes + rule-ID labels over each violating element before `cy.screenshot()`, then remove them. Off by default; the `_boxes` scripts above enable it for one run.

## Architecture

The project is a two-mode WCAG 2.1 AA auditor built on Cypress + axe-core. The primary audience is **designers and UX leads** who use the output HTML reports to review accessibility violations. Keep this in mind: UX-first, avoid complexity and feature creep.

### Active spec

`cypress/e2e/ai-driven/ai-exploratory.cy.js` is the **only actively maintained spec**. The specs under `cypress/e2e/exploratory/` (parabank, saucedemo) and all page objects in `cypress/support/page-objects/` are legacy and should not be extended.

### The two modes

**Automated** (`pnpm test:ai`): visits `BASE_URL`, waits for Angular/Ionic to boot, scrolls to flush lazy-rendered components, runs one axe audit, saves all output, exits.

**Interactive** (`pnpm test:ai_interactive`): visits `BASE_URL`, then injects a fixed control bar into the AUT (application under test). The tester navigates the app and clicks **Scan** to audit whatever is on screen, repeating as many times as needed before clicking **Done**. The loop is implemented as a recursive `doScanCycle()` function — each cycle queues its own Cypress commands and calls itself only when the user clicks Scan. The bar communicates clicks back to Cypress via `win.__wcag_action__` (a property set on the AUT's `window`). The bar's top/bottom position is persisted across cycles via a module-level `_barPosition` variable.

Control bar buttons (left to right): **🔍 Scan**, **👁 Focus**, **↑/↓** (move), **⎯** (minimize to pill), **✕** (end session). The **👁 Focus** toggle injects `<style id="__wcag_focus_style__">` into the AUT (`*:focus` outline 4px #ff007f, excluding `#__wcag_controls__` and `#__wcag_pill__`) so the designer can walk the tab order visually between scans. Active state is read from the DOM on bar re-injection so it survives across scan cycles. When focus escapes the AUT (`window.blur`), the bar turns amber (`#b45309`) and the message warns the tester; `window.focus` restores both. Do not add new `win.__wcag_action__` values — extend the bar with toggles that only mutate DOM/styles.

### Session isolation

`cypress.config.js:setupNodeEvents` generates a unique `SESSION_ID` (`YYYYMMDD-HHmm-xxxx`) once per Cypress launch and injects it into `config.env`. Every scan within a session writes to `reports/ai-insights/<SESSION_ID>/`. This means parallel runs never overwrite each other and an early Cypress exit still leaves valid output for all completed scans.

### Data flow per scan

1. `cy.injectAxe()` — re-injected each scan because Angular may re-bootstrap between scans.
2. `cy.checkA11y()` — called with `true` as the 4th arg so violations are collected but **do not fail the test**.
3. `cy.document()` — heuristic checks run directly in the browser: missing `alt`, unlabelled inputs, `tabindex="-1"` on interactive elements, positive `tabindex` values (SC 1.3.2 / 2.4.3), touch target sizes (SC 2.5.8), heading hierarchy (SC 1.3.1 / 2.4.6), landmark presence.
4. Pre-screenshot cleanup — a `cy.document()` strips `__wcag_focus_style__` if present (keeps screenshots clean); if `WCAG_HIGHLIGHT_BOXES=true`, a second `cy.document()` injects `position:fixed` overlays with impact-colored borders and rule-ID labels over each violation node, then another removes them after the screenshot.
5. `cy.screenshot()` — saved to `cypress/screenshots/ai-analysis/<SESSION_ID>/<scanLabel>.png` (Cypress headless prepends the spec filename; this is handled by the `ai:moveScreenshot` task).
6. Node tasks — `ai:moveScreenshot` → `ai:save` (JSON) → `ai:saveHtml` (per-scan HTML) → `ai:saveCombinedHtml` (regenerated tabbed report + overwrites `latest.html`).

### Node tasks (`cypress.config.js`)

All report I/O runs Node-side via `cy.task()` to stay outside Cypress's browser sandbox:

| Task | Role |
|---|---|
| `ai:log` | Appends a structured event to the in-memory session store |
| `ai:save` | Writes `report.json` |
| `ai:moveScreenshot` | Moves the screenshot from Cypress's staging area into the session report directory |
| `ai:saveHtml` | Generates a per-scan HTML report |
| `ai:saveCombinedHtml` | Regenerates the tabbed combined report from all scans so far; also overwrites `reports/ai-insights/latest.html` with the same content (screenshot paths prefixed with `SESSION_ID/` so they resolve from the parent directory) |
| `ai:checkLink` / `ai:checkLinks` | Node-side HEAD requests (avoids `cy.request` timeout issues) |

### Report generator (`cypress/support/wcag-html-report.js`)

Pure Node module — no external dependencies, no build step. Produces self-contained HTML with all CSS inlined. Two exports:
- `generateWcagHtml(audit, date, screenshotRelPath)` — single-scan standalone file.
- `generateCombinedWcagHtml(scans)` — multi-scan tabbed view; regenerated after each scan so the file is always valid even if Cypress is quit early.

Both delegate to `generateScanBody(audit, date, screenshotRelPath)` for the per-scan content. The shared body is the only place to add new report sections.

**Tab labels** are derived from the page's DOM heading (`h1`, `ion-title`, `h2`), then URL path/hash segment, then page title — designed for Angular hash routing.

**Collapsible sections** — scan bodies are grouped into `<details data-wcag-section="key">` elements. The `sectionWrap(key, title, scRef, badge, isOpen, content, passing)` helper builds each section; the optional 7th arg adds `data-wcag-pass` to mark sections that represent a passing state. Passing sections are hidden when the user enables "Hide passing" in the settings panel.

**`JS_PREFS`** — injected once per HTML document (not per scan body). Persists each section's open/closed state in `localStorage['wcag-section-prefs']` keyed by `data-wcag-section` value.

**Settings panel** — a gear button opens a dark popover with two controls:
- *Hide passing* — checkbox that toggles `display:none` on every `[data-wcag-pass]` element. State saved to `localStorage['wcag-settings'].hidePassing`.
- *Text size* — S / M / L / XL buttons that set `document.documentElement.style.zoom` (0.8 / 1 / 1.3 / 1.7). Inline `font-size` declarations on report elements override CSS inheritance, so only whole-page zoom is effective. State saved to `localStorage['wcag-settings'].textSize`.

In standalone reports the gear button is `position:fixed` (top-right corner). In combined reports it sits in the tab bar (`margin-left:auto`) so it doesn't overlap the page. The settings panel and `JS_SETTINGS` are always injected once per document, never per scan body.

**Violation discipline grouping** — axe violations in the report are grouped into collapsible `<details open>` accordions by designer discipline (Visual → Interaction → Form → Structure → Other), with violations sorted by severity within each group. Each `violationCard` also shows a colored discipline pill. The mapping lives in `DISCIPLINE_MAP` (exact ID lookup) + `getDiscipline(v)` (prefix and WCAG tag fallbacks) in `wcag-html-report.js`. The five discipline colors are defined in `DISCIPLINE_COLORS`.

**Audit timestamp** — the `date` string passed to `generateScanBody` is `YYYY-MM-DD HH:MM:SS` (local time), built in both `ai:saveHtml` and `ai:saveCombinedHtml`. The report header renders it verbatim as `Audited <date>`.

**`latest.html`** — bookmarkable file at `reports/ai-insights/latest.html`. It is a full copy of the combined report (not a redirect), overwritten after every scan. Bookmarking this URL means refreshing after any run shows the newest output.

### Global support files

`cypress/support/e2e.js` loads `commands.js` and `cypress-axe` globally. It calls `cy.injectAxe()` in `beforeEach`, but `ai-exploratory.cy.js` also calls it directly per scan for safety. The `AITestHelper` class (`ai-helper.js`) and its custom commands (`cy.aiLog`, `cy.smartClick`, etc.) are wired globally but are only relevant to the legacy exploratory specs.

### Key constraints

- `numTestsKeptInMemory: 0` in `cypress.config.js` is intentional — prevents Electron from running out of memory during long interactive sessions.
- `screenshotOnRunFailure: false` prevents Cypress from hanging on failure screenshots in headless mode.
- `cy.checkA11y()` must always receive `true` as its 4th argument in this spec to suppress test failures — violations are reported, not asserted.
- `cy.injectAxe()` must be called before every `cy.checkA11y()` call; it is not safe to assume axe persists across Angular route changes.
- `JS_PREFS` and `JS_SETTINGS` are injected once per HTML document, not once per scan body — including them inside `generateScanBody()` would duplicate the scripts in combined reports.
- `sectionWrap()`'s 7th `passing` arg adds `data-wcag-pass`; the settings hide-passing toggle relies on `[data-wcag-pass]` selectors — never add `data-wcag-pass` to failing sections.
- Text size uses `document.documentElement.style.zoom`, not `font-size` — all report text elements have explicit inline `font-size` declarations that override CSS inheritance.
- `__wcag_focus_style__` must be stripped by a `cy.document()` before `cy.screenshot()` in `runAudit()` — the focus highlight is a live navigation aid and must never appear in report images. The amber bar state (`bar.style.background`) is handled by `window.blur`/`window.focus` listeners; `applyBarStyle()` restores the bar on focus return.
- `WCAG_HIGHLIGHT_BOXES` overlays use `position:fixed` (not `absolute`) and `data-wcag-highlight` attribute — `position:fixed` keeps them viewport-aligned at screenshot time; the attribute is the reliable cleanup handle. Always remove overlays in a `cy.document()` immediately after `cy.screenshot()`.
- Do not add new `win.__wcag_action__` values to the control bar — only `'scan'` and `'done'` are polled by `cy.window().should(...)`. Extend the bar with toggles that mutate DOM/styles only.
