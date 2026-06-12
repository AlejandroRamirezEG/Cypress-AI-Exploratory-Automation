'use strict';

// ── shared CSS ────────────────────────────────────────────────────────────────

const CSS_BASE = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b;line-height:1.5;font-size:15px}
  .wrap{max-width:980px;margin:0 auto;padding:36px 24px}
  h2{font-size:17px;font-weight:700;color:#0f172a;margin-bottom:14px}
  details>summary::-webkit-details-marker{display:none}
  details>summary{user-select:none}
  details[open]>summary::after{content:' ▾'}
  details:not([open])>summary::after{content:' ▸'}
  a{color:#2563eb}
  @media print{body{background:#fff}.wrap{padding:12px}details{break-inside:avoid}}
`;

const CSS_TABS = `
  .tab-bar{position:sticky;top:0;z-index:100;background:#fff;border-bottom:2px solid #e2e8f0;display:flex;flex-wrap:wrap;padding:0 16px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .tab-btn{padding:11px 18px;font:600 13px/1 system-ui,sans-serif;cursor:pointer;border:none;background:none;color:#64748b;border-bottom:3px solid transparent;margin-bottom:-2px;display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
  .tab-btn:hover:not(.active){color:#334155;border-bottom-color:#cbd5e1}
  .tab-btn.active{color:#1d4ed8;border-bottom-color:#1d4ed8}
  .panel[hidden]{display:none!important}
  .panel.wrap{padding-top:28px}
`;

// ── rendering helpers ─────────────────────────────────────────────────────────

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Convert a URL path segment or hash segment to a human-readable label.
// "seekers-pool" → "Seekers Pool", "archiveContacts" → "Archive Contacts"
function prettifySegment(seg) {
  return seg
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase → words
    .replace(/[-_]+/g, ' ')               // kebab/snake → spaces
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// Derive a short page label from a scan's collected data.
// Priority: DOM heading (h1/ion-title/h2 captured at scan time)
//         → URL path segment → hash segment (Angular hash routing)
//         → page title → null
function pageLabel(url, title, pageHeading) {
  if (pageHeading && pageHeading.trim()) {
    const h = pageHeading.trim();
    return h.length > 28 ? h.slice(0, 25) + '…' : h;
  }
  try {
    const parsed = new URL(url);
    const pathSeg = parsed.pathname.split('/').filter(Boolean).pop();
    if (pathSeg) return prettifySegment(pathSeg.replace(/\.[^.]+$/, ''));
    // Angular hash routing: /#/seekers-pool
    const hashSeg = parsed.hash.replace(/^#\/?/, '').split('/').filter(Boolean).pop();
    if (hashSeg) return prettifySegment(hashSeg.replace(/\.[^.]+$/, ''));
  } catch {}
  if (title && title.trim()) {
    const t = title.trim();
    return t.length > 28 ? t.slice(0, 25) + '…' : t;
  }
  return null;
}

const IMPACT = {
  critical: { bg: '#fef2f2', border: '#fca5a5', chip: '#dc2626' },
  serious:  { bg: '#fff7ed', border: '#fdba74', chip: '#ea580c' },
  moderate: { bg: '#fefce8', border: '#fde047', chip: '#ca8a04' },
  minor:    { bg: '#eff6ff', border: '#93c5fd', chip: '#2563eb' },
};
const SORT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function chip(impact) {
  const c = IMPACT[impact] || { chip: '#6b7280' };
  return `<span style="background:${c.chip};color:#fff;padding:3px 9px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;white-space:nowrap">${esc(impact)}</span>`;
}

function scTags(tags) {
  return (tags || [])
    .map(t => { const m = t.match(/^wcag(\d)(\d)(\d+)$/); return m ? `SC ${m[1]}.${m[2]}.${m[3]}` : null; })
    .filter(Boolean).join(' · ');
}

function scoreCard(count, label, sub, color) {
  return `<div style="flex:1;min-width:120px;background:#fff;border-radius:10px;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,.08);border-top:4px solid ${color}">
  <div style="font-size:34px;font-weight:800;color:${count === 0 ? '#22c55e' : color};line-height:1">${count}</div>
  <div style="font-weight:700;color:#0f172a;margin-top:4px;font-size:14px">${label}</div>
  <div style="font-size:11px;color:#94a3b8;margin-top:2px">${sub}</div>
</div>`;
}

function landmarkPill(n, tag) {
  const ok = n > 0;
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;background:${ok ? '#dcfce7' : '#fee2e2'};color:${ok ? '#166534' : '#991b1b'}">${ok ? '&#10003;' : '&#10007;'} &lt;${tag}&gt;</span>`;
}

function nodeBlock(n) {
  return `<div style="margin-bottom:10px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <code style="display:block;font-size:11px;white-space:pre-wrap;word-break:break-all;background:#1e293b;color:#e2e8f0;padding:10px 12px;border-radius:4px;margin-bottom:8px;line-height:1.5">${esc(n.html)}</code>
  <div style="font-size:11px;color:#64748b;margin-bottom:6px">Selector: <code style="font-size:11px;background:#f1f5f9;padding:1px 4px;border-radius:3px">${esc((n.target || []).join(', '))}</code></div>
  <pre style="margin:0;font-size:11px;color:#6b7280;white-space:pre-wrap;font-family:inherit;line-height:1.4">${esc(n.failureSummary)}</pre>
</div>`;
}

function violationCard(v) {
  const c = IMPACT[v.impact] || IMPACT.minor;
  const sc = scTags(v.wcag);
  return `<details style="background:${c.bg};border:1px solid ${c.border};border-radius:10px;margin-bottom:12px">
  <summary style="padding:14px 18px;cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    ${chip(v.impact)}
    <code style="font-weight:700;font-size:13px;color:#0f172a">${esc(v.id)}</code>
    <span style="color:#334155;flex:1;min-width:180px;font-size:14px">${esc(v.help)}</span>
    ${sc ? `<span style="font-size:11px;color:#64748b;font-weight:600;white-space:nowrap">${sc}</span>` : ''}
    <span style="font-size:12px;color:${c.chip};font-weight:700;white-space:nowrap">${v.nodeCount} element${v.nodeCount !== 1 ? 's' : ''}</span>
  </summary>
  <div style="padding:4px 18px 18px">
    <p style="color:#475569;margin:0 0 10px;font-size:13px">${esc(v.description)}</p>
    <a href="${esc(v.helpUrl)}" target="_blank" rel="noopener"
       style="display:inline-block;margin-bottom:14px;font-size:13px;color:#2563eb;font-weight:600;text-decoration:none">Learn how to fix &#8594;</a>
    ${(v.nodes || []).map(nodeBlock).join('')}
  </div>
</details>`;
}

function labelTable(rows) {
  if (!rows.length) return `<p style="color:#16a34a;font-size:14px;font-weight:600">None found &#10003;</p>`;

  const COLS = [
    { key: 'formcontrolname', label: 'formcontrolname', mono: true },
    { key: 'name',            label: 'name',            mono: false },
    { key: 'id',              label: 'id',              mono: false },
    { key: 'placeholder',     label: 'placeholder',     mono: false, italic: true },
    { key: 'ariaDescribedby', label: 'aria-describedby',mono: false },
    { key: 'classSnippet',    label: 'classes',         mono: true },
  ];
  const activeCols = COLS.filter(c => rows.some(r => r[c.key]));

  if (!activeCols.length) {
    return `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:12px 14px;font-size:13px;color:#78350f">
  <strong>${rows.length} element${rows.length !== 1 ? 's' : ''} found</strong> with no accessible label, but no identifying attributes
  (no <code>name</code>, <code>id</code>, <code>placeholder</code>, or <code>formcontrolname</code>) were captured.
  The <strong>axe violations section above</strong> contains the HTML snippets and CSS selectors for these elements.
</div>`;
  }

  const th = 'padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px';
  const td = 'padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px';
  return `<table style="width:100%;border-collapse:collapse;font-size:13px">
  <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
    <th style="${th}">Element</th>
    ${activeCols.map(c => `<th style="${th}">${c.label}</th>`).join('')}
    <th style="${th}">#</th>
  </tr></thead>
  <tbody>${rows.map(r => `<tr>
    <td style="${td};font-family:monospace">${esc(r.tag)}${r.type ? `[type="${esc(r.type)}"]` : ''}</td>
    ${activeCols.map(c => {
      const v = r[c.key];
      const style = `${td};${c.italic ? 'font-style:italic;' : ''}color:${v ? '#0f172a' : '#cbd5e1'}`;
      const display = v ? (c.mono ? `<code style="font-size:11px">${esc(v)}</code>` : esc(v)) : '—';
      return `<td style="${style}">${display}</td>`;
    }).join('')}
    <td style="${td};color:#94a3b8">${r.domIndex != null ? r.domIndex : '—'}</td>
  </tr>`).join('')}</tbody>
</table>`;
}

// ── single-scan body (no html/head/body wrapper) ──────────────────────────────

function generateScanBody(audit, date, screenshotRelPath) {
  const { summary: s = {}, violations = [], missingAlt = [], missingLabel = [], negativeFocus = [] } = audit;
  const byImpact = s.byImpact || {};
  const lm = s.landmarks || {};
  const ec = s.elementCounts || {};
  const sortedViolations = [...violations].sort((a, b) => (SORT_ORDER[a.impact] ?? 9) - (SORT_ORDER[b.impact] ?? 9));
  const missingLandmarks = ['nav', 'header', 'footer'].filter(l => !(lm[l] > 0));
  const scanNum = s.scanLabel ? parseInt(s.scanLabel.replace(/^scan-/, ''), 10) : null;

  return `
  <!-- Header -->
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:28px">
    <div style="width:6px;height:48px;border-radius:3px;background:linear-gradient(to bottom,#dc2626,#2563eb);flex-shrink:0"></div>
    <div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
        <h1 style="font-size:22px;font-weight:800;color:#0f172a">WCAG 2.1 AA Accessibility Report</h1>
        ${s.mode === 'interactive'
          ? `<span title="Audited after manual interaction" style="background:#1d4ed8;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.4px;text-transform:uppercase;white-space:nowrap">&#9654; Interactive</span>`
          : `<span title="Audited automatically from URL" style="background:#16a34a;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.4px;text-transform:uppercase;white-space:nowrap">&#9654; Automated</span>`}
        ${scanNum !== null
          ? `<span title="Scan number in this session" style="background:#475569;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.4px;white-space:nowrap">Scan ${scanNum}</span>`
          : ''}
      </div>
      <div style="font-size:13px;color:#64748b">
        <a href="${esc(s.url || '')}" style="color:#2563eb">${esc(s.url || '')}</a>
        &nbsp;·&nbsp; Audited ${esc(date)}
        &nbsp;·&nbsp; Page title: <em>${esc(s.title || '')}</em>
      </div>
    </div>
  </div>

  ${screenshotRelPath ? `<!-- Screenshot -->
  <details open style="margin-bottom:28px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
    <summary style="padding:12px 18px;cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;color:#475569;user-select:none">
      <span style="font-size:16px">&#128444;</span>
      Page screenshot
      <span style="font-weight:400;font-family:monospace;font-size:11px;color:#94a3b8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(screenshotRelPath)}</span>
    </summary>
    <div style="padding:0 18px 16px;text-align:center">
      <img src="${esc(screenshotRelPath)}" alt="Page state at audit time"
           style="max-width:520px;width:100%;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.12);display:inline-block">
    </div>
  </details>` : ''}

  <!-- Score cards -->
  <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:28px">
    ${scoreCard(byImpact.critical || 0, 'Critical',        'axe WCAG Failure',  '#dc2626')}
    ${scoreCard(byImpact.serious  || 0, 'Serious',         'axe WCAG Failure',  '#ea580c')}
    ${scoreCard(byImpact.moderate || 0, 'Moderate',        'axe WCAG Warning',  '#ca8a04')}
    ${scoreCard(byImpact.minor    || 0, 'Minor',           'axe WCAG Advisory', '#2563eb')}
    ${scoreCard(s.missingLabelCount || 0, 'Missing Labels', 'SC 1.3.1 / 4.1.2', '#7c3aed')}
    ${scoreCard(s.missingAltCount   || 0, 'Missing Alt',    'SC 1.1.1',         '#0891b2')}
  </div>

  <!-- Landmark coverage -->
  <div style="background:#fff;border-radius:10px;padding:20px 24px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:28px">
    <h2 style="margin-bottom:10px">Landmark Coverage <span style="font-weight:400;font-size:13px;color:#64748b">WCAG SC 1.3.6 / 2.4.1</span></h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:${missingLandmarks.length ? '12' : '0'}px">
      ${landmarkPill(lm.main,   'main')}
      ${landmarkPill(lm.nav,    'nav')}
      ${landmarkPill(lm.header, 'header')}
      ${landmarkPill(lm.footer, 'footer')}
    </div>
    ${missingLandmarks.length ? `<p style="font-size:12px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;padding:8px 12px;border-radius:6px">
      Missing <strong>${missingLandmarks.map(l => `&lt;${l}&gt;`).join(', ')}</strong> — screen reader users cannot jump directly to these regions. Add semantic elements or <code>role</code> attributes.
    </p>` : ''}
  </div>

  <!-- Violations -->
  <div style="margin-bottom:28px">
    <h2>${sortedViolations.length} Axe Violation${sortedViolations.length !== 1 ? 's' : ''} <span style="font-weight:400;font-size:13px;color:#64748b">(click a row to expand)</span></h2>
    ${sortedViolations.length
      ? sortedViolations.map(violationCard).join('\n')
      : `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:28px;text-align:center;color:#166534;font-size:15px;font-weight:600">No axe violations found &#10003;</div>`}
  </div>

  <!-- Missing input labels -->
  <div style="background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:20px">
    <h2>Inputs Missing Accessible Label <span style="font-weight:400;font-size:13px;color:#64748b">SC 1.3.1 / 4.1.2</span></h2>
    <p style="font-size:13px;color:#64748b;margin-bottom:14px">
      Each input needs a visible <code>&lt;label for&gt;</code>, <code>aria-label</code>, or <code>aria-labelledby</code>.
      A <code>placeholder</code> alone does not count as a label.
    </p>
    ${labelTable(missingLabel)}
  </div>

  ${missingAlt.length ? `<!-- Missing alt text -->
  <div style="background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:20px">
    <h2>Images Missing Alt Text <span style="font-weight:400;font-size:13px;color:#64748b">SC 1.1.1</span></h2>
    <p style="font-size:13px;color:#64748b;margin-bottom:14px">
      Meaningful images need descriptive <code>alt</code> text. Decorative images need <code>alt=""</code>.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">src</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">classes</th>
      </tr></thead>
      <tbody>${missingAlt.map(img => `<tr>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;word-break:break-all">${esc(img.src || '—')}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">${esc(img.classes || '—')}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>` : ''}

  ${negativeFocus.length ? `<!-- Negative tabindex -->
  <div style="background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:20px">
    <h2>Focusable Elements Removed from Tab Order <span style="font-weight:400;font-size:13px;color:#64748b">SC 2.1.1</span></h2>
    <p style="font-size:13px;color:#64748b;margin-bottom:14px">
      These interactive elements have <code>tabindex="-1"</code>. Confirm each is intentionally unreachable via keyboard.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">Element</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">Text</th>
      </tr></thead>
      <tbody>${negativeFocus.map(el => `<tr>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:12px">${esc(el.tag)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">${esc(el.text || '—')}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>` : ''}

  <!-- Element inventory -->
  <div style="background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:20px">
    <h2>Element Inventory</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px">
      ${Object.entries(ec).map(([k, v]) => `<div style="text-align:center;padding:14px 8px;background:#f8fafc;border-radius:8px">
        <div style="font-size:26px;font-weight:800;color:${v > 0 ? '#0f172a' : '#cbd5e1'}">${v}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.3px;margin-top:3px">${esc(k)}</div>
      </div>`).join('')}
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:20px 0 4px;font-size:11px;color:#94a3b8">
    Generated by Cypress axe-core audit &nbsp;·&nbsp; ${esc(date)} &nbsp;·&nbsp;
    <a href="https://www.w3.org/WAI/WCAG21/quickref/" target="_blank" rel="noopener" style="color:#94a3b8">WCAG 2.1 Quick Reference</a>
    &nbsp;·&nbsp;
    <a href="https://dequeuniversity.com/rules/axe/4.11/" target="_blank" rel="noopener" style="color:#94a3b8">axe Rule Library</a>
  </div>`;
}

// ── standalone single-scan report ────────────────────────────────────────────

function generateWcagHtml(audit, date, screenshotRelPath) {
  const { summary: s = {} } = audit;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>WCAG Report — ${esc(s.title || s.url || 'Accessibility Audit')}</title>
  <style>${CSS_BASE}</style>
</head>
<body>
<div class="wrap">
${generateScanBody(audit, date, screenshotRelPath)}
</div>
</body>
</html>`;
}

// ── multi-scan tabbed combined report ─────────────────────────────────────────
// scans: Array<{ audit, date, screenshotRelPath }>
// Regenerated after every scan so an early Cypress exit still leaves a valid file.

function generateCombinedWcagHtml(scans) {
  function tabBtn(scan, i) {
    const s = scan.audit.summary || {};
    const n = s.scanLabel ? parseInt(s.scanLabel.replace(/^scan-/, ''), 10) : i + 1;
    const label = pageLabel(s.url, s.title, s.pageHeading) || `Scan ${n}`;
    const total = s.axeViolations || 0;
    const crit  = (s.byImpact || {}).critical || 0;
    const badge = total === 0
      ? `<span style="font-size:11px;font-weight:600;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:10px">&#10003; clean</span>`
      : `<span style="font-size:11px;font-weight:600;background:${crit ? '#fef2f2' : '#fff7ed'};color:${crit ? '#dc2626' : '#ea580c'};padding:2px 7px;border-radius:10px">${total}${crit ? ` · ${crit} crit` : ''}</span>`;
    return `<button class="tab-btn${i === 0 ? ' active' : ''}" onclick="showTab(${i})" title="Scan ${n} — ${esc(s.url || '')}">${esc(label)} ${badge}</button>`;
  }

  const first = (scans[0] && scans[0].audit.summary) || {};

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>WCAG Report — ${esc(first.title || first.url || 'Accessibility Audit')} (${scans.length} scan${scans.length !== 1 ? 's' : ''})</title>
  <style>${CSS_BASE}${CSS_TABS}</style>
</head>
<body>

<div class="tab-bar">
  ${scans.map(tabBtn).join('\n  ')}
</div>

${scans.map((scan, i) => `<div class="panel wrap" id="panel-${i}"${i > 0 ? ' hidden' : ''}>
${generateScanBody(scan.audit, scan.date, scan.screenshotRelPath)}
</div>`).join('\n')}

<script>
  function showTab(n) {
    document.querySelectorAll('.panel').forEach(function(el, i) { el.hidden = i !== n; });
    document.querySelectorAll('.tab-btn').forEach(function(el, i) { el.classList.toggle('active', i === n); });
    window.scrollTo(0, 0);
  }
</script>

</body>
</html>`;
}

module.exports = { generateWcagHtml, generateCombinedWcagHtml };
