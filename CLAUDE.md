# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                  # install dependencies
pnpm test:ai                  # headless automated scan (CI / quick baseline)
pnpm test:ai_interactive      # interactive Cypress App session (designer walkthrough)
pnpm cy:open                  # open Cypress App without WCAG env set
pnpm cy:run                   # full headless suite (all specs)
```

Target URL is set via `cypress.env.json` (gitignored, create locally):
```json
{ "BASE_URL": "https://your-staging-url.example.com" }
```
Without this file, runs default to `https://www.saucedemo.com`.

## Architecture

The project is a two-mode WCAG 2.1 AA auditor built on Cypress + axe-core. The primary audience is **designers and UX leads** who use the output HTML reports to review accessibility violations. Keep this in mind: UX-first, avoid complexity and feature creep.

### Active spec

`cypress/e2e/ai-driven/ai-exploratory.cy.js` is the **only actively maintained spec**. The specs under `cypress/e2e/exploratory/` (parabank, saucedemo) and all page objects in `cypress/support/page-objects/` are legacy and should not be extended.

### The two modes

**Automated** (`pnpm test:ai`): visits `BASE_URL`, waits for Angular/Ionic to boot, scrolls to flush lazy-rendered components, runs one axe audit, saves all output, exits.

**Interactive** (`pnpm test:ai_interactive`): visits `BASE_URL`, then injects a fixed control bar into the AUT (application under test). The tester navigates the app and clicks **Scan** to audit whatever is on screen, repeating as many times as needed before clicking **Done**. The loop is implemented as a recursive `doScanCycle()` function — each cycle queues its own Cypress commands and calls itself only when the user clicks Scan. The bar communicates clicks back to Cypress via `win.__wcag_action__` (a property set on the AUT's `window`). The bar's top/bottom position is persisted across cycles via a module-level `_barPosition` variable.

### Session isolation

`cypress.config.js:setupNodeEvents` generates a unique `SESSION_ID` (`YYYYMMDD-HHmm-xxxx`) once per Cypress launch and injects it into `config.env`. Every scan within a session writes to `reports/ai-insights/<SESSION_ID>/`. This means parallel runs never overwrite each other and an early Cypress exit still leaves valid output for all completed scans.

### Data flow per scan

1. `cy.injectAxe()` — re-injected each scan because Angular may re-bootstrap between scans.
2. `cy.checkA11y()` — called with `true` as the 4th arg so violations are collected but **do not fail the test**.
3. `cy.document()` — heuristic checks run directly in the browser: missing `alt`, unlabelled inputs, `tabindex="-1"` on interactive elements, landmark presence.
4. `cy.screenshot()` — saved to `cypress/screenshots/ai-analysis/<SESSION_ID>/<scanLabel>.png` (Cypress headless prepends the spec filename; this is handled by the `ai:moveScreenshot` task).
5. Node tasks — `ai:moveScreenshot` → `ai:save` (JSON) → `ai:saveHtml` (per-scan HTML) → `ai:saveCombinedHtml` (regenerated tabbed report).

### Node tasks (`cypress.config.js`)

All report I/O runs Node-side via `cy.task()` to stay outside Cypress's browser sandbox:

| Task | Role |
|---|---|
| `ai:log` | Appends a structured event to the in-memory session store |
| `ai:save` | Writes `report.json` |
| `ai:moveScreenshot` | Moves the screenshot from Cypress's staging area into the session report directory |
| `ai:saveHtml` | Generates a per-scan HTML report |
| `ai:saveCombinedHtml` | Regenerates the tabbed combined report from all scans so far |
| `ai:checkLink` / `ai:checkLinks` | Node-side HEAD requests (avoids `cy.request` timeout issues) |

### Report generator (`cypress/support/wcag-html-report.js`)

Pure Node module — no external dependencies, no build step. Produces self-contained HTML with all CSS inlined. Two exports:
- `generateWcagHtml(audit, date, screenshotRelPath)` — single-scan standalone file.
- `generateCombinedWcagHtml(scans)` — multi-scan tabbed view; regenerated after each scan so the file is always valid even if Cypress is quit early.

Tab labels are derived from the page's DOM heading (`h1`, `ion-title`, `h2`), then URL path/hash segment, then page title — designed for Angular hash routing.

### Global support files

`cypress/support/e2e.js` loads `commands.js` and `cypress-axe` globally. It calls `cy.injectAxe()` in `beforeEach`, but `ai-exploratory.cy.js` also calls it directly per scan for safety. The `AITestHelper` class (`ai-helper.js`) and its custom commands (`cy.aiLog`, `cy.smartClick`, etc.) are wired globally but are only relevant to the legacy exploratory specs.

### Key constraints

- `numTestsKeptInMemory: 0` in `cypress.config.js` is intentional — prevents Electron from running out of memory during long interactive sessions.
- `screenshotOnRunFailure: false` prevents Cypress from hanging on failure screenshots in headless mode.
- `cy.checkA11y()` must always receive `true` as its 4th argument in this spec to suppress test failures — violations are reported, not asserted.
- `cy.injectAxe()` must be called before every `cy.checkA11y()` call; it is not safe to assume axe persists across Angular route changes.
