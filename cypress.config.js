const fs = require('fs');
const path = require('path');
const { generateWcagHtml, generateCombinedWcagHtml } = require('./cypress/support/wcag-html-report');

const { defineConfig } = require('cypress');

// Walk `baseDir` recursively and return the most-recently-modified file whose
// full path (forward-slash normalized) matches `pathRe`.
function findLatestFile(baseDir, pathRe) {
  const hits = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (pathRe.test(full.replace(/\\/g, '/'))) hits.push(full);
    }
  }
  walk(baseDir);
  return hits.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}

// Generate a short human-readable session ID: YYYYMMDD-HHmm-xxxx
// Called once per Cypress launch so all output for a run shares a folder.
function makeSessionId() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const time = `${p(d.getHours())}${p(d.getMinutes())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${date}-${time}-${rand}`;
}

module.exports = defineConfig({
  // Reduce memory footprint across multiple specs to avoid Electron crashes
  numTestsKeptInMemory: 0,
  e2e: {
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.js',
    // Prevent Cypress from auto-capturing screenshots on test failure (can hang on some headless runs)
    screenshotOnRunFailure: false,
    setupNodeEvents(on, config) {
      // In-memory store for AI insights during the run.
      const aiInsights = { tests: [] };

      // Session ID groups all output for this Cypress launch: reports, HTML, screenshots.
      // Stored in config.env so the spec can read it via Cypress.env('SESSION_ID').
      const SESSION_ID = makeSessionId();
      config.env.SESSION_ID = SESSION_ID;

      // reports/ai-insights/<SESSION_ID>/  — all report output for this session
      const SESSION_REPORT_DIR = path.join(process.cwd(), 'reports', 'ai-insights', SESSION_ID);
      // Root of Cypress's screenshots folder — used as the search base for ai:moveScreenshot.
      // cypress run (headless) prepends the spec filename; cypress open does not.
      // We search the whole root by SESSION_ID+scanLabel so both modes work.
      const SCREENSHOTS_ROOT = path.join(process.cwd(), 'cypress', 'screenshots');

      on('task', {
        'ai:log'(payload) {
          try {
            const time = new Date().toISOString();
            aiInsights.tests.push(Object.assign({ time }, payload));
            return null;
          } catch (err) {
            return null;
          }
        },

        'ai:get'() {
          return aiInsights;
        },

        // Persist insights to reports/ai-insights/<SESSION_ID>/report.json
        'ai:save'() {
          try {
            if (!fs.existsSync(SESSION_REPORT_DIR)) fs.mkdirSync(SESSION_REPORT_DIR, { recursive: true });
            const outFile = path.join(SESSION_REPORT_DIR, 'report.json');
            fs.writeFileSync(outFile, JSON.stringify(aiInsights, null, 2));
            return { path: outFile };
          } catch (err) {
            return { error: String(err) };
          }
        },

        // Move a screenshot from Cypress's staging area into SESSION_REPORT_DIR so all
        // session output lives in one folder. Cypress always prepends the spec filename
        // to the screenshot path, preventing direct colocation — this task is the fix.
        // The file is renamed to <scanLabel>.png (dropping any Cypress " (1)" suffix).
        'ai:moveScreenshot'({ scanLabel }) {
          try {
            // Match the full forward-slash path: must contain SESSION_ID somewhere,
            // then eventually end with /<scanLabel>(optional Cypress retry suffix).png.
            // This works whether cypress run (prepends spec name) or cypress open (does not).
            const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pathRe = new RegExp(`${esc(SESSION_ID)}.*/${esc(scanLabel)}(\\s*\\(\\d+\\))?\\.png$`);
            const src = findLatestFile(SCREENSHOTS_ROOT, pathRe);
            if (!src) return { error: `Screenshot not found for ${scanLabel} (session ${SESSION_ID}) under ${SCREENSHOTS_ROOT}` };

            if (!fs.existsSync(SESSION_REPORT_DIR)) fs.mkdirSync(SESSION_REPORT_DIR, { recursive: true });
            const dest = path.join(SESSION_REPORT_DIR, `${scanLabel}.png`);
            fs.renameSync(src, dest);
            return { path: dest };
          } catch (err) {
            return { error: String(err) };
          }
        },

        // Generate a per-scan HTML report.
        // Screenshot is looked up by name directly in SESSION_REPORT_DIR (already moved).
        // Output: reports/ai-insights/<SESSION_ID>/wcag-report-<scanLabel>.html
        'ai:saveHtml'(payload) {
          try {
            const scanLabel = typeof payload === 'object' && payload ? (payload.scanLabel || null) : null;

            const audit = [...aiInsights.tests].reverse().find(t =>
              t.type === 'wcagAudit' &&
              (scanLabel ? t.summary && t.summary.scanLabel === scanLabel : true)
            );
            if (!audit) return { error: 'No wcagAudit entry found; run ai-exploratory.cy.js first' };

            const _d = new Date(), _p = n => String(n).padStart(2, '0');
            const date = `${_d.getFullYear()}-${_p(_d.getMonth()+1)}-${_p(_d.getDate())} ${_p(_d.getHours())}:${_p(_d.getMinutes())}:${_p(_d.getSeconds())}`;

            // Screenshot was moved into SESSION_REPORT_DIR by ai:moveScreenshot.
            // Relative path from the HTML file is just the filename — same directory.
            const screenshotFile = path.join(SESSION_REPORT_DIR, `${scanLabel}.png`);
            const screenshotRelPath = fs.existsSync(screenshotFile) ? `${scanLabel}.png` : null;

            const html = generateWcagHtml(audit, date, screenshotRelPath);
            if (!fs.existsSync(SESSION_REPORT_DIR)) fs.mkdirSync(SESSION_REPORT_DIR, { recursive: true });
            const outFile = path.join(SESSION_REPORT_DIR, `wcag-report-${scanLabel || 'scan'}.html`);
            fs.writeFileSync(outFile, html);
            return { path: outFile, screenshot: screenshotRelPath };
          } catch (err) {
            return { error: String(err) };
          }
        },

        // Regenerate the combined tabbed report from all wcagAudit entries so far.
        // Output: reports/ai-insights/<SESSION_ID>/wcag-report-combined.html
        'ai:saveCombinedHtml'() {
          try {
            const audits = aiInsights.tests.filter(t => t.type === 'wcagAudit');
            if (!audits.length) return { error: 'No wcagAudit entries found' };

            const _d = new Date(), _p = n => String(n).padStart(2, '0');
            const date = `${_d.getFullYear()}-${_p(_d.getMonth()+1)}-${_p(_d.getDate())} ${_p(_d.getHours())}:${_p(_d.getMinutes())}:${_p(_d.getSeconds())}`;

            const scans = audits.map(audit => {
              const scanLabel = audit.summary && audit.summary.scanLabel;
              const screenshotFile = scanLabel && path.join(SESSION_REPORT_DIR, `${scanLabel}.png`);
              const screenshotRelPath = screenshotFile && fs.existsSync(screenshotFile) ? `${scanLabel}.png` : null;
              return { audit, date, screenshotRelPath };
            });

            const html = generateCombinedWcagHtml(scans);
            if (!fs.existsSync(SESSION_REPORT_DIR)) fs.mkdirSync(SESSION_REPORT_DIR, { recursive: true });
            const outFile = path.join(SESSION_REPORT_DIR, 'wcag-report-combined.html');
            fs.writeFileSync(outFile, html);
            return { path: outFile, scanCount: scans.length };
          } catch (err) {
            return { error: String(err) };
          }
        },

        // Node-side link check to avoid cy.request timeouts in the browser
        async 'ai:checkLink'(href) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(href, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
            clearTimeout(timeout);
            return { status: res.status };
          } catch (err) {
            return { error: String(err) };
          }
        },

        async 'ai:checkLinks'(hrefs) {
          const checks = hrefs.map(href => (async () => {
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 8000);
              const res = await fetch(href, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
              clearTimeout(timeout);
              return { href, status: res.status };
            } catch (err) {
              return { href, error: String(err) };
            }
          })());

          const settled = await Promise.allSettled(checks);
          return settled.map(s => (s.status === 'fulfilled' ? s.value : { href: null, error: 'checkFailed' }));
        }
      });

      config.reporter = 'mochawesome';
      config.reporterOptions = {
        reportDir: 'reports/test-results',
        overwrite: false,
        html: true,
        json: true,
        charts: true,
        embeddedScreenshots: true
      };

      return config;
    }
  },
  video: false,
  screenshotsFolder: 'cypress/screenshots',
  pageLoadTimeout: 120000,
  env: {
    BASE_URL: process.env.BASE_URL || 'https://www.saucedemo.com',
    AI_ENABLED: process.env.AI_ENABLED || 'true',
    WCAG_INTERACTIVE: process.env.WCAG_INTERACTIVE || false,
    WCAG_SCAN_TIMEOUT: parseInt(process.env.WCAG_SCAN_TIMEOUT || String(10 * 60 * 1000), 10),
    // SESSION_ID is injected at runtime by setupNodeEvents — do not set a static default here.
  },
  viewportWidth: 1280,
  viewportHeight: 800
});
