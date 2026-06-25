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
//                                  (default: 600000 = 10 min per cycle; 0 = wait indefinitely)
//    WCAG_AXE_TIMEOUT=<ms>         axe.run() internal timeout (default: 30000 = 30s); doubles
//                                  automatically on each timeout failure, capped at 120s
//    BASE_URL=<url>                page to audit
//    WCAG_FAIL_ON_CRITICAL=true    CI gate: fail the test if any critical axe violation is found
//                                  (automated mode only; interactive mode always collects without failing)
//
//  Output per scan: reports/ai-insights/wcag-report-scan-<n>.html
//                   reports/ai-insights/latest-report.json  (all scans appended)

const TARGET_URL = Cypress.env('BASE_URL') || Cypress.config('baseUrl') || 'https://www.saucedemo.com'
const INTERACTIVE = !!Cypress.env('WCAG_INTERACTIVE')
const _SCAN_TIMEOUT_RAW = Cypress.env('WCAG_SCAN_TIMEOUT')
const SCAN_WAIT_MS = (_SCAN_TIMEOUT_RAW === '0' || _SCAN_TIMEOUT_RAW === 0)
  ? Number.MAX_SAFE_INTEGER // indefinite — deadline is ~285 million years from now
  : parseInt(_SCAN_TIMEOUT_RAW || String(10 * 60 * 1000), 10)
// Injected by setupNodeEvents at Cypress launch — groups all output for this session.
const SESSION_ID = Cypress.env('SESSION_ID') || 'no-session'

const HIGHLIGHT_BOXES = !!Cypress.env('WCAG_HIGHLIGHT_BOXES')
const FAIL_ON_CRITICAL = !!Cypress.env('WCAG_FAIL_ON_CRITICAL')

// axe.run() timeout — doubles on each timeout failure, capped at 120 s.
// preload:false (set in cy.checkA11y options) suppresses the cross-origin
// font-CDN XHR fetches that are the primary cause of >4 s timeouts on
// content-heavy pages (axe fetches every @font-face source to inspect CSS rules).
const AXE_TIMEOUT_BASE = parseInt(Cypress.env('WCAG_AXE_TIMEOUT') || '30000', 10)
let _axeTimeoutMs = AXE_TIMEOUT_BASE

// Rule IDs to suppress from axe results. Set via WCAG_IGNORE_RULES in cypress.env.json.
// Cypress auto-merges cypress.env.json into Cypress.env() at startup.
const IGNORE_RULES = (() => {
  const raw = Cypress.env('WCAG_IGNORE_RULES')
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') return raw.split(',').map(s => s.trim()).filter(Boolean)
  return []
})()

const IMPACT_LABEL = {
  critical: 'WCAG Failure — Critical',
  serious: 'WCAG Failure — Serious',
  moderate: 'WCAG Warning — Moderate',
  minor: 'WCAG Advisory — Minor',
}

const HIGHLIGHT_COLORS = {
  critical: '#dc2626',
  serious: '#ea580c',
  moderate: '#d97706',
  minor: '#2563eb',
}

// ── interactive controls (injected into the AUT, not the Cypress runner) ─────

let _barPosition = 'top' // persists across scan cycles

function injectScanControls(win, scanIndex) {
  const doc = win.document

  // Consume failure flag written by the axe timeout handler.
  const prevScanFailed = !!win.__wcag_scan_failed__
  if (prevScanFailed) win.__wcag_scan_failed__ = null

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
  if (prevScanFailed) bar.style.background = '#b45309'

  const msg = doc.createElement('span')
  msg.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
  msg.textContent = scanIndex === 1
    ? '⏸ Set the page to the state you want to audit, then click Scan'
    : `⏸ Scan ${scanIndex - 1} complete — adjust page state for next scan, or click Done to finish`

  const SOLID = 'border:none;border-radius:4px;padding:5px 12px;font:700 12px system-ui,sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0'
  const GHOST = 'border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:5px 10px;font:700 12px system-ui,sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0;background:rgba(255,255,255,.1);color:#fff'

  const scanBtn = doc.createElement('button')
  scanBtn.textContent = prevScanFailed ? '🔄 Retry Scan' : '🔍 Scan'
  scanBtn.setAttribute('style', `${SOLID};background:${prevScanFailed ? '#b45309' : '#2563eb'};color:#fff`)
  scanBtn.addEventListener('click', () => { bar.remove(); win.__wcag_action__ = 'scan' })

  const doneBtn = doc.createElement('button')
  doneBtn.textContent = '✕'
  doneBtn.title = 'End session (all completed reports are saved)'
  doneBtn.setAttribute('style', GHOST)
  doneBtn.addEventListener('click', () => { bar.remove(); win.__wcag_action__ = 'done' })

  // 👁 — toggle a bright :focus outline injected into the AUT so the designer
  // can walk the tab order visually without running a scan.
  // State is derived from the DOM so it survives bar re-injection between cycles.
  let focusActive = !!doc.getElementById('__wcag_focus_style__')
  const focusBtn = doc.createElement('button')
  const FOCUS_ON_MSG = '👁 Focus active — Tab through the page.'
  const FOCUS_OUT_MSG = '⚠ Focus left the page — click anywhere on the page to restore it.'
  function syncFocusBtn() {
    focusBtn.textContent = '👁 Focus'
    focusBtn.title = focusActive ? 'Disable focus highlight' : 'Enable focus highlight (tab through the page)'
    focusBtn.setAttribute('style', focusActive
      ? `${SOLID};background:#7c3aed;color:#fff`
      : GHOST)
  }
  syncFocusBtn()
  const normalMsg = msg.textContent

  if (prevScanFailed) {
    msg.textContent = `⚠ Scan timed out — click 🔄 Retry Scan to try again (axe timeout now ${_axeTimeoutMs / 1000}s), or navigate to a simpler page state.`
  }

  if (focusActive) msg.textContent = FOCUS_ON_MSG

  // window blur/focus tell us when the tester tabs out of the AUT into the
  // Cypress runner — show a contextual nudge only at that moment.
  const onWinBlur = () => { if (!focusActive) return; msg.textContent = FOCUS_OUT_MSG; bar.style.background = '#b45309' }
  const onWinFocus = () => { if (!focusActive) return; msg.textContent = FOCUS_ON_MSG; applyBarStyle() }
  if (focusActive) { win.addEventListener('blur', onWinBlur); win.addEventListener('focus', onWinFocus) }

  focusBtn.addEventListener('click', () => {
    focusActive = !focusActive
    const existing = doc.getElementById('__wcag_focus_style__')
    if (focusActive && !existing) {
      const style = doc.createElement('style')
      style.id = '__wcag_focus_style__'
      // Exclude the control bar and pill — they are audit tools, not part of the AUT.
      style.textContent = '*:focus:not(#__wcag_controls__ *):not(#__wcag_controls__):not(#__wcag_pill__){outline:4px solid #ff007f !important;outline-offset:3px !important}'
      doc.head.appendChild(style)
      msg.textContent = FOCUS_ON_MSG
      win.addEventListener('blur', onWinBlur)
      win.addEventListener('focus', onWinFocus)
    } else if (!focusActive && existing) {
      existing.remove()
      msg.textContent = normalMsg
      win.removeEventListener('blur', onWinBlur)
      win.removeEventListener('focus', onWinFocus)
    }
    syncFocusBtn()
  })

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

  // ⎯ — minimize bar to a pill; Done is placed after this so it sits at the far right
  const hideBtn = doc.createElement('button')
  hideBtn.textContent = '⎯'
  hideBtn.title = 'Minimize (click the restore button to bring bar back)'
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
  bar.appendChild(focusBtn)
  bar.appendChild(moveBtn)
  bar.appendChild(hideBtn)
  bar.appendChild(doneBtn)
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
  // WCAG_SCAN_TIMEOUT=0 sets SCAN_WAIT_MS to Number.MAX_SAFE_INTEGER — effectively indefinite.
  cy.window({ timeout: SCAN_WAIT_MS })
    .should(win => { expect(win.__wcag_action__).to.be.oneOf(['scan', 'done']) })
    .then(win => {
      const action = win.__wcag_action__
      win.__wcag_action__ = null

      if (action === 'scan') {
        cy.wait(300) // guard against scanning mid-animation or mid-Angular digest
        runAudit(`scan-${scanIndex}`)
        doScanCycle(scanIndex + 1)
      }
      // 'done' → no recursive call; test completes cleanly
    })
}

// ── shared audit logic ────────────────────────────────────────────────────────

function runAudit(scanLabel) {
  let scanTimedOut = false

  // Re-inject axe each scan — the page may have navigated or Angular may have
  // re-bootstrapped since the previous scan.
  cy.injectAxe()

  const isAxeTimeoutLike = (e) => {
    const m = String(e && e.message ? e.message : e)
    return (
      m.includes('cy.then() timed out') ||
      m.includes('never resolved') ||
      m.toLowerCase().includes('timed out')
    )
  }

  cy.once('fail', (err) => {
    if (!isAxeTimeoutLike(err)) return err // rethrow non-timeouts
    scanTimedOut = true
    _axeTimeoutMs = Math.min(_axeTimeoutMs * 2, 120000)
    cy.window().then(win => { win.__wcag_scan_failed__ = true })
    cy.log(`[wcag-audit] ${scanLabel} — axe timed out; retry will allow ${_axeTimeoutMs / 1000}s`)
    return false
  })

  // violations[] is captured in this call's closure. cy.document() below runs
  // after cy.checkA11y() completes, so the array is fully populated by then.
  // excludedViolations[] captures rules suppressed by WCAG_IGNORE_RULES so the
  // report can show them in a collapsed footnote section.
  const violations = []
  const excludedViolations = []

  // Extend Cypress's defaultCommandTimeout so axe.run()'s internal Promise is
  // allowed the full _axeTimeoutMs budget instead of the 4 s default.
  // preload:false suppresses cross-origin font-CDN XHR requests (axe fetches
  // every @font-face stylesheet reference by default, producing 100+ requests
  // on content-heavy pages and reliably breaching the 4 s threshold).
  const savedCmdTimeout = Cypress.config('defaultCommandTimeout')
  cy.then(() => { Cypress.config('defaultCommandTimeout', _axeTimeoutMs) })

  cy.checkA11y(
    null,
    {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
      preload: false,
    },
    (axeViolations) => {
      axeViolations.forEach(v => {
        if (IGNORE_RULES.includes(v.id)) {
          excludedViolations.push({
            id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
            wcag: v.tags.filter(t => t.startsWith('wcag')), nodeCount: v.nodes.length,
          })
          return
        }
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

  cy.then(() => { Cypress.config('defaultCommandTimeout', savedCmdTimeout) })

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

    const positiveFocus = Array.from(doc.querySelectorAll('[tabindex]'))
      .filter(el => parseInt(el.getAttribute('tabindex'), 10) > 0)
      .map(el => ({
        tag: el.tagName.toLowerCase(),
        tabindex: parseInt(el.getAttribute('tabindex'), 10),
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 80),
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

    // Typography: flag tiny text (< 12 px, fail) and thin-weight small text
    // (< 16 px at weight ≤ 300, warn) — common Ionic anti-pattern.
    // Scoped to visible text-bearing elements; skips zero-size and hidden nodes.
    const typographyIssues = (() => {
      const dv = doc.defaultView
      if (!dv) return []
      return Array.from(doc.querySelectorAll(
        'button, a[href], label, p, h1, h2, h3, h4, h5, h6, ion-button, ion-label'
      ))
        .map(el => {
          const cs = dv.getComputedStyle(el)
          if (cs.display === 'none' || cs.visibility === 'hidden') return null
          const rect = el.getBoundingClientRect()
          if (!rect.width || !rect.height) return null
          const fontSize = parseFloat(cs.fontSize)
          const fontWeight = parseInt(cs.fontWeight, 10)
          if (!fontSize) return null
          const severity = fontSize < 12 ? 'fail'
            : (fontSize < 16 && fontWeight <= 300) ? 'warn'
              : null
          if (!severity) return null
          const text = (el.textContent || el.getAttribute('aria-label') || '')
            .trim().replace(/\s+/g, ' ').slice(0, 60)
          if (!text) return null
          return { tag: el.tagName.toLowerCase(), text, fontSize: Math.round(fontSize * 10) / 10, fontWeight, severity }
        })
        .filter(Boolean)
    })()

    // Prefers-reduced-motion: scan stylesheets for @keyframes / animation / transition
    // declarations and check for a corresponding @media (prefers-reduced-motion) guard.
    // Cross-origin sheets silently skip (SecurityError on cssRules access).
    const reducedMotion = (() => {
      let hasAnimation = false
      let hasReducedMotionQuery = false
      let keyframeCount = 0
      try {
        const sheets = Array.from(doc.styleSheets)
        for (const sheet of sheets) {
          let rules
          try { rules = Array.from(sheet.cssRules || []) } catch { continue }
          for (const rule of rules) {
            if (rule instanceof CSSKeyframesRule) {
              keyframeCount++
              hasAnimation = true
            } else if (rule instanceof CSSMediaRule) {
              const media = rule.conditionText || (rule.media && rule.media.mediaText) || ''
              if (/prefers-reduced-motion/i.test(media)) {
                hasReducedMotionQuery = true
              }
              try {
                Array.from(rule.cssRules || []).forEach(inner => {
                  if (!inner.style) return
                  const a = inner.style.getPropertyValue('animation') || inner.style.getPropertyValue('animation-name') || ''
                  const t = inner.style.getPropertyValue('transition') || ''
                  if ((a && a !== 'none') || (t && t !== 'none')) hasAnimation = true
                })
              } catch { }
            } else if (rule.style) {
              const a = rule.style.getPropertyValue('animation') || rule.style.getPropertyValue('animation-name') || ''
              const t = rule.style.getPropertyValue('transition') || ''
              if ((a && a !== 'none') || (t && t !== 'none')) hasAnimation = true
            }
          }
        }
      } catch { }
      const status = !hasAnimation ? 'pass' : hasReducedMotionQuery ? 'pass' : 'warn'
      return { hasAnimation, hasReducedMotionQuery, keyframeCount, status }
    })()

    // ARIA misuse: three heuristic checks that complement axe's ARIA rules.
    const ariaIssues = (() => {
      const issues = []
      const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

      // 1. aria-hidden="true" containing focusable children (WCAG SC 4.1.2 / 1.3.1)
      Array.from(doc.querySelectorAll('[aria-hidden="true"]'))
        .filter(el => el.querySelector(FOCUSABLE))
        .slice(0, 10)
        .forEach(el => {
          const n = el.querySelectorAll(FOCUSABLE).length
          issues.push({
            type: 'aria-hidden-focusable',
            severity: 'error',
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role') || null,
            label: el.getAttribute('aria-label') || null,
            visibleText: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
            message: `aria-hidden="true" conceals ${n} focusable child${n !== 1 ? 'ren' : ''} from assistive technology`,
          })
        })

      // 2. Role conflicts with native element semantics
      const ROLE_CONFLICTS = [
        { sel: 'button[role]', nativeRole: 'button', badRoles: ['link', 'menuitem', 'option', 'none', 'presentation'] },
        { sel: 'a[href][role]', nativeRole: 'link', badRoles: ['presentation', 'none'] },
        { sel: 'h1[role],h2[role],h3[role],h4[role],h5[role],h6[role]', nativeRole: 'heading', badRoles: ['presentation', 'none'] },
        { sel: 'input[type="checkbox"][role]', nativeRole: 'checkbox', badRoles: ['button', 'link'] },
        { sel: 'input[type="radio"][role]', nativeRole: 'radio', badRoles: ['button', 'link'] },
      ]
      ROLE_CONFLICTS.forEach(({ sel, nativeRole, badRoles }) => {
        Array.from(doc.querySelectorAll(sel)).slice(0, 20).forEach(el => {
          const role = (el.getAttribute('role') || '').trim().toLowerCase()
          if (!badRoles.includes(role)) return
          issues.push({
            type: 'conflicting-role',
            severity: 'warning',
            tag: el.tagName.toLowerCase(),
            role,
            label: el.getAttribute('aria-label') || null,
            visibleText: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
            message: `Native role "${nativeRole}" overridden by role="${role}" — may confuse assistive technology`,
          })
        })
      })

      // 3. aria-label identical to visible text (redundant, advisory only)
      Array.from(doc.querySelectorAll('[aria-label]')).slice(0, 50).forEach(el => {
        const ariaLabel = (el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')
        const visibleText = (el.textContent || '').trim().replace(/\s+/g, ' ')
        if (!ariaLabel || !visibleText) return
        if (ariaLabel.toLowerCase() === visibleText.toLowerCase()) {
          issues.push({
            type: 'redundant-label',
            severity: 'advisory',
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role') || null,
            label: ariaLabel.slice(0, 80),
            visibleText: visibleText.slice(0, 80),
            message: 'aria-label matches visible text exactly — redundant but not harmful',
          })
        }
      })

      return issues
    })()

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
      positiveFocusCount: positiveFocus.length,
      headingIssueCount: headingIssues.length,
      smallTargetCount: smallTargets.length,
      typographyIssueCount: typographyIssues.length,
      reducedMotionWarning: reducedMotion.status === 'warn' ? 1 : 0,
      ariaIssueCount: ariaIssues.filter(i => i.severity !== 'advisory').length,
      excludedRuleCount: excludedViolations.length,
      landmarks,
      elementCounts: counts,
    }

    cy.log(`[wcag-audit] ${scanLabel} — ${violations.length} violations — ${JSON.stringify(summary.byImpact)}`)
    cy.task('ai:log', { type: 'wcagAudit', summary, violations, excludedViolations, missingAlt, missingLabel, negativeFocus, positiveFocus, smallTargets, headingIssues, typographyIssues, reducedMotion, ariaIssues })
  })

  // Remove focus highlight style before screenshot so it doesn't appear in the report image.
  cy.document().then(doc => {
    const fs = doc.getElementById('__wcag_focus_style__')
    if (fs) fs.remove()
  })

  // Inject violation highlight overlays when WCAG_HIGHLIGHT_BOXES=true.
  // Overlays use position:fixed so they stay viewport-aligned at screenshot time.
  // Each overlay carries a rule-ID label so designers can read violations directly
  // from the screenshot without cross-referencing selectors.
  // Cleaned up immediately after screenshot — never visible to the tester live.
  if (HIGHLIGHT_BOXES) {
    cy.document().then(doc => {
      const seen = new Set()
      violations.forEach(v => {
        const color = HIGHLIGHT_COLORS[v.impact] || '#dc2626';
        (v.nodes || []).forEach(n => {
          const sel = Array.isArray(n.target) && n.target.length
            ? (typeof n.target[n.target.length - 1] === 'string' ? n.target[n.target.length - 1] : null)
            : null
          if (!sel || seen.has(sel)) return
          seen.add(sel)
          try {
            const el = doc.querySelector(sel)
            if (!el) return
            const rect = el.getBoundingClientRect()
            if (!rect.width && !rect.height) return
            const ov = doc.createElement('div')
            ov.setAttribute('data-wcag-highlight', '')
            ov.setAttribute('style', [
              'position:fixed',
              `top:${rect.top}px`, `left:${rect.left}px`,
              `width:${rect.width}px`, `height:${rect.height}px`,
              `border:3px solid ${color}`,
              'z-index:2147483646', 'pointer-events:none', 'box-sizing:border-box',
            ].join(';'))
            const lbl = doc.createElement('span')
            lbl.setAttribute('style', `position:absolute;top:0;left:0;background:${color};color:#fff;font:700 9px/1.4 system-ui,sans-serif;padding:1px 4px;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis`)
            lbl.textContent = v.id
            ov.appendChild(lbl)
            doc.body.appendChild(ov)
          } catch (_) { }
        })
      })
    })
  }

  // Screenshot lives under the session subfolder so it's co-located with its reports.
  // Filename is just the scanLabel (e.g. scan-1.png) — the session folder provides context.
  cy.screenshot(`ai-analysis/${SESSION_ID}/${scanLabel}`, { capture: 'viewport' }).then(
    () => cy.task('ai:log', { type: 'step', step: 'screenshot', details: { name: scanLabel } }),
    (err) => cy.task('ai:log', { type: 'error', message: 'screenshotFailed', detail: String(err) })
  )

  if (HIGHLIGHT_BOXES) {
    cy.document().then(doc => {
      doc.querySelectorAll('[data-wcag-highlight]').forEach(el => el.remove())
    })
  }

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

  cy.task('ai:saveMd', { scanLabel }).then(result => {
    if (result.error) cy.log(`[wcag-audit] ERROR generating MD: ${result.error}`)
    else cy.log(`[wcag-audit] MD → ${result.path}`)
  })

  cy.task('ai:saveCombinedHtml').then(result => {
    if (!result.error) {
      cy.log(`[wcag-audit] Combined report → ${result.path} (${result.scanCount} scan${result.scanCount !== 1 ? 's' : ''})`)
    }
  })

  // CI gate — fires after all reports are saved so the HTML report is always readable
  // even when the build fails. Only in automated mode; interactive sessions never fail.
  if (FAIL_ON_CRITICAL && !INTERACTIVE) {
    cy.then(() => {
      const critical = violations.filter(v => v.impact === 'critical')
      expect(
        critical.length,
        `WCAG CI gate: ${critical.length} critical violation(s) found (${critical.map(v => v.id).join(', ')}). Fix or set WCAG_FAIL_ON_CRITICAL=false to audit without failing.`
      ).to.equal(0)
    })
  }

  // Reset axe timeout to baseline after a successful scan so transient slowness
  // on one page doesn't permanently inflate the budget for subsequent scans.
  cy.then(() => { if (!scanTimedOut) _axeTimeoutMs = AXE_TIMEOUT_BASE })
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
