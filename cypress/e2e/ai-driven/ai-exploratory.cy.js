/// <reference types="cypress" />
// WCAG 2.1 AA Accessibility Audit — two modes:
//
//  AUTOMATED (default)
//    pnpm test:ai
//    Visits BASE_URL, scrolls the full page to flush lazy components, audits once.
//
//  INTERACTIVE (open-ended investigation via cypress open)
//    pnpm test:ai_interactive
//    Visits BASE_URL then shows two in-page buttons:
//      🔍 Scan     — runs axe on the current page state, saves a report, then loops back
//      ✓ Done      — ends the session; all completed reports remain on disk
//    Click Scan as many times as needed — no preset limit.
//    Exiting Cypress at any point is safe: completed scan reports are already saved.
//
//  Env vars:
//    WCAG_INTERACTIVE=true         enable interactive mode (set by test:ai_interactive)
//    WCAG_SCAN_TIMEOUT=<ms>        how long to wait for a button click before timing out
//                                  (default: 600000 = 10 min per cycle)
//    BASE_URL=<url>                page to audit
//
//  Output per scan: reports/ai-insights/wcag-report-scan-<n>.html
//                   reports/ai-insights/latest-report.json  (all scans appended)

const TARGET_URL = Cypress.env('BASE_URL') || Cypress.config('baseUrl') || 'https://www.saucedemo.com'
const INTERACTIVE = !!Cypress.env('WCAG_INTERACTIVE')
const SCAN_WAIT_MS = parseInt(Cypress.env('WCAG_SCAN_TIMEOUT') || String(10 * 60 * 1000), 10)
// Injected by setupNodeEvents at Cypress launch — groups all output for this session.
const SESSION_ID = Cypress.env('SESSION_ID') || 'no-session'

const IMPACT_LABEL = {
  critical: 'WCAG Failure — Critical',
  serious: 'WCAG Failure — Serious',
  moderate: 'WCAG Warning — Moderate',
  minor: 'WCAG Advisory — Minor',
}

// ── interactive controls (injected into the AUT, not the Cypress runner) ─────

let _barPosition = 'top' // persists across scan cycles

function injectScanControls(win, scanIndex) {
  const doc = win.document

  // Remove any controls left from a previous cycle (bar or pill).
  const existing = doc.getElementById('__wcag_controls__')
  if (existing) existing.remove()
  const existingPill = doc.getElementById('__wcag_pill__')
  if (existingPill) existingPill.remove()

  let position = _barPosition // restored from last cycle; toggled by ↑/↓

  const bar = doc.createElement('div')
  bar.id = '__wcag_controls__'

  function applyBarStyle() {
    bar.setAttribute('style', [
      'position:fixed',
      position === 'bottom' ? 'bottom:0' : 'top:0',
      'left:0', 'right:0', 'z-index:2147483647',
      'background:#1e293b', 'color:#fff', 'padding:8px 12px',
      'font:600 13px/1.4 system-ui,sans-serif',
      'display:flex', 'align-items:center', 'gap:10px',
      'box-shadow:0 ' + (position === 'bottom' ? '-2px' : '2px') + ' 10px rgba(0,0,0,.4)',
    ].join(';'))
  }
  applyBarStyle()

  const msg = doc.createElement('span')
  msg.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
  msg.textContent = scanIndex === 1
    ? '⏸ Set the page to the state you want to audit, then click Scan'
    : `⏸ Scan ${scanIndex - 1} complete — adjust page state for next scan, or click Done to finish`

  const SOLID = 'border:none;border-radius:4px;padding:5px 12px;font:700 12px system-ui,sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0'
  const GHOST = 'border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:5px 10px;font:700 12px system-ui,sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0;background:rgba(255,255,255,.1);color:#fff'

  const scanBtn = doc.createElement('button')
  scanBtn.textContent = '🔍 Scan'
  scanBtn.setAttribute('style', `${SOLID};background:#2563eb;color:#fff`)
  scanBtn.addEventListener('click', () => { bar.remove(); win.__wcag_action__ = 'scan' })

  const doneBtn = doc.createElement('button')
  doneBtn.textContent = '✓ Done'
  doneBtn.setAttribute('style', GHOST)
  doneBtn.addEventListener('click', () => { bar.remove(); win.__wcag_action__ = 'done' })

  // ↑ / ↓ — move bar to opposite edge
  const moveBtn = doc.createElement('button')
  moveBtn.setAttribute('style', GHOST)
  function syncMoveBtn() {
    moveBtn.textContent = position === 'bottom' ? '↑' : '↓'
    moveBtn.title = position === 'bottom' ? 'Move to top' : 'Move to bottom'
  }
  syncMoveBtn()
  moveBtn.addEventListener('click', () => {
    position = position === 'bottom' ? 'top' : 'bottom'
    _barPosition = position
    applyBarStyle()
    syncMoveBtn()
  })

  // ✕ — hide bar, show a small restore pill in the corner
  const hideBtn = doc.createElement('button')
  hideBtn.textContent = '✕'
  hideBtn.title = 'Hide (click the restore button to bring bar back)'
  hideBtn.setAttribute('style', GHOST)
  hideBtn.addEventListener('click', () => {
    bar.remove()
    const pill = doc.createElement('button')
    pill.id = '__wcag_pill__'
    pill.textContent = '🔍 WCAG'
    pill.setAttribute('style', [
      'position:fixed', 'bottom:16px', 'right:16px', 'z-index:2147483647',
      'background:#1e293b', 'color:#fff', 'border:none', 'border-radius:20px',
      'padding:7px 16px', 'font:700 12px system-ui,sans-serif',
      'cursor:pointer', 'box-shadow:0 2px 8px rgba(0,0,0,.4)', 'opacity:.9',
    ].join(';'))
    pill.addEventListener('click', () => {
      pill.remove()
      doc.body.appendChild(bar)
    })
    doc.body.appendChild(pill)
  })

  bar.appendChild(msg)
  bar.appendChild(scanBtn)
  bar.appendChild(doneBtn)
  bar.appendChild(moveBtn)
  bar.appendChild(hideBtn)
  doc.body.appendChild(bar)
}

// ── open-ended scan loop ──────────────────────────────────────────────────────
//
// Recursive pattern: each call queues its Cypress commands, and when the user
// clicks Scan the .then() callback queues the next cycle — so the recursion
// unrolls one step at a time during test execution, not all at once.
// The loop terminates when the user clicks Done (no recursive call is made).

function doScanCycle(scanIndex) {
  cy.window().then(win => {
    win.__wcag_action__ = null
    injectScanControls(win, scanIndex)
  })

  cy.log(`[wcag-audit] cycle ${scanIndex} — click 🔍 Scan to audit, ✓ Done to finish`)

  // Poll until either button is clicked. Timeout is per-cycle (default 10 min).
  cy.window({ timeout: SCAN_WAIT_MS })
    .should(win => { expect(win.__wcag_action__).to.be.oneOf(['scan', 'done']) })
    .then(win => {
      const action = win.__wcag_action__
      win.__wcag_action__ = null

      if (action === 'scan') {
        runAudit(`scan-${scanIndex}`)
        doScanCycle(scanIndex + 1)
      }
      // 'done' → no recursive call; test completes cleanly
    })
}

// ── shared audit logic ────────────────────────────────────────────────────────

function runAudit(scanLabel) {
  // Re-inject axe each scan — the page may have navigated or Angular may have
  // re-bootstrapped since the previous scan.
  cy.injectAxe()

  // violations[] is captured in this call's closure. cy.document() below runs
  // after cy.checkA11y() completes, so the array is fully populated by then.
  const violations = []
  cy.checkA11y(
    null,
    { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } },
    (axeViolations) => {
      axeViolations.forEach(v => {
        violations.push({
          id: v.id,
          impact: v.impact,
          label: IMPACT_LABEL[v.impact] || v.impact,
          wcag: v.tags.filter(t => t.startsWith('wcag')),
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          nodeCount: v.nodes.length,
          nodes: v.nodes.slice(0, 5).map(n => ({
            html: n.html,
            target: n.target,
            failureSummary: n.failureSummary,
          })),
        })
      })
    },
    true // do not fail the test — collect and log only
  )

  cy.document().then(doc => {
    const counts = {
      inputs: doc.querySelectorAll('input').length,
      textareas: doc.querySelectorAll('textarea').length,
      selects: doc.querySelectorAll('select').length,
      ionInputs: doc.querySelectorAll('ion-input').length,
      ionSelects: doc.querySelectorAll('ion-select').length,
      ionChecks: doc.querySelectorAll('ion-checkbox').length,
      ionRadios: doc.querySelectorAll('ion-radio').length,
      buttons: doc.querySelectorAll('button, ion-button').length,
      links: doc.querySelectorAll('a[href]').length,
      images: doc.querySelectorAll('img').length,
      forms: doc.querySelectorAll('form').length,
    }

    const missingAlt = Array.from(doc.querySelectorAll('img'))
      .filter(img => !(img.getAttribute('alt') || '').trim())
      .map(img => ({ src: img.src || null, classes: img.className || null }))

    const missingLabel = Array.from(doc.querySelectorAll('input:not([type="hidden"]), textarea, select'))
      .filter(inp => {
        const hasLabel = inp.id && doc.querySelector(`label[for="${inp.id}"]`)
        const hasAria = inp.getAttribute('aria-label') || inp.getAttribute('aria-labelledby')
        return !hasLabel && !hasAria
      })
      .map((inp, idx) => {
        const classes = (inp.className || '').trim().split(/\s+/).filter(c => c && !c.startsWith('ng-')).slice(0, 3).join(' ')
        return {
          tag: inp.tagName.toLowerCase(),
          type: inp.getAttribute('type') || null,
          name: inp.getAttribute('name') || null,
          id: inp.id || null,
          placeholder: inp.getAttribute('placeholder') || null,
          formcontrolname: inp.getAttribute('formcontrolname') || null,
          ariaDescribedby: inp.getAttribute('aria-describedby') || null,
          classSnippet: classes || null,
          domIndex: idx,
        }
      })

    const negativeFocus = Array.from(doc.querySelectorAll('[tabindex="-1"]'))
      .filter(el => ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName))
      .map(el => ({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 80),
      }))

    const headingIssues = (() => {
      const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(el => ({
        level: parseInt(el.tagName[1], 10),
        text: (el.textContent || '').trim().slice(0, 80),
      }))
      const issues = []
      const h1Count = headings.filter(h => h.level === 1).length
      if (h1Count === 0) issues.push({ type: 'missing-h1', message: 'No h1 found on the page', level: null, text: null })
      if (h1Count > 1) issues.push({ type: 'multiple-h1', message: `${h1Count} h1 elements found — only one expected`, level: null, text: null })
      for (let i = 1; i < headings.length; i++) {
        const prev = headings[i - 1]
        const curr = headings[i]
        if (curr.level > prev.level + 1) {
          issues.push({ type: 'level-skip', message: `h${prev.level} → h${curr.level} skips a level`, level: curr.level, text: curr.text })
        }
      }
      return issues
    })()

    const smallTargets = Array.from(
      doc.querySelectorAll('button, a[href], [role="button"], ion-button, input:not([type="hidden"]), ion-input')
    )
      .map(el => {
        const rect = el.getBoundingClientRect()
        const w = Math.round(rect.width)
        const h = Math.round(rect.height)
        const text = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 60)
        return { tag: el.tagName.toLowerCase(), text, w, h, severity: (w < 24 || h < 24) ? 'fail' : 'warn' }
      })
      .filter(({ w, h }) => (w > 0 || h > 0) && (w < 44 || h < 44))

    const landmarks = {
      main: doc.querySelectorAll('main, [role="main"]').length,
      nav: doc.querySelectorAll('nav, [role="navigation"]').length,
      header: doc.querySelectorAll('header, [role="banner"]').length,
      footer: doc.querySelectorAll('footer, [role="contentinfo"]').length,
    }

    // Best-effort page heading: try semantic/ARIA headings first, then Ionic's ion-title.
    // Each querySelector is safe on non-Ionic pages — returns null if absent.
    let pageHeading = null
    for (const sel of ['h1', 'ion-title', '[role="heading"][aria-level="1"]', 'h2']) {
      const el = doc.querySelector(sel)
      if (el) {
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ')
        if (text) { pageHeading = text; break }
      }
    }

    const summary = {
      url: doc.location.href,
      title: doc.title,
      pageHeading,
      mode: INTERACTIVE ? 'interactive' : 'automated',
      scanLabel,
      axeViolations: violations.length,
      byImpact: violations.reduce((acc, v) => { acc[v.impact] = (acc[v.impact] || 0) + 1; return acc }, {}),
      missingAltCount: missingAlt.length,
      missingLabelCount: missingLabel.length,
      negativeFocusCount: negativeFocus.length,
      headingIssueCount: headingIssues.length,
      smallTargetCount: smallTargets.length,
      landmarks,
      elementCounts: counts,
    }

    cy.log(`[wcag-audit] ${scanLabel} — ${violations.length} violations — ${JSON.stringify(summary.byImpact)}`)
    cy.task('ai:log', { type: 'wcagAudit', summary, violations, missingAlt, missingLabel, negativeFocus, smallTargets, headingIssues })
  })

  // Screenshot lives under the session subfolder so it's co-located with its reports.
  // Filename is just the scanLabel (e.g. scan-1.png) — the session folder provides context.
  cy.screenshot(`ai-analysis/${SESSION_ID}/${scanLabel}`, { capture: 'viewport' }).then(
    () => cy.task('ai:log', { type: 'step', step: 'screenshot', details: { name: scanLabel } }),
    (err) => cy.task('ai:log', { type: 'error', message: 'screenshotFailed', detail: String(err) })
  )

  // Move screenshot from cypress/screenshots/…/<SESSION_ID>/ into the session report
  // directory so all session output (JSON, HTML, PNG) is colocated in one folder.
  cy.task('ai:moveScreenshot', { scanLabel }).then(result => {
    if (result.error) cy.log(`[wcag-audit] screenshot move failed: ${result.error}`)
    else cy.log(`[wcag-audit] screenshot → ${result.path}`)
  })

  cy.task('ai:save').then(result => {
    cy.log(result.error ? `[wcag-audit] ERROR saving JSON: ${result.error}` : `[wcag-audit] JSON → ${result.path}`)
  })

  cy.task('ai:saveHtml', { scanLabel }).then(result => {
    if (result.error) {
      cy.log(`[wcag-audit] ERROR generating HTML: ${result.error}`)
    } else {
      cy.log(`[wcag-audit] HTML → ${result.path}${result.screenshot ? ` (screenshot: ${result.screenshot})` : ''}`)
    }
  })

  cy.task('ai:saveCombinedHtml').then(result => {
    if (!result.error) {
      cy.log(`[wcag-audit] Combined report → ${result.path} (${result.scanCount} scan${result.scanCount !== 1 ? 's' : ''})`)
    }
  })
}

// ── spec ─────────────────────────────────────────────────────────────────────

describe('AI Exploratory — WCAG 2.1 AA Accessibility Audit', () => {
  it('WCAG audit', function () {
    cy.visit(TARGET_URL, { failOnStatusCode: false })

    // FAILURE HERE → Angular didn't boot within 20s; check BASE_URL and network access.
    cy.get('input, ion-input, ion-select, select, textarea, button, ion-button', { timeout: 20000 })
      .should('exist')

    if (INTERACTIVE) {
      doScanCycle(1)
    } else {
      // Automated: scroll to flush lazy-rendered below-the-fold components.
      cy.scrollTo('bottom', { ensureScrollable: false, duration: 2000 })
      cy.wait(1500)
      cy.scrollTo('top', { ensureScrollable: false })
      cy.wait(500)
      runAudit('scan-1')
    }
  })
})
