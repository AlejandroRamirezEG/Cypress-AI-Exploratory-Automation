# Cypress AI Exploratory Automation

> Automated and interactive WCAG 2.1 AA accessibility auditing for Angular/Ionic SPAs, powered by Cypress and axe-core.

![Cypress](https://img.shields.io/badge/Framework-Cypress%2015-29C5DB?style=for-the-badge)
![axe-core](https://img.shields.io/badge/Audits-WCAG%202.1%20AA-4C51BF?style=for-the-badge)
![Node Tasks](https://img.shields.io/badge/Reports-HTML%20%2B%20JSON-FFA500?style=for-the-badge)

---

## Overview

This project audits Angular/Ionic sign-up and onboarding flows for accessibility violations without touching production code. It runs in two modes:

| Mode | Command | When to use |
|------|---------|-------------|
| **Automated** | `pnpm test:ai` | CI, quick baseline scan, pre-merge checks |
| **Interactive** | `pnpm test:ai_interactive` | Design reviews, multi-state walkthroughs, WCAG audits across page transitions |

Both modes produce the same output — self-contained HTML reports, a JSON data file, and viewport screenshots — grouped into a session folder so results never overwrite each other.

---

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure your target URL (local only)

Create `cypress.env.json` at the project root (this file is gitignored):

```json
{ "BASE_URL": "https://your-staging-url.example.com" }
```

If this file is absent, the suite targets `https://www.saucedemo.com` as a smoke-test default.

### 3. Run

```bash
# Headless, single automated scan
pnpm test:ai

# Interactive via Cypress App (open-ended, multi-scan)
pnpm test:ai_interactive
```

---

## Modes

### Automated (`test:ai`)

```
Visit BASE_URL
  → wait for Angular to boot (up to 20 s)
  → scroll to bottom (flush lazy components)
  → scroll back to top
  → run WCAG audit
  → save report
```

No interaction required. Suitable for CI pipelines.

### Interactive (`test:ai_interactive`)

Opens the Cypress App and injects a control bar into the page under test.

<!-- TODO: Add screenshot of the interactive control bar (top of page, scan/done buttons) -->
![Interactive bar](docs/screenshots/interactive-bar.png)

The bar provides:

| Control | Action |
|---------|--------|
| **Scan** | Runs the WCAG audit against the current page state and saves a report, then loops back for the next scan |
| **Done** | Ends the session cleanly; all completed reports remain on disk |
| **↑ / ↓** | Moves the bar between the top and bottom of the viewport |
| **✕** | Collapses the bar to a small pill in the bottom-right corner; click the pill to restore it |

Navigate the app between scans — each scan captures whatever page state is currently visible. There is no preset scan limit; click **Done** when finished.

---

## Output

All output for a session is grouped under a session folder named `YYYYMMDD-HHmm-xxxx` (generated at Cypress launch):

```
reports/ai-insights/
└── 20260612-1430-a3f9/       ← session folder
    ├── report.json            ← full audit data for all scans
    ├── scan-1.png             ← viewport screenshot
    ├── wcag-report-scan-1.html
    ├── scan-2.png
    ├── wcag-report-scan-2.html
    └── wcag-report-combined.html   ← tabbed view of all scans
```

### AI-Scan HTML report (`wcag-report-combined.html`)

Self-contained, no external dependencies. Includes:

- Summary header: URL, page title, scan mode, violation counts by impact level
- Score cards: critical / serious / moderate / minor violations
- Landmark coverage: `<main>`, `<nav>`, `<header>`, `<footer>` presence
- Axe-core violation cards with affected node snippets and WCAG success criteria
- Missing `alt` text inventory
- Unlabelled form field inventory
- Negative `tabindex` on interactive elements
- Element count inventory (inputs, buttons, links, images, etc.)
- Viewport screenshot (inline, colocated with the HTML file)
- **TABBED VIEW:** See multiple scans in one report (individual scans in `wcag-report-scan-X.html`)

Tabbed view of all scans in the session. Each tab shows the scan number and a violation badge (green "clean" or red count). Regenerated after every scan so it always reflects the latest session state.

<!-- TODO: Add screenshot of wcag-report-combined.html with multiple scan tabs visible -->
<img src="docs/screenshots/wcag-report-combined.png" width="800"/>

### `report.json`

Machine-readable record of all `ai:log` events — structured axe violations, heuristic findings, screenshot steps, and errors. Can be consumed by external tools or a future AI analysis layer.

---

## Audit coverage

Each scan runs axe-core against the following rule sets:

| Tag | Standard |
|-----|----------|
| `wcag2a` | WCAG 2.0 Level A |
| `wcag2aa` | WCAG 2.0 Level AA |
| `wcag21a` | WCAG 2.1 Level A |
| `wcag21aa` | WCAG 2.1 Level AA |
| `best-practice` | axe best-practice rules |

In addition, the spec runs its own heuristic checks independently of axe:

- Images missing `alt` text
- Form inputs with no associated `<label>`, `aria-label`, or `aria-labelledby`
- Interactive elements (`<a>`, `<button>`, `<input>`, etc.) with `tabindex="-1"`
- Landmark region presence (`main`, `nav`, `header`, `footer`)

---

## Project structure

```
cypress-ai-exploratory-automation/
├── cypress.config.js                  # Cypress config, session ID, all Node tasks
├── cypress.env.json                   # Local URL overrides — gitignored, not committed
├── package.json
│
├── cypress/
│   ├── e2e/
│   │   └── ai-driven/
│   │       └── ai-exploratory.cy.js  # Main spec (automated + interactive modes)
│   │
│   ├── support/
│   │   ├── e2e.js                    # Global hooks
│   │   ├── commands.js               # Custom Cypress commands
│   │   └── wcag-html-report.js       # HTML report generator
│   │
│   └── screenshots/                  # Cypress staging area (gitignored)
│       └── ai-analysis/
│           └── <SESSION_ID>/         # Moved to reports/ after each scan
│
└── reports/
    └── ai-insights/
        └── <SESSION_ID>/             # All session output colocated here
            ├── report.json
            ├── scan-N.png
            ├── wcag-report-scan-N.html
            └── wcag-report-combined.html
```

---

## Configuration reference

### Environment variables

Set via `cypress.env.json` (local) or `--env` flag (CLI):

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `https://www.saucedemo.com` | Page to audit |
| `WCAG_INTERACTIVE` | `false` | Set `true` to enable interactive mode |
| `WCAG_SCAN_TIMEOUT` | `600000` | Milliseconds to wait for a button click before timing out (interactive mode) |
| `SESSION_ID` | _(generated)_ | Set automatically by `setupNodeEvents`; do not override manually |

### `cypress.env.json` (local overrides)

```json
{
  "BASE_URL": "https://your-staging-url.example.com",
  "WCAG_SCAN_TIMEOUT": 1800000
}
```

This file is gitignored. Never commit target URLs that should remain private.

---

## Node tasks

Defined in `cypress.config.js`, called via `cy.task()` from the spec:

| Task | Purpose |
|------|---------|
| `ai:log` | Appends a structured event to the in-memory session store |
| `ai:save` | Writes `report.json` to the session report directory |
| `ai:moveScreenshot` | Moves the screenshot from Cypress's staging area into the session report directory |
| `ai:saveHtml` | Generates a per-scan HTML report |
| `ai:saveCombinedHtml` | Regenerates the tabbed combined report from all scans so far |
| `ai:checkLink` | Node-side HEAD request for a single URL |
| `ai:checkLinks` | Parallel HEAD requests for a batch of URLs |

---

## Commands

```bash
pnpm test:ai              # Headless automated scan
pnpm test:ai_interactive  # Interactive Cypress App session
pnpm cy:open              # Open Cypress App (no WCAG env set)
pnpm cy:run               # Full headless suite
```
